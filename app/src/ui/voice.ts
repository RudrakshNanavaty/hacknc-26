// ElevenLabs speech through the server (POST /api/tts), fail soft (AGENTS.md rule 4): when the
// server, the key or sound is off, nothing plays and the captions carry the words.
import { create } from 'zustand';
import { audioRunning, loadClip, useSound, type Clip } from './sound';

/** The narrator (briefing), the old single anchor, and the two news channels' anchors. */
export type VoiceName = 'broadcast' | 'narrator' | 'america' | 'bharat' | 'mayor' | 'activist' | 'resort' | 'resident';

const enabled = import.meta.env.VITE_FEATURE_VOICE !== 'false';
const PREF_KEY = 'clash.voice';
const clips = new Map<string, Promise<ArrayBuffer>>();
let health: Promise<boolean> | null = null;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, Math.max(0, ms)));

/** Whether the server can speak (checked once per page). */
function serverVoice(): Promise<boolean> {
  health ??= fetch('/api/health')
    .then((r) => (r.ok ? r.json() : { voice: false }))
    .then((j: { voice?: boolean }) => !!j.voice)
    .catch(() => false);
  return health;
}

function fetchClip(text: string, voice: VoiceName): Promise<ArrayBuffer> {
  const key = `${voice}|${text}`;
  let p = clips.get(key);
  if (!p) {
    p = fetch('/api/tts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text, voice }) }).then((r) => {
      if (!r.ok) throw new Error(`tts ${r.status}`);
      return r.arrayBuffer();
    });
    p.catch(() => clips.delete(key));
    clips.set(key, p);
  }
  return p;
}

/** Whether the player wants to hear voices (remembered; on unless they turned it off). */
export const useVoicePref = create<{ on: boolean; toggle: () => void }>((set, get) => ({
  on: (() => {
    try {
      return localStorage.getItem(PREF_KEY) !== 'off';
    } catch {
      return true;
    }
  })(),
  toggle: () => {
    const on = !get().on;
    set({ on });
    try {
      localStorage.setItem(PREF_KEY, on ? 'on' : 'off');
    } catch {
      // Not remembered; still applies now.
    }
    if (!on) hush();
  },
}));

/** What is being said now, who is saying it (for captions and the anchor's nod), and the clip's loudness. */
export const useVoice = create<{ line: string | null; clip: Clip | null; voice: VoiceName | null }>(() => ({ line: null, clip: null, voice: null }));

/** Start loading lines that will be spoken soon, so they play without a gap. */
export async function prefetchSpeech(lines: string[], voice: VoiceName = 'broadcast') {
  if (!enabled || !useSound.getState().on || !(await serverVoice())) return;
  for (const line of lines) fetchClip(line, voice).catch(() => {});
}

// ---------- One voice at a time ----------

interface Item {
  id: string;
  text: string;
  voice: VoiceName;
  /** Dropped when something newer is waiting and this one has been queued too long. */
  at: number;
}
const queue: Item[] = [];
const spoken = new Set<string>();
let current: { id: string; stop: () => void } | null = null;
let running = false;
/** Lines older than this are not worth saying any more: the moment has passed. */
const STALE_MS = 9_000;

async function pump() {
  if (running) return;
  running = true;
  try {
    while (queue.length) {
      const item = queue.shift()!;
      if (Date.now() - item.at > STALE_MS) continue;
      if (!enabled || !useVoicePref.getState().on || !audioRunning() || !(await serverVoice())) continue;
      try {
        const loaded = await loadClip(await fetchClip(item.text, item.voice));
        if (!loaded || !useVoicePref.getState().on) continue;
        if (Date.now() - item.at > STALE_MS) continue;
        const clip = loaded.play();
        current = { id: item.id, stop: clip.stop };
        useVoice.setState({ line: item.text, clip, voice: item.voice });
        await clip.ended;
      } catch {
        // The server or ElevenLabs is down for this line: the captions and bubbles carry it.
      } finally {
        current = null;
        useVoice.setState({ line: null, clip: null, voice: null });
      }
    }
  } finally {
    running = false;
  }
}

/**
 * Queue a line to be spoken after what is playing. Same id twice: the newer wording replaces the older
 * while it is still waiting (the AI line replacing its template), and is ignored once it has been said.
 */
export function enqueueSpeech(id: string, text: string, voice: VoiceName, { front = false }: { front?: boolean } = {}) {
  if (!enabled || !useVoicePref.getState().on || !text.trim()) return;
  if (spoken.has(id) || current?.id === id) return;
  const waiting = queue.find((q) => q.id === id);
  if (waiting) {
    waiting.text = text;
    return;
  }
  spoken.add(id);
  if (spoken.size > 200) spoken.delete(spoken.values().next().value!);
  const item = { id, text, voice, at: Date.now() };
  if (front) queue.unshift(item);
  else queue.push(item);
  void pump();
}

/** The moment changed: lines still waiting are about something that is over. What is playing finishes. */
export function dropWaitingSpeech() {
  queue.length = 0;
}

/** Stop talking (leaving a phase, muting). */
export function hush() {
  queue.length = 0;
  current?.stop();
  useVoice.setState({ line: null, clip: null, voice: null });
}

/**
 * Say `text` now, replacing whatever is playing. Resolves when it has finished (or at once when
 * there is no voice). Kept for one-off lines; the game itself uses the queue above.
 */
export async function say(text: string, voice: VoiceName = 'broadcast'): Promise<void> {
  hush();
  enqueueSpeech(`say:${Date.now()}:${text}`, text, voice, { front: true });
  while (running || queue.length) await sleep(60);
}
