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
import { registerCardArt } from './cardArt';
import { liveConditions, registerLive } from './live';
import { type ScenarioWriter, geminiScenarioWriter, pickMatchStories, storyScenarioWriter } from './ai/scenario';
import { loadStories } from './stories';
import { devnetChain, loadAuthority } from './solana/chain';
import { type CivicRecord, civicRecord } from './solana/civic';
import { registerCivic } from './solana/routes';
import { FileCivicStore, MemoryCivicStore, type CivicStore } from './solana/store';
import { type Persist, localPersist } from './db/persist';

/** The civic record from .env: on Solana devnet with SOLANA_PAYER_SECRET_KEY, local fingerprints only without. */
function defaultCivic(log: { info: (m: string) => void; warn: (o: unknown, m: string) => void }, civicStore: CivicStore | null): CivicRecord {
  const authority = loadAuthority();
  const chain = authority.key ? devnetChain(authority.key) : null;
  log.info(chain ? `Solana civic record on (devnet), authority ${chain.address}` : `Solana civic record off: ${authority.reason}`);
  return civicRecord({ store: process.env.VITEST ? new MemoryCivicStore() : civicStore ?? new FileCivicStore(), chain, log: { info: (m) => log.info(m), warn: (o, m) => log.warn(o, m) } });
}
import { registerVoice, voiceReady } from './voice';

export interface ServerOptions {
  /** Where match records go. Defaults to memory. */
  store?: MatchStore;
  gemini?: Gemini;
  /** Overrides the Gemini narrator (tests); null turns narration off. */
  narrator?: Narrator | null;
  /** Overrides the scenario desk (tests). */
  scenario?: { live: () => Promise<import('@shared').LiveConditions | null>; write: ScenarioWriter; pick?: () => Promise<import('@shared').CivicStory[]> };
  /** Overrides the Gemini Game Director (tests); null means templates only. */
  director?: Director | null;
  /** Overrides the civic record (tests); null turns it off. */
  civic?: CivicRecord | null;
  /** Where the gameplay timeline, studio history and civic record are stored (default: local only). */
  persist?: Persist;
}

/** Builds the server without listening, so tests can inject requests. */
export function buildServer({ store = new MemoryStore(), gemini = defaultGemini, narrator, scenario, director, civic, persist = localPersist() }: ServerOptions = {}) {
  const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? 'info' } });

  app.get('/api/health', async () => ({ ok: true, voice: voiceReady(), ai: gemini.ready(), director: director === undefined ? gemini.ready() : director !== null, store: store.kind }));
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

  registerStudio(app, store, gemini, persist.snapshots);
  if (!process.env.VITEST && !scenario) void loadStories(app.log); // the first match should not wait on Snowflake
  const cardArt = registerCardArt(app, gemini, { dir: process.env.VITEST ? null : undefined });
  // The lobby's example cards are generic and never change: paint them once, in the background, at start.
  if (!process.env.VITEST) setTimeout(() => cardArt.warmExamples(), 1_500).unref();
  app.get('/api/db/status', async () => ({ ...(await persist.status(store.kind)), pendingMatches: 'pending' in store ? (store as { pending(): number }).pending() : 0 }));
  registerLive(app);

  // The civic record on Solana devnet (ported from Mayday Mayor): the team key is the demo authority.
  const theCivic = civic === undefined ? defaultCivic(app.log, persist.civicStore) : civic;
  if (theCivic) registerCivic(app, theCivic);

  // The reviewed civic stories a match can draw from (Snowflake, or its cache), with sources and casts.
  app.get('/api/stories', async () => {
    const feed = await loadStories(app.log);
    return { source: feed.source, fetchedAt: feed.fetchedAt, count: feed.stories.length, stories: feed.stories };
  });

  const rooms = roomServer({
    store,
    narrator: narrator === undefined ? geminiNarrator(gemini) : narrator,
    // Real civic stories from Snowflake drive each match; the live-readings desk stands in without them.
    scenario: scenario ?? {
      live: () => liveConditions(),
      write: storyScenarioWriter(gemini, async () => (await loadStories(app.log)).stories, geminiScenarioWriter(gemini)),
      pick: () => pickMatchStories(async () => (await loadStories(app.log)).stories),
    },
    director: theDirector,
    civic: theCivic,
    events: persist.events,
    art: cardArt,
    log: app.log,
  });
  app.server.on('upgrade', rooms.onUpgrade);
  app.addHook('onClose', async () => {
    await rooms.close();
    theCivic?.close();
    await persist.close();
    await store.close();
  });

  return app;
}
