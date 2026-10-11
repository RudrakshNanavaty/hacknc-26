// Civic Atlas's API: the saved match records, what they add up to, and exports.
// Every finding is computed in shared/src/game/record.ts and carries references to the records it
// comes from. Gemini may only reword the findings into a short brief (and the brief keeps the refs).
import type { FastifyInstance } from 'fastify';
import {
  CRISIS_KINDS, DATA_METHOD, DATA_SOURCES, DATA_VERSION, DISTRICT_IDS, PREFERENCE_QUESTION, RULES_VERSION, atlasInsights, atlasTables, studioSummary, toCsv, toGeoJson,
  type AtlasFilter, type CrisisKind, type SessionKind,
} from '@shared';
import { decisionRows } from './db/tiger';
import { matchSummaryRow } from './db/derive';
import type { MatchStore } from './db/store';
import type { StudioSnapshots } from './db/snapshots';
import { GROUNDED, type Gemini } from './ai/gemini';
import { strayNumbers } from './ai/narrator';

const LIMIT = 500;
const kindOf = (v: unknown): SessionKind | 'all' => (v === 'demo' || v === 'community' ? v : 'all');
const scenarioOf = (v: unknown): CrisisKind | 'all' => ((CRISIS_KINDS as readonly string[]).includes(String(v)) ? (v as CrisisKind) : 'all');
const areaOf = (v: unknown): string | 'all' => ((DISTRICT_IDS as readonly string[]).includes(String(v)) ? String(v) : 'all');
const csvCell = (v: unknown) => {
  const t = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};

interface AtlasQuery { session?: string; bots?: string; scenario?: string; area?: string }
const filterOf = (q: AtlasQuery): AtlasFilter => ({ sessionKind: kindOf(q.session), humansOnly: q.bots !== 'include', scenario: scenarioOf(q.scenario), district: areaOf(q.area) });

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

  // A short planner's brief from the atlas findings (Gemini rewords; the template stands without it).
  const brief = async (req: { query: AtlasQuery }) => {
    const filter = filterOf(req.query);
    const session = kindOf(req.query.session);
    const matches = await load(session);
    const s = studioSummary(matches);
    const atlas = atlasInsights(matches, filter);
    const findings = atlas.insights.slice(0, 8);
    // Without Gemini the brief is the three best-supported findings, not all of them.
    const template = findings.slice(0, 3).map((f) => f.text).join(' ') || 'No matches recorded yet.';
    const out = (text: string, source: 'gemini' | 'template') => {
      remember(session, s, s, { text, source });
      return { brief: text, source, findings: findings.map((f) => ({ text: f.text, refs: f.refs })) };
    };
    if (!gemini.ready() || !findings.length) return out(template, 'template');
    const facts = {
      findings: findings.map((f) => f.text),
      matches: atlas.scope.matches, cases: atlas.scope.cases, decisions: atlas.scope.decisions,
      note: 'Role-play choices are hypothetical personas, not public opinion. Personal preferences are separate. Findings marked indicative rest on few cases.',
    };
    try {
      const { brief: text } = await gemini.json<{ brief: string }>({
        system: `You write a four-sentence brief for a city planner from findings that many matches of a planning game on Miami Beach data add up to. Keep each figure with its number of cases. Say plainly that role-play choices are not public opinion and that findings on few cases are only indicative.\n${GROUNDED}`,
        prompt: JSON.stringify(facts),
        schema: { type: 'object', properties: { brief: { type: 'string' } }, required: ['brief'] },
        timeoutMs: 8_000,
        check: ({ brief: t }) => (strayNumbers(t, facts).length ? 'numbers not in the findings' : null),
      });
      return out(text, 'gemini');
    } catch {
      return out(template, 'template');
    }
  };
  app.get<{ Querystring: AtlasQuery }>('/api/studio/brief', brief);
  app.get<{ Querystring: AtlasQuery }>('/api/atlas/brief', brief);

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

  // ---------- The atlas: what all the matches add up to ----------

  app.get<{ Querystring: AtlasQuery }>('/api/atlas', async (req) => {
    const filter = filterOf(req.query);
    const matches = await load(filter.sessionKind ?? 'all');
    const insights = atlasInsights(matches, filter);
    return {
      store: store.kind,
      question: PREFERENCE_QUESTION,
      rulesVersion: RULES_VERSION,
      dataVersion: DATA_VERSION,
      dataMethod: DATA_METHOD,
      sources: DATA_SOURCES,
      filter,
      insights,
      matches: matches.map((m) => {
        const s = matchSummaryRow(m);
        return {
          id: m.id, roomCode: m.roomCode, sessionKind: m.sessionKind, startedAt: m.startedAt, endedAt: m.endedAt, players: m.players, rounds: m.rounds.length,
          responses: m.responses.length, winners: s.winners, viable: s.viable, approved: s.approved, stopped: s.stopped, proposals: s.proposals, stories: s.stories,
        };
      }),
    };
  });

  /** Every logged decision as a row (a page of them): the fine-grained record behind the aggregates. */
  app.get<{ Querystring: AtlasQuery & { limit?: string; offset?: string; kind?: string } }>('/api/atlas/decisions', async (req) => {
    const filter = filterOf(req.query);
    const matches = await load(filter.sessionKind ?? 'all');
    const humans = (m: (typeof matches)[number]) => new Set(m.players.filter((p) => filter.humansOnly === false || p.participant === 'human').map((p) => p.seat));
    const rows = matches
      .flatMap((m) => {
        const seats = humans(m);
        const round = new Map(m.rounds.map((r) => [r.round, r.crisis as unknown as { kind?: string } | undefined]));
        return decisionRows(m)
          .filter((d) => d.seat === null || seats.has(d.seat))
          .filter((d) => filter.district === 'all' || d.district === filter.district)
          .filter((d) => filter.scenario === 'all' || (d.round !== null && round.get(d.round)?.kind === filter.scenario))
          .filter((d) => !req.query.kind || d.kind === req.query.kind)
          .map((d) => ({ ...d, crisis: d.round !== null ? round.get(d.round)?.kind ?? null : null }));
      })
      .sort((a, b) => b.at.localeCompare(a.at));
    const limit = Math.min(500, Math.max(1, Number(req.query.limit ?? 100) || 100));
    const offset = Math.max(0, Number(req.query.offset ?? 0) || 0);
    return { total: rows.length, offset, rows: rows.slice(offset, offset + limit) };
  });

  /** One table of the atlas as CSV (places, projects, scenarios, concessions, stakeholders, alliances, rules, insights). */
  app.get<{ Params: { table: string }; Querystring: AtlasQuery }>('/api/atlas/table/:table', async (req, reply) => {
    const filter = filterOf(req.query);
    const tables = atlasTables(atlasInsights(await load(filter.sessionKind ?? 'all'), filter));
    const t = tables[req.params.table];
    if (!t) return reply.code(404).send({ error: `one of ${Object.keys(tables).join(', ')}` });
    const stamp = new Date().toISOString().slice(0, 10);
    return reply
      .header('content-type', 'text/csv; charset=utf-8')
      .header('content-disposition', `attachment; filename="civic-atlas-${req.params.table}-${stamp}.csv"`)
      .send([t.columns, ...t.rows].map((r) => r.map(csvCell).join(',')).join('\n') + '\n');
  });
}
