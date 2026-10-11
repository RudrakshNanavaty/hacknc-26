// The civic record in Tiger Data (cc_civic_matches, cc_civic_anchors): the fingerprint, memo and Merkle
// proof of every match, and the Solana batches that anchored them. Same interface as the file store.
import type pg from 'pg';
import type { Anchor, CivicStore, MatchProof } from './store';

export class TigerCivicStore implements CivicStore {
  readonly kind = 'tiger' as const;
  constructor(private readonly pool: pg.Pool) {}

  async saveMatch(m: MatchProof) {
    await this.pool.query(
      `INSERT INTO cc_civic_matches (match_id, anchor_id, fingerprint, proof, updated_at) VALUES ($1, $2, $3, $4, now())
       ON CONFLICT (match_id) DO UPDATE SET anchor_id = EXCLUDED.anchor_id, fingerprint = EXCLUDED.fingerprint, proof = EXCLUDED.proof, updated_at = now()`,
      [m.matchId, m.anchorId, m.fingerprint, JSON.stringify(m)],
    );
  }

  private async one(sql: string, params: unknown[]) {
    const { rows } = await this.pool.query<{ proof: MatchProof }>(sql, params);
    return rows[0]?.proof ?? null;
  }
  private async many(sql: string, params: unknown[]) {
    const { rows } = await this.pool.query<{ proof: MatchProof }>(sql, params);
    return rows.map((r) => r.proof);
  }

  match(matchId: string) {
    return this.one('SELECT proof FROM cc_civic_matches WHERE match_id = $1', [matchId]);
  }
  unanchored(limit: number) {
    return this.many('SELECT proof FROM cc_civic_matches WHERE anchor_id IS NULL ORDER BY updated_at LIMIT $1', [limit]);
  }
  failedMemos(limit: number) {
    return this.many("SELECT proof FROM cc_civic_matches WHERE proof->'memo'->>'status' = 'failed' ORDER BY updated_at LIMIT $1", [limit]);
  }

  async saveAnchor(a: Anchor) {
    await this.pool.query(
      `INSERT INTO cc_civic_anchors (id, created_at, anchor) VALUES ($1, $2, $3)
       ON CONFLICT (id) DO UPDATE SET anchor = EXCLUDED.anchor`,
      [a.id, a.createdAt, JSON.stringify(a)],
    );
  }
  async anchor(id: string) {
    const { rows } = await this.pool.query<{ anchor: Anchor }>('SELECT anchor FROM cc_civic_anchors WHERE id = $1', [id]);
    return rows[0]?.anchor ?? null;
  }
  async anchors(limit: number) {
    const { rows } = await this.pool.query<{ anchor: Anchor }>('SELECT anchor FROM cc_civic_anchors ORDER BY created_at DESC LIMIT $1', [limit]);
    return rows.map((r) => r.anchor);
  }
}

/** Tiger first; when it errors, the local store (a file, or memory) keeps the record and answers for it. */
export function failSoftCivic(primary: CivicStore, backup: CivicStore, log: { warn: (obj: unknown, msg: string) => void }): CivicStore {
  const write = async <T>(run: (s: CivicStore) => Promise<T>): Promise<void> => {
    try {
      await run(primary);
    } catch (err) {
      log.warn({ err }, 'civic record: database write failed; kept locally');
    }
    // Always mirrored locally: it is small, and it heals a database that was down for a moment.
    await run(backup).catch(() => {});
  };
  const read = async <T>(run: (s: CivicStore) => Promise<T>, empty: (v: T) => boolean): Promise<T> => {
    try {
      const v = await run(primary);
      if (!empty(v)) return v;
    } catch (err) {
      log.warn({ err }, 'civic record: database read failed; answering locally');
    }
    return run(backup);
  };
  return {
    kind: primary.kind,
    saveMatch: (m) => write((s) => s.saveMatch(m)),
    saveAnchor: (a) => write((s) => s.saveAnchor(a)),
    match: (id) => read((s) => s.match(id), (v) => v === null),
    anchor: (id) => read((s) => s.anchor(id), (v) => v === null),
    unanchored: (n) => read((s) => s.unanchored(n), (v) => v.length === 0),
    failedMemos: (n) => read((s) => s.failedMemos(n), (v) => v.length === 0),
    anchors: (n) => read((s) => s.anchors(n), (v) => v.length === 0),
  };
}
