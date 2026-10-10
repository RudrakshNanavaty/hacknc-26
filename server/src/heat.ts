// GET /api/reefs/:id/heat: the reef's latest marine heat stress from NOAA Coral Reef Watch
// (daily 5 km Degree Heating Weeks, ERDDAP, no key). Cached for an hour; fails soft to null.
import type { FastifyInstance } from 'fastify';
import { isReefId, reefById, type ReefId } from '@shared';

const ERDDAP = 'https://coastwatch.noaa.gov/erddap/griddap/noaacrwdhwDaily.csv';
const TTL_MS = 3600_000;

export interface Heat {
  /** Degree Heating Weeks, °C-weeks. NOAA: 4 = significant bleaching likely, 8 = severe. */
  dhw: number;
  date: string;
  source: string;
}

const cache = new Map<ReefId, { at: number; heat: Promise<Heat | null> }>();

async function fetchHeat(id: ReefId): Promise<Heat | null> {
  const { lat, lon } = reefById(id);
  const query = `degree_heating_week[(last)][(${lat})][(${lon})]`;
  const res = await fetch(`${ERDDAP}?${encodeURIComponent(query)}`, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`Coral Reef Watch answered ${res.status}`);
  // Two header lines (names, units), then time,latitude,longitude,degree_heating_week.
  const row = (await res.text()).trim().split('\n')[2]?.split(',');
  const dhw = Number(row?.[3]);
  // NaN: the 5 km cell is land or has no data.
  if (!row || !Number.isFinite(dhw)) return null;
  return { dhw, date: row[0]!.slice(0, 10), source: 'NOAA Coral Reef Watch, daily 5 km Degree Heating Weeks' };
}

/** Half-width of the heat-stress map around a reef, degrees; the grid is sampled every 0.1°. */
const GRID_HALF_DEG = 2.5;
const GRID_TTL_MS = 6 * 3600_000;
const gridCache = new Map<ReefId, { at: number; grid: Promise<unknown> }>();

/** The latest DHW around a reef as GeoJSON squares (one per 0.1° sample; land cells are left out). */
async function fetchHeatGrid(id: ReefId) {
  const { lat, lon } = reefById(id);
  const f = (v: number) => v.toFixed(3);
  const query = `degree_heating_week[(last)][(${f(lat - GRID_HALF_DEG)}):2:(${f(lat + GRID_HALF_DEG)})][(${f(lon - GRID_HALF_DEG)}):2:(${f(lon + GRID_HALF_DEG)})]`;
  const res = await fetch(`${ERDDAP.replace(/\.csv$/, '.json')}?${encodeURIComponent(query)}`, { signal: AbortSignal.timeout(45_000) });
  if (!res.ok) throw new Error(`Coral Reef Watch answered ${res.status}`);
  const { table } = (await res.json()) as { table: { rows: [string, number, number, number | null][] } };
  const half = 0.05;
  const features = table.rows
    .filter((r) => r[3] !== null && Number.isFinite(r[3]))
    .map(([, la, lo, dhw]) => ({
      type: 'Feature' as const,
      properties: { dhw },
      geometry: { type: 'Polygon' as const, coordinates: [[[lo - half, la - half], [lo + half, la - half], [lo + half, la + half], [lo - half, la + half], [lo - half, la - half]]] },
    }));
  return { type: 'FeatureCollection', date: table.rows[0]?.[0]?.slice(0, 10) ?? null, source: 'NOAA Coral Reef Watch, daily 5 km Degree Heating Weeks', features };
}

export function registerHeat(app: FastifyInstance) {
  // Heat stress as a map layer around the reef (Coral Reef Watch's WMS answers 502, so we grid it ourselves).
  app.get<{ Params: { id: string } }>('/api/reefs/:id/heat-grid', async (req, reply) => {
    const id = req.params.id;
    if (!isReefId(id)) return reply.code(404).send({ error: 'unknown reef' });
    const hit = gridCache.get(id);
    if (!hit || Date.now() - hit.at > GRID_TTL_MS) {
      const grid = fetchHeatGrid(id).catch((err) => {
        req.log.warn({ err: (err as Error).message, reef: id }, 'heat grid unavailable');
        gridCache.delete(id);
        return null;
      });
      gridCache.set(id, { at: Date.now(), grid });
    }
    const grid = await gridCache.get(id)!.grid;
    return grid ?? reply.code(503).send({ error: 'heat stress unavailable right now' });
  });

  app.get<{ Params: { id: string } }>('/api/reefs/:id/heat', async (req, reply) => {
    const id = req.params.id;
    if (!isReefId(id)) return reply.code(404).send({ error: 'unknown reef' });
    const hit = cache.get(id);
    if (!hit || Date.now() - hit.at > TTL_MS) {
      const heat = fetchHeat(id).catch((err) => {
        req.log.warn({ err: (err as Error).message, reef: id }, 'heat stress unavailable');
        cache.delete(id);
        return null;
      });
      cache.set(id, { at: Date.now(), heat });
    }
    return { reef: id, heat: await cache.get(id)!.heat };
  });
}
