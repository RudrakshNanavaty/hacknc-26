// Planning Studio's API: the saved match records, what they add up to, and exports.
// Every finding is computed in shared/src/game/record.ts and carries references to the records it
// comes from. Gemini may only reword the findings into a short brief (and the brief keeps the refs).
import type { FastifyInstance } from 'fastify';
import { DATA_METHOD, DATA_SOURCES, DATA_VERSION, PREFERENCE_QUESTION, RULES_VERSION, studioSummary, toCsv, toGeoJson, type SessionKind } from '@shared';
import type { MatchStore } from './db/store';
import type { StudioSnapshots } from './db/snapshots';
import { GROUNDED, type Gemini } from './ai/gemini';
import { strayNumbers } from './ai/narrator';

const LIMIT = 500;
const kindOf = (v: unknown): SessionKind | 'all' => (v === 'demo' || v === 'community' ? v : 'all');

export function registerStudio(app: FastifyInstance, store: MatchStore, gemini: Gemini, snapshots?: StudioSnapshots) {
  // The summary (and the brief) are saved when what they cover changes: one row per state of the data.
  const saved = new Map<string, { key: string; brief: boolean }>();
  const remember = (session: string, s: { matches: number; responses: number }, summary: unknown, brief?: { text: string; source: string }) => {
    if (!snapshots || !s.matches) return;
    const key = `${s.matches}:${s.responses}`;
    const was = saved.get(session);
    if (was?.key === key && (was.brief || !brief)) return;
    saved.set(session, { key, brief: !!brief || (was?.key === key && was.brief) });
    snapshots
      .save({ sessionKind: session, matches: s.matches, responses: s.responses, summary, brief: brief?.text ?? null, briefSource: brief?.source ?? null })
      .catch((err) => app.log.warn({ err }, 'studio snapshot not saved'));
  };
  const load = async (session: SessionKind | 'all') => (await store.list(LIMIT)).filter((m) => session === 'all' || m.sessionKind === session);

  app.get<{ Querystring: { session?: string; bots?: string } }>('/api/studio', async (req) => {
    const session = kindOf(req.query.session);
    const matches = await load(session);
    const summary = studioSummary(matches, { humansOnly: req.query.bots !== 'include' });
    if (req.query.bots !== 'include') remember(session, summary, summary);
    return {
      store: store.kind,
      question: PREFERENCE_QUESTION,
      rulesVersion: RULES_VERSION,
      dataVersion: DATA_VERSION,
      dataMethod: DATA_METHOD,
      sources: DATA_SOURCES,
      summary,
      matches: matches.map((m) => ({
        id: m.id, roomCode: m.roomCode, sessionKind: m.sessionKind, startedAt: m.startedAt, endedAt: m.endedAt,
        players: m.players, rounds: m.rounds.length, responses: m.responses.length, winners: m.final?.winners ?? null,
      })),
    };
  });

  app.get<{ Params: { id: string } }>('/api/matches/:id', async (req, reply) => {
    if (!/^[0-9a-f-]{36}$/.test(req.params.id)) return reply.code(400).send({ error: 'bad id' });
    const m = await store.get(req.params.id);
    return m ?? reply.code(404).send({ error: 'not found' });
  });

  app.get<{ Params: { format: string }; Querystring: { session?: string } }>('/api/studio/export.:format', async (req, reply) => {
    const matches = await load(kindOf(req.query.session));
    const stamp = new Date().toISOString().slice(0, 10);
    if (req.params.format === 'json') {
      return reply.header('content-disposition', `attachment; filename="coastal-clash-${stamp}.json"`)
        .send({ exportedAt: new Date().toISOString(), rulesVersion: RULES_VERSION, dataVersion: DATA_VERSION, sources: DATA_SOURCES, question: PREFERENCE_QUESTION, matches });
    }
    if (req.params.format === 'csv') {
      return reply.header('content-type', 'text/csv; charset=utf-8').header('content-disposition', `attachment; filename="coastal-clash-${stamp}.csv"`).send(toCsv(matches));
    }
    if (req.params.format === 'geojson') {
      return reply.header('content-type', 'application/geo+json').header('content-disposition', `attachment; filename="coastal-clash-${stamp}.geojson"`).send(toGeoJson(matches));
    }
    return reply.code(404).send({ error: 'json, csv or geojson' });
  });

  // A short planner's brief from the computed findings (Gemini rewords; the template stands without it).
  app.get<{ Querystring: { session?: string } }>('/api/studio/brief', async (req) => {
    const session = kindOf(req.query.session);
    const s = studioSummary(await load(session));
    const template = s.findings.map((f) => f.text).join(' ') || 'No matches recorded yet.';
    if (!gemini.ready() || !s.findings.length) {
      remember(session, s, s, { text: template, source: 'template' });
      return { brief: template, source: 'template', findings: s.findings };
    }
    const facts = { findings: s.findings.map((f) => f.text), matches: s.matches, responses: s.responses, note: 'Role-play choices are hypothetical personas, not public opinion. Personal preferences are separate.' };
    try {
      const { brief } = await gemini.json<{ brief: string }>({
        system: `You write a three-sentence brief for a city planner from findings about a planning game played on Miami Beach data. Say plainly that role-play choices are not public opinion.\n${GROUNDED}`,
        prompt: JSON.stringify(facts),
        schema: { type: 'object', properties: { brief: { type: 'string' } }, required: ['brief'] },
        timeoutMs: 8_000,
        check: ({ brief }) => (strayNumbers(brief, facts).length ? 'numbers not in the findings' : null),
      });
      remember(session, s, s, { text: brief, source: 'gemini' });
      return { brief, source: 'gemini', findings: s.findings };
    } catch {
      remember(session, s, s, { text: template, source: 'template' });
      return { brief: template, source: 'template', findings: s.findings };
    }
  });

  // Saved summaries and briefs, newest first: how the findings changed as matches came in.
  app.get<{ Querystring: { session?: string; limit?: string } }>('/api/studio/history', async (req) => {
    const session = kindOf(req.query.session);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 20) || 20));
    const rows = snapshots ? await snapshots.history(limit, session === 'all' ? undefined : session).catch((err) => {
      app.log.warn({ err }, 'studio history unavailable');
      return [];
    }) : [];
    return { store: snapshots?.kind ?? 'none', snapshots: rows };
  });
}
