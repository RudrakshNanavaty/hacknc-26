// Where match records go: Tiger Data when DATABASE_URL is set (db/tiger.ts), memory otherwise.
// Both stores have the same interface; failSoft() wraps Tiger so a database outage never breaks a game.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { MatchRecord } from '@shared';

export interface MatchStore {
  readonly kind: 'tiger' | 'memory' | 'file';
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

/**
 * Without a database: memory plus a JSON file under server/.cache, so records (and the public
 * record's verify page, which rebuilds fingerprints from them) survive a restart.
 */
export class FileStore implements MatchStore {
  readonly kind = 'file';
  private readonly rows = new Map<string, MatchRecord>();
  private readonly loaded: Promise<void>;
  private writing: Promise<void> = Promise.resolve();

  constructor(private readonly file = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '.cache', 'matches.json')) {
    this.loaded = readFile(file, 'utf8')
      .then((t) => (JSON.parse(t) as MatchRecord[]).forEach((m) => this.rows.set(m.id, m)))
      .catch(() => {});
  }

  async save(match: MatchRecord) {
    await this.loaded;
    this.rows.set(match.id, structuredClone(match));
    const body = JSON.stringify([...this.rows.values()]);
    this.writing = this.writing.then(() => mkdir(dirname(this.file), { recursive: true })).then(() => writeFile(this.file, body)).catch(() => {});
    await this.writing;
  }

  async get(id: string) {
    await this.loaded;
    return this.rows.get(id) ?? null;
  }

  async list(limit: number) {
    await this.loaded;
    return [...this.rows.values()].sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, limit);
  }

  async close() {
    await this.writing;
  }
}

type Log = { warn: (obj: unknown, msg: string) => void };

export type ResilientStore = MatchStore & {
  /** Matches kept locally that the database has not accepted yet. */
  pending(): number;
  /** Pushes every locally kept match to the database (a backfill once it is reachable). Returns how many were written. */
  sync(): Promise<number>;
};

/**
 * Tiger Data first, a local copy always. Every save is written to the backup (a file) and to the
 * database; a save the database refused is retried on the next successful one and by sync(). Reads
 * prefer the database and answer from the backup when it is down, so an outage never loses a match.
 */
export function failSoft(primary: MatchStore, log: Log, backup: MatchStore = new MemoryStore()): ResilientStore {
  const waiting = new Set<string>();
  let warned = false;

  async function retryWaiting() {
    for (const id of [...waiting]) {
      const m = await backup.get(id);
      if (!m) {
        waiting.delete(id);
        continue;
      }
      try {
        await primary.save(m);
        waiting.delete(id);
      } catch {
        return;
      }
    }
  }

  return {
    kind: primary.kind,
    pending: () => waiting.size,
    async save(match) {
      await backup.save(match).catch(() => {});
      try {
        await primary.save(match);
        waiting.delete(match.id);
        warned = false;
        if (waiting.size) void retryWaiting();
      } catch (err) {
        waiting.add(match.id);
        if (!warned) log.warn({ err }, 'database save failed; the match is kept locally and will be retried');
        warned = true;
      }
    },
    async get(id) {
      try {
        const remote = await primary.get(id);
        if (remote) return remote;
      } catch (err) {
        log.warn({ err }, 'match read failed; answering locally');
      }
      return backup.get(id);
    },
    async list(limit) {
      const local = await backup.list(limit);
      try {
        const remote = await primary.list(limit);
        const ids = new Set(remote.map((m) => m.id));
        return [...remote, ...local.filter((m) => !ids.has(m.id))].sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, limit);
      } catch (err) {
        log.warn({ err }, 'match list failed; answering locally');
        return local;
      }
    },
    async sync() {
      let n = 0;
      for (const m of await backup.list(10_000)) {
        await primary.save(m);
        waiting.delete(m.id);
        n++;
      }
      return n;
    },
    async close() {
      await backup.close();
      await primary.close();
    },
  };
}
