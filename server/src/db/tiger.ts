// Tiger Data store: experiments in a TimescaleDB hypertable, per-reef activity from a real-time
// continuous aggregate. prepareTiger() applies schema.sql (idempotent) on every start.
import { readFileSync } from 'node:fs';
import pg from 'pg';
import type { ReefId } from '@shared';
import type { ExperimentRecord } from '../experiments';
import type { ExperimentStore } from './store';

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

interface Row {
  id: string;
  created_at: Date;
  reef: ReefId;
  room_code: string | null;
  player_id: string;
  player_name: string;
  design: ExperimentRecord['design'];
  flow: ExperimentRecord['flow'];
  result: ExperimentRecord['result'];
}

const fromRow = (r: Row): ExperimentRecord => ({
  id: r.id,
  createdAt: r.created_at,
  reef: r.reef,
  roomCode: r.room_code,
  playerId: r.player_id,
  playerName: r.player_name,
  design: r.design,
  flow: r.flow,
  result: r.result,
});

const COLUMNS = 'id, created_at, reef, room_code, player_id, player_name, design, flow, result';

export class TigerStore implements ExperimentStore {
  readonly kind = 'tiger';
  constructor(readonly pool: pg.Pool) {}

  async save(e: ExperimentRecord) {
    await this.pool.query(
      `INSERT INTO experiments (id, created_at, reef, room_code, player_id, player_name, material,
         settlement_rate, model, seed, design, flow, result)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [e.id, e.createdAt, e.reef, e.roomCode, e.playerId, e.playerName, e.result.material,
        e.result.settlementRate, e.result.model, e.result.seed, e.design, e.flow, e.result],
    );
  }

  async get(id: string) {
    const { rows } = await this.pool.query<Row>(`SELECT ${COLUMNS} FROM experiments WHERE id = $1`, [id]);
    return rows[0] ? fromRow(rows[0]) : null;
  }

  async recent(reef: ReefId, limit: number) {
    const { rows } = await this.pool.query<Row>(
      `SELECT ${COLUMNS} FROM experiments WHERE reef = $1 ORDER BY created_at DESC LIMIT $2`, [reef, limit]);
    return rows.map(fromRow);
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
