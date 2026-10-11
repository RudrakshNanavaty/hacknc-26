import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import { registerVoice } from './voice';

const AUDIO = Buffer.from('ID3-fake-mp3-bytes');
// Test clips go to a throwaway directory, never the real cache of paid speech.
process.env.TTS_CACHE_DIR = mkdtempSync(join(tmpdir(), 'clash-tts-'));
const unique = () => `Test line ${Math.random().toString(36).slice(2)} for the council.`;

describe('POST /api/tts', () => {
  let calls: { url: string; body: Record<string, unknown> }[] = [];
  beforeEach(() => {
    calls = [];
    process.env.ELEVENLABS_API_KEY = 'test-key';
    for (const k of ['ELEVENLABS_VOICE_MAYOR', 'ELEVENLABS_VOICE_ACTIVIST', 'ELEVENLABS_VOICE_BROADCAST']) delete process.env[k];
    vi.stubGlobal('fetch', async (url: string, init: { body: string }) => {
      calls.push({ url, body: JSON.parse(init.body) });
      return new Response(AUDIO, { status: 200, headers: { 'content-type': 'audio/mpeg' } });
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  const app = () => {
    const a = Fastify();
    registerVoice(a);
    return a;
  };
  const say = (a: ReturnType<typeof app>, text: string, voice?: string) => a.inject({ method: 'POST', url: '/api/tts', payload: { text, voice } });

  it('gives each stakeholder a different voice, and the anchor her own', async () => {
    const a = app();
    const ids = new Set<string>();
    for (const v of ['mayor', 'activist', 'resort', 'resident', 'broadcast']) {
      const r = await say(a, unique(), v);
      expect(r.statusCode).toBe(200);
      expect(r.headers['content-type']).toBe('audio/mpeg');
      ids.add(calls.at(-1)!.url.split('/text-to-speech/')[1]!.split('?')[0]!);
    }
    expect(ids.size).toBe(5);
    await a.close();
  });

  it('answers a repeated line from the cache without another call', async () => {
    const a = app();
    const text = unique();
    const first = await say(a, text, 'mayor');
    expect(first.headers['x-tts-cache']).toBe('miss');
    const n = calls.length;
    const again = await say(a, text, 'mayor');
    expect(again.headers['x-tts-cache']).toBe('hit');
    expect(calls.length).toBe(n);
    await a.close();
  });

  it('uses a voice named in the environment, and falls back when it is refused', async () => {
    process.env.ELEVENLABS_VOICE_ACTIVIST = 'custom-voice-id';
    const a = app();
    await say(a, unique(), 'activist');
    expect(calls.at(-1)!.url).toContain('/custom-voice-id');
    vi.stubGlobal('fetch', async (url: string) => {
      calls.push({ url, body: {} });
      return url.includes('/bad-voice') ? new Response('{"detail":"nope"}', { status: 404 }) : new Response(AUDIO, { status: 200 });
    });
    process.env.ELEVENLABS_VOICE_MAYOR = 'bad-voice';
    const r = await say(a, unique(), 'mayor');
    expect(r.statusCode).toBe(200);
    expect(calls.at(-1)!.url).toContain('/pqHfZKP75CvOlQylNhV4');
    delete process.env.ELEVENLABS_VOICE_ACTIVIST;
    delete process.env.ELEVENLABS_VOICE_MAYOR;
    await a.close();
  });

  it('rejects empty text, treats an unknown voice as the anchor, and stops a runaway client', async () => {
    const a = app();
    expect((await say(a, '   ')).statusCode).toBe(400);
    await say(a, unique(), 'kraken');
    expect(calls.at(-1)!.url).toContain('EXAVITQu4vr4xnSDxMaL');
    let last = 200;
    for (let i = 0; i < 45; i++) last = (await say(a, unique(), 'broadcast')).statusCode;
    expect(last).toBe(429);
    await a.close();
  });

  it('is off, politely, without a key', async () => {
    delete process.env.ELEVENLABS_API_KEY;
    const a = app();
    const r = await say(a, unique());
    expect(r.statusCode).toBe(503);
    await a.close();
  });
});
