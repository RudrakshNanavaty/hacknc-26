import Fastify from 'fastify';
import { CARDS, COMBOS, CRISIS_KIND_INFO, DATA_METHOD, DATA_SOURCES, DATA_VERSION, DIRECTOR_EVENTS, DISTRICTS, HANDS, PERSONA_INFO, RULES_VERSION, checkSpoken, explainEligibility, explainOutcome, type Explanation } from '@shared';
import { type MatchStore, MemoryStore } from './db/store';
import { lanAddresses } from './net';
import { roomServer } from './roomSocket';
import { type Gemini, gemini as defaultGemini } from './ai/gemini';
import { type Narrator, geminiNarrator } from './ai/narrator';
import { type Director, geminiDirector } from './ai/director';
import { getRoom } from './rooms';
import { registerStudio } from './studio';
import { liveConditions, registerLive } from './live';
import { type ScenarioWriter, geminiScenarioWriter } from './ai/scenario';
import { registerVoice, voiceReady } from './voice';
import { BankMirror } from './bank/mirror';
import type { NessieClient } from './bank/nessie';
import type { BankStore } from './bank/store';

export interface ServerOptions {
  /** Where match records go. Defaults to memory. */
  store?: MatchStore;
  gemini?: Gemini;
  /** Overrides the Gemini narrator (tests); null turns narration off. */
  narrator?: Narrator | null;
  /** Overrides the scenario desk (tests). */
  scenario?: { live: () => Promise<import('@shared').LiveConditions | null>; write: ScenarioWriter };
  /** Overrides the Gemini Game Director (tests); null means templates only. */
  director?: Director | null;
  /**
   * The external bank mirror (Nessie, simulated accounts): off unless given. index.ts builds it from NESSIE_ENABLED;
   * tests pass a fake client, so no test reaches the real API.
   */
  bank?: { client: NessieClient; store: BankStore; retryMs?: number } | null;
}

/** Builds the server without listening, so tests can inject requests. */
export function buildServer({ store = new MemoryStore(), gemini = defaultGemini, narrator, scenario, director, bank = null }: ServerOptions = {}) {
  const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? 'info' } });

  // The mirror reports to the rooms (bound below); it never decides anything and nothing waits on it.
  let onBank: (matchId: string, items: import('@shared').BankSync[]) => void = () => {};
  const mirror = bank ? new BankMirror({ client: bank.client, store: bank.store, log: app.log, onUpdate: (m, items) => onBank(m, items), ...(bank.retryMs !== undefined ? { retryMs: bank.retryMs } : {}) }) : null;

  app.get('/api/health', async () => ({ ok: true, voice: voiceReady(), ai: gemini.ready(), director: director === undefined ? gemini.ready() : director !== null, store: store.kind, bank: mirror ? mirror.status().state : 'off' }));
  // The bank mirror's state (never the key): off, or its host, accounts and open items.
  app.get('/api/bank', async () => (mirror ? mirror.status() : { enabled: false }));
  registerVoice(app);

  // Where phones join a room: PUBLIC_URL (our domain or a tunnel) when set, else this machine's LAN
  // address. The page adds its own port, since in development it is served by Vite, not here.
  app.get('/api/join-base', async () => ({ publicUrl: process.env.PUBLIC_URL || null, lan: lanAddresses()[0] ?? null }));

  // The rules and the data, as the engine uses them (the "how it works" page and audits).
  app.get('/api/rules', async () => ({
    rulesVersion: RULES_VERSION, dataVersion: DATA_VERSION, dataMethod: DATA_METHOD, sources: DATA_SOURCES, districts: DISTRICTS, personas: PERSONA_INFO,
    cards: CARDS, hands: HANDS, combos: COMBOS, crisisKinds: CRISIS_KIND_INFO,
    twists: Object.values(DIRECTOR_EVENTS).map((e) => ({ type: e.type, title: e.title, perMagnitude: e.perMagnitude })),
  }));

  const theDirector = director === undefined ? geminiDirector(gemini) : director;

  // "Why can't I build here?" / "Why was this decided?": the answer comes from the engine and the GIS
  // facts; Gemini may only reword it (number-checked), and the template answers at once without it.
  app.post<{ Body: { kind?: unknown; card?: unknown; district?: unknown; code?: unknown; proposalId?: unknown } }>('/api/explain', async (req, reply) => {
    const b = req.body ?? {};
    let e: Explanation | null = null;
    if (b.kind === 'eligibility') e = explainEligibility(String(b.card ?? ''), String(b.district ?? ''));
    else if (b.kind === 'outcome') {
      try {
        const room = getRoom(String(b.code ?? ''));
        // A delayed proposal is decided again later: explain its latest verdict.
        const h = [...room.history].reverse().find((x) => x.resolution.outcomes.some((o) => o.proposalId === b.proposalId));
        e = h ? explainOutcome(String(b.proposalId), h.resolution.events, h.resolution.outcomes.find((o) => o.proposalId === b.proposalId)) : null;
      } catch {
        e = null;
      }
    }
    if (!e) return reply.code(400).send({ error: 'Nothing to explain.' });
    if (!theDirector) return e;
    try {
      const answer = await theDirector.explain(e);
      return checkSpoken(answer, e) ? e : { ...e, answer, source: 'gemini' };
    } catch {
      return e;
    }
  });

  registerStudio(app, store, gemini);
  registerLive(app);

  const rooms = roomServer({
    store,
    narrator: narrator === undefined ? geminiNarrator(gemini) : narrator,
    scenario: scenario ?? { live: () => liveConditions(), write: geminiScenarioWriter(gemini) },
    director: theDirector,
    bank: mirror,
    log: app.log,
  });
  onBank = rooms.bankUpdate;
  app.server.on('upgrade', rooms.onUpgrade);
  // Pending and uncertain syncs from before a restart (stored when Tiger Data is configured) resume now.
  if (mirror) void mirror.resume();
  app.addHook('onClose', async () => {
    mirror?.close();
    await rooms.close();
    await store.close();
  });

  return Object.assign(app, { mirror });
}
