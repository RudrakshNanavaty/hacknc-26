// Everything that is stored, as one bundle: matches (the MatchStore), the gameplay timeline, Planning
// Studio snapshots and the civic record. With Tiger Data it all lands in the database; without it the
// match store falls back to a file, the timeline is dropped, and the civic record stays in its file.
import type pg from 'pg';
import { FileCivicStore, type CivicStore } from '../solana/store';
import { TigerCivicStore, failSoftCivic } from '../solana/tiger-store';
import { type EventLog, TigerEventLog, noEvents } from './events';
import { MemorySnapshots, TigerSnapshots, type StudioSnapshots } from './snapshots';

type Log = { warn: (obj: unknown, msg: string) => void };

export const TABLES = ['cc_matches', 'cc_decisions', 'cc_events', 'cc_match_summaries', 'cc_city_snapshots', 'cc_studio_snapshots', 'cc_civic_matches', 'cc_civic_anchors'] as const;

export interface DbStatus {
  store: string;
  events: EventLog['kind'];
  snapshots: StudioSnapshots['kind'];
  civic: string;
  /** Row counts per table (Tiger Data only). */
  tables: Record<string, number> | null;
  error?: string;
}

export interface Persist {
  readonly kind: 'tiger' | 'local';
  events: EventLog;
  /** The civic record's store, or null to use the default file store. */
  civicStore: CivicStore | null;
  snapshots: StudioSnapshots;
  status(storeKind: string): Promise<DbStatus>;
  close(): Promise<void>;
}

export function localPersist(): Persist {
  const snapshots = new MemorySnapshots();
  return {
    kind: 'local',
    events: noEvents,
    civicStore: null,
    snapshots,
    status: async (store) => ({ store, events: 'off', snapshots: snapshots.kind, civic: 'file', tables: null }),
    close: async () => {},
  };
}

export function tigerPersist(pool: pg.Pool, log: Log): Persist {
  const events = new TigerEventLog(pool, log);
  const snapshots = new TigerSnapshots(pool);
  const civicStore = failSoftCivic(new TigerCivicStore(pool), new FileCivicStore(), log);
  return {
    kind: 'tiger',
    events,
    civicStore,
    snapshots,
    async status(store) {
      try {
        const sql = TABLES.map((t) => `SELECT '${t}' AS t, count(*)::int AS n FROM ${t}`).join(' UNION ALL ');
        const { rows } = await pool.query<{ t: string; n: number }>(sql);
        return { store, events: events.kind, snapshots: snapshots.kind, civic: civicStore.kind, tables: Object.fromEntries(rows.map((r) => [r.t, r.n])) };
      } catch (err) {
        return { store, events: events.kind, snapshots: snapshots.kind, civic: civicStore.kind, tables: null, error: (err as Error).message.slice(0, 200) };
      }
    },
    close: () => events.close(),
  };
}
