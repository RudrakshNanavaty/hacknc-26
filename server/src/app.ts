import Fastify from 'fastify';
import { CARDS, CRISES, DATA_METHOD, DATA_SOURCES, DATA_VERSION, DISTRICTS, PERSONA_INFO, RULES_VERSION } from '@shared';
import { type MatchStore, MemoryStore } from './db/store';
import { lanAddresses } from './net';
import { roomServer } from './roomSocket';
import { type Gemini, gemini as defaultGemini } from './ai/gemini';
import { type Narrator, geminiNarrator } from './ai/narrator';
import { registerStudio } from './studio';
import { registerVoice, voiceReady } from './voice';

export interface ServerOptions {
  /** Where match records go. Defaults to memory. */
  store?: MatchStore;
  gemini?: Gemini;
  /** Overrides the Gemini narrator (tests); null turns narration off. */
  narrator?: Narrator | null;
}

/** Builds the server without listening, so tests can inject requests. */
export function buildServer({ store = new MemoryStore(), gemini = defaultGemini, narrator }: ServerOptions = {}) {
  const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? 'info' } });

  app.get('/api/health', async () => ({ ok: true, voice: voiceReady(), ai: gemini.ready(), store: store.kind }));
  registerVoice(app);

  // Where phones join a room: PUBLIC_URL (our domain or a tunnel) when set, else this machine's LAN
  // address. The page adds its own port, since in development it is served by Vite, not here.
  app.get('/api/join-base', async () => ({ publicUrl: process.env.PUBLIC_URL || null, lan: lanAddresses()[0] ?? null }));

  // The rules and the data, as the engine uses them (the "how it works" page and audits).
  app.get('/api/rules', async () => ({ rulesVersion: RULES_VERSION, dataVersion: DATA_VERSION, dataMethod: DATA_METHOD, sources: DATA_SOURCES, districts: DISTRICTS, personas: PERSONA_INFO, cards: CARDS, crises: CRISES }));

  registerStudio(app, store, gemini);

  const rooms = roomServer({ store, narrator: narrator === undefined ? geminiNarrator(gemini) : narrator, log: app.log });
  app.server.on('upgrade', rooms.onUpgrade);
  app.addHook('onClose', async () => {
    await rooms.close();
    await store.close();
  });

  return app;
}
