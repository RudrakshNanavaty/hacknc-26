// Deployments: a design placed at a real spot on a real reef (the explore worlds). Validated like
// experiments (the design must pass the same checks); kept in memory, or in Tiger Data when set.
import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { designProblems, isReefId, type Design, type ReefId } from '@shared';

export interface DeploymentRecord {
  id: string;
  reef: ReefId;
  playerId: string;
  name: string;
  easting: number;
  northing: number;
  crs: string;
  elevation: number;
  slopeDeg: number;
  design: Design;
  updatedAt: Date;
}

export interface DeploymentStore {
  save(d: DeploymentRecord): Promise<void>;
  list(reef: ReefId, limit: number): Promise<DeploymentRecord[]>;
}

export class MemoryDeployments implements DeploymentStore {
  private readonly rows = new Map<string, DeploymentRecord>();
  async save(d: DeploymentRecord) {
    this.rows.set(d.id, d);
  }
  async list(reef: ReefId, limit: number) {
    return [...this.rows.values()].filter((d) => d.reef === reef).sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()).slice(0, limit);
  }
}

export class TigerDeployments implements DeploymentStore {
  constructor(private readonly pool: pg.Pool) {}
  async save(d: DeploymentRecord) {
    await this.pool.query(
      `INSERT INTO deployments (id, reef, player_id, name, easting, northing, crs, elevation, slope_deg, design, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (id) DO UPDATE SET name = $4, design = $10, updated_at = $11`,
      [d.id, d.reef, d.playerId, d.name, d.easting, d.northing, d.crs, d.elevation, d.slopeDeg, d.design, d.updatedAt],
    );
  }
  async list(reef: ReefId, limit: number) {
    const { rows } = await this.pool.query(
      `SELECT id, reef, player_id AS "playerId", name, easting, northing, crs, elevation, slope_deg AS "slopeDeg", design, updated_at AS "updatedAt"
       FROM deployments WHERE reef = $1 ORDER BY updated_at DESC LIMIT $2`, [reef, limit]);
    return rows as DeploymentRecord[];
  }
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export function registerDeployments(app: FastifyInstance, store: DeploymentStore) {
  app.post('/api/deployments', async (req, reply) => {
    const b = (req.body ?? {}) as Record<string, unknown>;
    const problems: string[] = [];
    if (typeof b.id !== 'string' || !/^[0-9a-f-]{36}$/.test(b.id)) problems.push('id must be a uuid');
    if (!isReefId(b.reef)) problems.push('unknown reef');
    const playerId = typeof b.playerId === 'string' ? b.playerId.trim() : '';
    if (!/^[\w-]{4,64}$/.test(playerId)) problems.push('playerId is required');
    const [easting, northing, elevation, slopeDeg] = [num(b.easting), num(b.northing), num(b.y), num(b.slopeDeg)];
    if (easting === null || northing === null || elevation === null || slopeDeg === null) problems.push('position is required');
    problems.push(...designProblems(b.design).map((p) => `design: ${p}`));
    if (problems.length) return reply.code(400).send({ error: 'invalid deployment', problems });
    const d: DeploymentRecord = {
      id: b.id as string,
      reef: b.reef as ReefId,
      playerId,
      name: String(b.name ?? 'Device').slice(0, 40),
      easting: easting!,
      northing: northing!,
      crs: String(b.crs ?? '').slice(0, 40),
      elevation: elevation!,
      slopeDeg: slopeDeg!,
      design: b.design as Design,
      updatedAt: new Date(),
    };
    await store.save(d);
    return reply.code(201).send({ id: d.id });
  });

  app.get<{ Querystring: { reef?: string } }>('/api/deployments', async (req, reply) => {
    if (!isReefId(req.query.reef)) return reply.code(400).send({ error: 'unknown reef' });
    return { deployments: await store.list(req.query.reef, 200) };
  });
}
