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

export function registerHeat(app: FastifyInstance) {
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
