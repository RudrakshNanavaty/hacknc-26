// Where match records go: Tiger Data when DATABASE_URL is set (db/tiger.ts), memory otherwise.
// Both stores have the same interface; failSoft() wraps Tiger so a database outage never breaks a game.
import type { MatchRecord } from '@shared';

export interface MatchStore {
  readonly kind: 'tiger' | 'memory';
  /** Insert or replace the whole record (called after each round, at the end and on each response). */
  save(match: MatchRecord): Promise<void>;
  get(id: string): Promise<MatchRecord | null>;
  /** Newest first. */
  list(limit: number): Promise<MatchRecord[]>;
  close(): Promise<void>;
}

export class MemoryStore implements MatchStore {
  readonly kind = 'memory';
  private readonly rows = new Map<string, MatchRecord>();

  async save(match: MatchRecord) {
    this.rows.set(match.id, structuredClone(match));
  }

  async get(id: string) {
    return this.rows.get(id) ?? null;
  }

  async list(limit: number) {
    return [...this.rows.values()].sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, limit);
  }

  async close() {}
}

type Log = { warn: (obj: unknown, msg: string) => void };

/** Writes that fail land in memory; reads merge memory in, or answer from it alone. */
export function failSoft(primary: MatchStore, log: Log): MatchStore {
  const backup = new MemoryStore();
  return {
    kind: primary.kind,
    async save(match) {
      try {
        await primary.save(match);
      } catch (err) {
        log.warn({ err }, 'save failed; keeping the match in memory');
        await backup.save(match);
      }
    },
    async get(id) {
      const local = await backup.get(id);
      if (local) return local;
      try {
        return await primary.get(id);
      } catch (err) {
        log.warn({ err }, 'match read failed');
        return null;
      }
    },
    async list(limit) {
      const local = await backup.list(limit);
      try {
        const remote = await primary.list(limit);
        const ids = new Set(local.map((m) => m.id));
        return [...local, ...remote.filter((m) => !ids.has(m.id))].sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, limit);
      } catch (err) {
        log.warn({ err }, 'match list failed; answering from memory');
        return local;
      }
    },
    close: () => primary.close(),
  };
}
