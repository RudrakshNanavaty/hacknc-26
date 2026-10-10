import Fastify from 'fastify';
import { REEFS, isReefId } from '@shared';
import { type ExperimentStore, MemoryStore } from './db/store';
import { BadExperiment, buildExperiment } from './experiments';
import { registerHeat } from './heat';
import { type DeploymentStore, MemoryDeployments, registerDeployments } from './deployments';
import { lanAddresses } from './net';
import { roomServer } from './roomSocket';
import { type Gemini, gemini as defaultGemini } from './ai/gemini';
import { registerVoice, voiceReady } from './voice';

export interface ServerOptions {
  /** Where experiments go. Defaults to memory. */
  store?: ExperimentStore;
  /** Where deployed devices go. Defaults to memory. */
  deployments?: DeploymentStore;
  gemini?: Gemini;
}

const RECENT_LIMIT = 20;

/** Builds the server without listening, so tests can inject requests. */
export function buildServer({ store = new MemoryStore(), deployments = new MemoryDeployments(), gemini = defaultGemini }: ServerOptions = {}) {
  const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? 'info' } });

  app.get('/api/health', async () => ({ ok: true, voice: voiceReady(), ai: gemini.ready(), store: store.kind }));
  registerVoice(app);
  registerHeat(app);
  registerDeployments(app, deployments);

  // Where phones join a room: PUBLIC_URL (our domain or a tunnel) when set, else this machine's LAN
  // address. The page adds its own port, since in development it is served by Vite, not here.
  app.get('/api/join-base', async () => ({ publicUrl: process.env.PUBLIC_URL || null, lan: lanAddresses()[0] ?? null }));

  app.get('/api/reefs', async () => ({ reefs: REEFS }));

  // A solo test: the server re-evaluates the design; the client's numbers are never stored.
  app.post('/api/experiments', async (req, reply) => {
    try {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const record = buildExperiment({ reef: body.reef, design: body.design, seed: body.seed, playerId: body.playerId, playerName: body.playerName });
      await store.save(record);
      return reply.code(201).send({ id: record.id, result: record.result, store: store.kind });
    } catch (err) {
      if (err instanceof BadExperiment) return reply.code(400).send({ error: 'invalid experiment', problems: err.problems });
      throw err;
    }
  });

  // Research Mode: the reef's newest experiments.
  app.get<{ Querystring: { reef?: string; limit?: string } }>('/api/experiments', async (req, reply) => {
    const reef = req.query.reef ?? 'kaneohe';
    if (!isReefId(reef)) return reply.code(400).send({ error: 'unknown reef' });
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || RECENT_LIMIT));
    return { store: store.kind, reef, experiments: await store.recent(reef, limit) };
  });

  // One experiment, complete enough to re-run (the export).
  app.get<{ Params: { id: string } }>('/api/experiments/:id', async (req, reply) => {
    if (!/^[0-9a-f-]{36}$/.test(req.params.id)) return reply.code(400).send({ error: 'bad id' });
    const experiment = await store.get(req.params.id);
    if (!experiment) return reply.code(404).send({ error: 'not found' });
    return experiment;
  });

  const rooms = roomServer({ store, log: app.log });
  app.server.on('upgrade', rooms.onUpgrade);
  app.addHook('onClose', async () => {
    await rooms.close();
    await store.close();
  });

  return app;
}
