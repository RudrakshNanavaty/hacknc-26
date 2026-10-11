// The database layer without a database: a fake pool records the SQL, and the rows come from a real
// finished match (bots through three rounds), so the derivations are checked against the engine's own record.
import type pg from 'pg';
import { describe, expect, it } from 'vitest';
import { authoredScenario, type MatchRecord, type PersonaId } from '@shared';
import { buildServer } from '../app';
import { applyScenario, done, getOrCreateRoom, join, rooms, setBot, skip, start } from '../rooms';
import { MemoryCivicStore, type MatchProof } from '../solana/store';
import { failSoftCivic } from '../solana/tiger-store';
import { citySnapshotRows, matchSummaryRow } from './derive';
import { TigerEventLog, type GameEvent } from './events';
import { MemoryStore, failSoft } from './store';
import { localPersist } from './persist';
import { TigerStore, schemaStatements } from './tiger';

function finishedMatch(): MatchRecord {
  rooms.delete('DBTX');
  const room = getOrCreateRoom('DBTX', 0, 'legacy');
  const host = join(room, 'Ana', 'mayor');
  for (const p of ['activist', 'resort', 'resident'] as PersonaId[]) setBot(room, host, p, true);
  start(room, host, 1);
  applyScenario(room, authoredScenario(null), 2);
  for (let t = 3; room.phase !== 'final' && t < 300; t++) {
    if (room.phase === 'negotiate' || room.phase === 'resolve') done(room, host, t);
    else skip(room, host, t);
  }
  expect(room.record?.final).toBeTruthy();
  return room.record!;
}

class FakePool {
  statements: { sql: string; params: unknown[] }[] = [];
  failing = false;
  async query(sql: string, params: unknown[] = []) {
    if (this.failing) throw new Error('database is down');
    this.statements.push({ sql, params });
    return { rows: [] as unknown[] };
  }
  async connect() {
    return { query: (sql: string, params?: unknown[]) => this.query(sql, params), release() {} };
  }
}
const asPool = (p: FakePool) => p as unknown as pg.Pool;

describe('derived rows', () => {
  const m = finishedMatch();

  it('one summary per match, adding up the rounds', () => {
    const s = matchSummaryRow(m);
    expect(s).toMatchObject({ match_id: m.id, completed: true, rounds: 3, session_kind: m.sessionKind });
    const outcomes = m.rounds.flatMap((r) => r.outcomes);
    expect(s.approved + s.stopped).toBe(outcomes.length);
    expect(s.approved).toBe(outcomes.filter((o) => o.status === 'approved').length);
    expect(s.indicators_start).toEqual(m.rounds[0]!.before);
    expect(s.indicators_end).toEqual(m.rounds[2]!.after);
    expect(s.winners).toEqual(m.final!.winners);
    expect((s.headlines as unknown[]).length).toBe(3);
  });

  it('the city after each round, the last one flagged as the finished plan', () => {
    const rows = citySnapshotRows(m);
    expect(rows.map((r) => r.round)).toEqual([1, 2, 3]);
    expect(rows.map((r) => r.final)).toEqual([false, false, true]);
    expect(rows[2]!.indicators).toEqual(m.final!.indicators);
    // What is built only grows, and is exactly the approved outcomes so far.
    const approved = m.rounds.flatMap((r) => r.outcomes.filter((o) => o.status === 'approved'));
    expect(rows[2]!.built).toHaveLength(approved.length);
    expect(rows[0]!.built.length).toBeLessThanOrEqual(rows[2]!.built.length);
  });

  it('an unfinished match is a summary that is not complete and has no final city', () => {
    const partial = { ...m, final: null, endedAt: null, rounds: m.rounds.slice(0, 1) } as MatchRecord;
    expect(matchSummaryRow(partial)).toMatchObject({ completed: false, winners: null, viable: null, rounds: 1 });
    expect(citySnapshotRows(partial).some((r) => r.final)).toBe(false);
  });
});

describe('TigerStore.save', () => {
  it('writes the record, the decisions, the summary and the city snapshots in one transaction', async () => {
    const m = finishedMatch();
    const pool = new FakePool();
    await new TigerStore(asPool(pool)).save(m);
    const sql = pool.statements.map((s) => s.sql);
    expect(sql[0]).toBe('BEGIN');
    expect(sql.at(-1)).toBe('COMMIT');
    expect(sql.some((s) => s.includes('INTO cc_matches'))).toBe(true);
    expect(sql.some((s) => s.includes('INTO cc_decisions'))).toBe(true);
    expect(sql.some((s) => s.includes('INTO cc_match_summaries'))).toBe(true);
    expect(sql.filter((s) => s.includes('INTO cc_city_snapshots'))).toHaveLength(m.rounds.length);
  });

  it('rolls back when a write fails', async () => {
    const m = finishedMatch();
    const pool = new FakePool();
    const real = pool.query.bind(pool);
    pool.query = async (sql: string, params?: unknown[]) => {
      if (sql.includes('cc_match_summaries')) throw new Error('boom');
      return real(sql, params);
    };
    await expect(new TigerStore(asPool(pool)).save(m)).rejects.toThrow('boom');
    expect(pool.statements.at(-1)!.sql).toBe('ROLLBACK');
  });
});

describe('the schema', () => {
  it('has every table the code writes, as single statements', () => {
    const all = schemaStatements().join('\n');
    for (const t of ['cc_matches', 'cc_decisions', 'cc_events', 'cc_match_summaries', 'cc_city_snapshots', 'cc_studio_snapshots', 'cc_civic_matches', 'cc_civic_anchors']) {
      expect(all).toContain(`CREATE TABLE IF NOT EXISTS ${t}`);
    }
    for (const s of schemaStatements()) expect(s).not.toMatch(/;\s*\S/);
    expect(all).toContain("create_hypertable('cc_events'");
  });
});

describe('the gameplay timeline', () => {
  const event = (kind: string): GameEvent => ({ at: new Date().toISOString(), roomCode: 'ABCD', matchId: null, round: 1, phase: 'select', kind, seat: 0, persona: 'mayor', bot: false, payload: { card: 'x' } });
  const log = { warn() {} };

  it('buffers events and writes them in batches', async () => {
    const pool = new FakePool();
    const l = new TigerEventLog(asPool(pool), log, 60_000);
    for (let i = 0; i < 450; i++) l.record(event('select'));
    await l.close();
    expect(pool.statements.map((s) => (s.params as unknown[]).length / 10)).toEqual([200, 200, 50]);
    expect(pool.statements[0]!.sql).toContain('INSERT INTO cc_events');
  });

  it('keeps events through an outage and writes them when the database is back', async () => {
    const pool = new FakePool();
    const l = new TigerEventLog(asPool(pool), log, 60_000);
    pool.failing = true;
    l.record(event('done'));
    await l.flush();
    expect(pool.statements).toHaveLength(0);
    pool.failing = false;
    await l.close();
    expect(pool.statements).toHaveLength(1);
  });
});

describe('the civic record in the database', () => {
  const proof = (id: string): MatchProof => ({ matchId: id, input: {} as never, fingerprint: 'f', anchorId: null, proof: null, memo: null });
  const down = new Proxy({} as MemoryCivicStore, { get: () => async () => { throw new Error('database is down'); } }) as unknown as MemoryCivicStore;

  it('falls back to the local copy when the database errors, so a match is never lost', async () => {
    const local = new MemoryCivicStore();
    const store = failSoftCivic(down, local, { warn() {} });
    await store.saveMatch(proof('a'));
    expect((await store.match('a'))?.matchId).toBe('a');
    expect(await store.unanchored(10)).toHaveLength(1);
    expect(await local.match('a')).not.toBeNull();
  });
});

describe('studio history', () => {
  it('saves a summary when the data it covers changes, and lists them newest first', async () => {
    const store = new MemoryStore();
    await store.save(finishedMatch());
    const persist = localPersist();
    const app = buildServer({ store, persist, narrator: null, director: null, civic: null });
    await app.inject('/api/studio');
    await app.inject('/api/studio'); // same data: no second snapshot
    let h = (await app.inject('/api/studio/history')).json() as { snapshots: { matches: number }[] };
    expect(h.snapshots).toHaveLength(1);
    expect(h.snapshots[0]!.matches).toBe(1);
    await app.inject('/api/studio/brief'); // adds the brief to the same state
    h = (await app.inject('/api/studio/history')).json();
    expect(h.snapshots.length).toBeGreaterThanOrEqual(1);
    const status = (await app.inject('/api/db/status')).json() as { store: string; events: string };
    expect(status).toMatchObject({ store: 'memory', events: 'off' });
    await app.close();
  });
});

describe('a database that is down, then back', () => {
  it('keeps every match locally, retries on the next success and backfills with sync()', async () => {
    const m = finishedMatch();
    const other = { ...m, id: 'b'.repeat(8) + '-0000-4000-8000-' + 'c'.repeat(12) } as MatchRecord;
    const remote = new MemoryStore();
    let up = false;
    const flaky = {
      kind: 'tiger' as const,
      save: async (x: MatchRecord) => {
        if (!up) throw new Error('timeout');
        await remote.save(x);
      },
      get: async (id: string) => {
        if (!up) throw new Error('timeout');
        return remote.get(id);
      },
      list: async (n: number) => {
        if (!up) throw new Error('timeout');
        return remote.list(n);
      },
      close: async () => {},
    };
    const store = failSoft(flaky, { warn() {} }, new MemoryStore());
    await store.save(m);
    expect(store.pending()).toBe(1);
    expect((await store.get(m.id))?.id).toBe(m.id); // answered locally
    expect(await store.list(10)).toHaveLength(1);
    up = true;
    await store.save(other); // success: the earlier one is retried too
    await new Promise((r) => setTimeout(r, 10));
    expect(store.pending()).toBe(0);
    expect((await remote.list(10)).map((x) => x.id).sort()).toEqual([m.id, other.id].sort());
    expect(await store.sync()).toBe(2);
  });
});
