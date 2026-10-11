// Planning Studio's computed summaries and planner briefs, saved as they are produced so the studio
// has a history ("what did the findings say after 10 matches?") and a brief is never lost.
import type pg from 'pg';

export interface StudioSnapshot {
  id: string;
  createdAt: string;
  sessionKind: string;
  matches: number;
  responses: number;
  summary: unknown;
  brief: string | null;
  briefSource: string | null;
}

export interface StudioSnapshots {
  readonly kind: 'tiger' | 'memory';
  save(s: Omit<StudioSnapshot, 'id' | 'createdAt'>): Promise<void>;
  history(limit: number, sessionKind?: string): Promise<StudioSnapshot[]>;
}

/** Memory only: the studio history within one server run (no database). */
export class MemorySnapshots implements StudioSnapshots {
  readonly kind = 'memory';
  private rows: StudioSnapshot[] = [];
  async save(s: Omit<StudioSnapshot, 'id' | 'createdAt'>) {
    this.rows.unshift({ ...structuredClone(s), id: crypto.randomUUID(), createdAt: new Date().toISOString() });
    this.rows.length = Math.min(this.rows.length, 200);
  }
  async history(limit: number, sessionKind?: string) {
    return this.rows.filter((r) => !sessionKind || r.sessionKind === sessionKind).slice(0, limit);
  }
}

export class TigerSnapshots implements StudioSnapshots {
  readonly kind = 'tiger';
  constructor(private readonly pool: pg.Pool) {}

  async save(s: Omit<StudioSnapshot, 'id' | 'createdAt'>) {
    await this.pool.query(
      'INSERT INTO cc_studio_snapshots (session_kind, matches, responses, summary, brief, brief_source) VALUES ($1, $2, $3, $4, $5, $6)',
      [s.sessionKind, s.matches, s.responses, JSON.stringify(s.summary), s.brief, s.briefSource],
    );
  }

  async history(limit: number, sessionKind?: string) {
    const { rows } = await this.pool.query<{
      id: string; created_at: Date; session_kind: string; matches: number; responses: number; summary: unknown; brief: string | null; brief_source: string | null;
    }>(
      `SELECT id, created_at, session_kind, matches, responses, summary, brief, brief_source FROM cc_studio_snapshots
       WHERE ($2::text IS NULL OR session_kind = $2) ORDER BY created_at DESC LIMIT $1`,
      [limit, sessionKind ?? null],
    );
    return rows.map((r) => ({
      id: r.id, createdAt: r.created_at.toISOString(), sessionKind: r.session_kind, matches: r.matches, responses: r.responses,
      summary: r.summary, brief: r.brief, briefSource: r.brief_source,
    }));
  }
}
