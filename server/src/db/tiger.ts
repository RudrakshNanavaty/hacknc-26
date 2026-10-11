// Tiger Data store: each match record as one jsonb row (cc_matches), and every decision in it as a
// row of a TimescaleDB hypertable (cc_decisions) with its district and coordinates, which feeds a
// real-time continuous aggregate. prepareTiger() applies schema.sql (idempotent) on every start.
import { readFileSync } from 'node:fs';
import pg from 'pg';
import { CARDS, districtById, isDistrictId, type MatchRecord } from '@shared';
import type { MatchStore } from './store';
import { citySnapshotRows, matchSummaryRow } from './derive';

/**
 * Pool options from a connection URL. sslmode is turned into an explicit `ssl` option: node-postgres
 * already verifies the certificate for sslmode=require and warns about it on every connect.
 */
export function poolConfig(url: string): pg.PoolConfig {
  const parsed = new URL(url);
  const sslmode = parsed.searchParams.get('sslmode');
  parsed.searchParams.delete('sslmode');
  return {
    connectionString: parsed.toString(),
    ssl: sslmode && sslmode !== 'disable' ? { rejectUnauthorized: true } : undefined,
    max: 5,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
  };
}

export interface DecisionRow {
  id: string;
  at: string;
  match_id: string;
  round: number | null;
  kind: 'play' | 'move' | 'outcome' | 'preference' | 'twist';
  seat: number | null;
  persona: string | null;
  participant: string | null;
  session_kind: string;
  card: string | null;
  project: string | null;
  proposal_id: string | null;
  district: string | null;
  lon: number | null;
  lat: number | null;
  status: string | null;
  detail: unknown;
}

/** Every decision in a match, flat, with coordinates. */
export function decisionRows(m: MatchRecord): DecisionRow[] {
  const who = (seat: number) => m.players.find((p) => p.seat === seat);
  const place = (district: string | null) => (district && isDistrictId(district) ? districtById(district) : null);
  const row = (r: Omit<DecisionRow, 'match_id' | 'session_kind' | 'persona' | 'participant' | 'lon' | 'lat'>): DecisionRow => {
    const p = r.seat !== null ? who(r.seat) : undefined;
    const d = place(r.district);
    return { ...r, match_id: m.id, session_kind: m.sessionKind, persona: p?.persona ?? null, participant: p?.participant ?? null, lon: d?.center[0] ?? null, lat: d?.center[1] ?? null };
  };
  const out: DecisionRow[] = [];
  for (const r of m.rounds) {
    const at = r.resolvedAt;
    const ev = r.director?.event;
    if (ev) {
      out.push(row({
        id: `${m.id}:twist:r${r.round}`, at, round: r.round, kind: 'twist', seat: null, card: null, project: null, proposal_id: null, district: ev.district,
        status: ev.source, detail: { type: ev.type, title: ev.title, magnitude: ev.magnitude, delta: ev.delta, fictional: true },
      }));
    }
    for (const p of r.proposals.filter((x) => !x.carried)) {
      const card = Object.values(CARDS).find((c) => c.project === p.kind)!.id;
      out.push(row({ id: `${m.id}:play:${p.id}`, at, round: r.round, kind: 'play', seat: p.seat, card, project: p.kind, proposal_id: p.id, district: p.district, status: null, detail: null }));
    }
    for (const a of r.attachments) {
      out.push(row({ id: `${m.id}:play:r${r.round}:${a.seat}`, at, round: r.round, kind: 'play', seat: a.seat, card: a.card, project: null, proposal_id: a.proposalId, district: a.district, status: null, detail: null }));
    }
    for (const n of r.actions) {
      const p = r.proposals.find((x) => x.id === n.proposalId);
      out.push(row({ id: `${m.id}:move:r${r.round}:${n.seat}`, at, round: r.round, kind: 'move', seat: n.seat, card: null, project: p?.kind ?? null, proposal_id: n.proposalId, district: p?.district ?? null, status: n.move, detail: null }));
    }
    for (const o of r.outcomes) {
      out.push(row({
        id: `${m.id}:outcome:${o.proposalId}:r${r.round}`, at, round: r.round, kind: 'outcome', seat: o.seat, card: null, project: o.kind, proposal_id: o.proposalId,
        district: o.district, status: o.status, detail: { support: o.support, opposition: o.opposition, conditions: o.conditions, delta: o.delta, rules: o.rules.map((id) => r.events.find((e) => e.id === id)) },
      }));
    }
  }
  for (const resp of m.responses) {
    out.push(row({ id: `${m.id}:preference:${resp.seat}`, at: resp.at, round: null, kind: 'preference', seat: resp.seat, card: null, project: resp.kind, proposal_id: resp.choice, district: resp.district, status: null, detail: null }));
  }
  return out;
}

const json = (v: unknown) => (v === null || v === undefined ? null : JSON.stringify(v));

const COLS = ['id', 'at', 'match_id', 'round', 'kind', 'seat', 'persona', 'participant', 'session_kind', 'card', 'project', 'proposal_id', 'district', 'lon', 'lat', 'status', 'detail'] as const;

export class TigerStore implements MatchStore {
  readonly kind = 'tiger';
  constructor(readonly pool: pg.Pool) {}

  async save(m: MatchRecord) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO cc_matches (id, started_at, ended_at, updated_at, room_code, session_kind, rules_version, data_version, record)
         VALUES ($1, $2, $3, now(), $4, $5, $6, $7, $8)
         ON CONFLICT (id) DO UPDATE SET ended_at = EXCLUDED.ended_at, updated_at = now(), record = EXCLUDED.record`,
        [m.id, m.startedAt, m.endedAt, m.roomCode, m.sessionKind, m.rulesVersion, m.dataVersion, m],
      );
      await client.query('DELETE FROM cc_decisions WHERE match_id = $1', [m.id]);
      const rows = decisionRows(m);
      if (rows.length) {
        const values = rows.map((_, i) => `(${COLS.map((_c, j) => `$${i * COLS.length + j + 1}`).join(', ')})`).join(', ');
        await client.query(`INSERT INTO cc_decisions (${COLS.join(', ')}) VALUES ${values}`, rows.flatMap((r) => COLS.map((c) => (c === 'detail' ? (r.detail === null ? null : JSON.stringify(r.detail)) : r[c]))));
      }
      // The flat summary and the city after each round: what lists, filters and the final plan read.
      const s = matchSummaryRow(m);
      await client.query(
        `INSERT INTO cc_match_summaries (match_id, room_code, session_kind, started_at, ended_at, completed, rounds, players, winners, scores, viable,
           proposals, approved, stopped, twists, combos, responses, indicators_start, indicators_end, stories, scenario_source, headlines, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22, now())
         ON CONFLICT (match_id) DO UPDATE SET ended_at = EXCLUDED.ended_at, completed = EXCLUDED.completed, rounds = EXCLUDED.rounds, players = EXCLUDED.players,
           winners = EXCLUDED.winners, scores = EXCLUDED.scores, viable = EXCLUDED.viable, proposals = EXCLUDED.proposals, approved = EXCLUDED.approved,
           stopped = EXCLUDED.stopped, twists = EXCLUDED.twists, combos = EXCLUDED.combos, responses = EXCLUDED.responses, indicators_start = EXCLUDED.indicators_start,
           indicators_end = EXCLUDED.indicators_end, stories = EXCLUDED.stories, scenario_source = EXCLUDED.scenario_source, headlines = EXCLUDED.headlines, updated_at = now()`,
        [s.match_id, s.room_code, s.session_kind, s.started_at, s.ended_at, s.completed, s.rounds, JSON.stringify(s.players), json(s.winners), json(s.scores), s.viable,
          s.proposals, s.approved, s.stopped, s.twists, s.combos, s.responses, json(s.indicators_start), json(s.indicators_end), JSON.stringify(s.stories), s.scenario_source, JSON.stringify(s.headlines)],
      );
      await client.query('DELETE FROM cc_city_snapshots WHERE match_id = $1', [m.id]);
      for (const c of citySnapshotRows(m)) {
        await client.query(
          'INSERT INTO cc_city_snapshots (match_id, round, at, final, indicators, built) VALUES ($1, $2, $3, $4, $5, $6)',
          [c.match_id, c.round, c.at, c.final, JSON.stringify(c.indicators), JSON.stringify(c.built)],
        );
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  async get(id: string) {
    const { rows } = await this.pool.query<{ record: MatchRecord }>('SELECT record FROM cc_matches WHERE id = $1', [id]);
    return rows[0]?.record ?? null;
  }

  async list(limit: number) {
    const { rows } = await this.pool.query<{ record: MatchRecord }>('SELECT record FROM cc_matches ORDER BY started_at DESC LIMIT $1', [limit]);
    return rows.map((r) => r.record);
  }

  async close() {
    await this.pool.end();
  }
}

const SCHEMA = readFileSync(new URL('./schema.sql', import.meta.url), 'utf8');

/** schema.sql as single statements (continuous aggregates cannot run in a multi-statement query). */
export function schemaStatements(sql = SCHEMA): string[] {
  return sql
    .split(/;\s*$/m)
    .map((s) => s.replace(/^\s*--.*$/gm, '').trim())
    .filter(Boolean);
}

export async function prepareTiger(pool: pg.Pool) {
  for (const statement of schemaStatements()) await pool.query(statement);
}
