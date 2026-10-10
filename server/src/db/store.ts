// Where experiments go: Tiger Data when DATABASE_URL is set (db/tiger.ts), memory otherwise.
// Both stores have the same interface; failSoft() wraps Tiger so a database outage never breaks a game.
import type { ReefId } from '@shared';
import type { ExperimentRecord } from '../experiments';

export interface ExperimentStore {
  readonly kind: 'tiger' | 'memory';
  save(experiment: ExperimentRecord): Promise<void>;
  get(id: string): Promise<ExperimentRecord | null>;
  /** Newest first. */
  recent(reef: ReefId, limit: number): Promise<ExperimentRecord[]>;
  close(): Promise<void>;
}

export class MemoryStore implements ExperimentStore {
  readonly kind = 'memory';
  private readonly rows: ExperimentRecord[] = [];

  async save(experiment: ExperimentRecord) {
    this.rows.push(experiment);
  }

  async get(id: string) {
    return this.rows.find((r) => r.id === id) ?? null;
  }

  async recent(reef: ReefId, limit: number) {
    return this.rows.filter((r) => r.reef === reef).slice(-limit).reverse();
  }

  async close() {}
}

type Log = { warn: (obj: unknown, msg: string) => void };

/** Writes that fail land in memory; reads merge memory in, or answer from it alone. */
export function failSoft(primary: ExperimentStore, log: Log): ExperimentStore {
  const backup = new MemoryStore();
  return {
    kind: primary.kind,
    async save(experiment) {
      try {
        await primary.save(experiment);
      } catch (err) {
        log.warn({ err }, 'save failed; keeping the experiment in memory');
        await backup.save(experiment);
      }
    },
    async get(id) {
      const local = await backup.get(id);
      if (local) return local;
      try {
        return await primary.get(id);
      } catch (err) {
        log.warn({ err }, 'experiment read failed');
        return null;
      }
    },
    async recent(reef, limit) {
      const local = await backup.recent(reef, limit);
      try {
        const remote = await primary.recent(reef, limit);
        return [...local, ...remote].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, limit);
      } catch (err) {
        log.warn({ err }, 'recent read failed; answering from memory');
        return local;
      }
    },
    close: () => primary.close(),
  };
}
