// Live Miami Beach conditions for the crisis desk: NOAA's Virginia Key tide gauge (the nearest
// NOAA water-level station to Miami Beach) with its flood thresholds, and the National Weather
// Service forecast for Miami Beach. No keys. Cached ten minutes; each part fails soft to null.
import type { FastifyInstance } from 'fastify';
import type { LiveConditions } from '@shared';

const STATION = '8723214';
const NOAA = 'https://api.tidesandcurrents.noaa.gov';
const NWS_POINT = 'https://api.weather.gov/points/25.79,-80.13';
const TTL_MS = 10 * 60 * 1000;
const TIMEOUT_MS = 8_000;
const UA = { 'User-Agent': process.env.NWS_USER_AGENT || 'consensusclub (HackNC 2026 planning game)' };

async function json<T>(url: string, headers: Record<string, string> = {}): Promise<T> {
  const r = await fetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return (await r.json()) as T;
}

const ymd = (d: Date) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
const r2 = (n: number) => Math.round(n * 100) / 100;

async function tide(): Promise<LiveConditions['tide']> {
  const now = new Date();
  const week = new Date(now.getTime() + 6 * 864e5);
  const q = `station=${STATION}&datum=MLLW&units=english&time_zone=lst_ldt&format=json&application=consensusclub`;
  const [latest, preds, levels, datums] = await Promise.all([
    json<{ metadata?: { name: string }; data?: { t: string; v: string }[] }>(`${NOAA}/api/prod/datagetter?date=latest&product=water_level&${q}`).catch(() => null),
    json<{ predictions: { t: string; v: string; type: 'H' | 'L' }[] }>(`${NOAA}/api/prod/datagetter?begin_date=${ymd(now)}&end_date=${ymd(week)}&product=predictions&interval=hilo&${q}`),
    json<{ nos_minor: number | null; nos_moderate: number | null }>(`${NOAA}/mdapi/prod/webapi/stations/${STATION}/floodlevels.json`).catch(() => null),
    json<{ datums: { name: string; value: number }[] }>(`${NOAA}/mdapi/prod/webapi/stations/${STATION}/datums.json?units=english`).catch(() => null),
  ]);
  // Flood levels are on the station datum; convert to MLLW like the readings.
  const mllw = datums?.datums.find((d) => d.name === 'MLLW')?.value ?? null;
  const toMllw = (v: number | null | undefined) => (v != null && mllw != null ? r2(v - mllw) : null);
  const highs = preds.predictions.filter((p) => p.type === 'H').map((p) => ({ at: p.t, ft: r2(Number(p.v)) }));
  const reading = latest?.data?.[0];
  return {
    station: STATION,
    name: latest?.metadata?.name ?? 'Virginia Key',
    latest: reading ? { at: reading.t, ft: r2(Number(reading.v)) } : null,
    highs,
    weekHigh: highs.length ? highs.reduce((a, b) => (b.ft > a.ft ? b : a)) : null,
    minorFloodFt: toMllw(levels?.nos_minor),
    moderateFloodFt: toMllw(levels?.nos_moderate),
  };
}

async function weather(): Promise<LiveConditions['weather']> {
  const point = await json<{ properties: { forecast: string } }>(NWS_POINT, UA);
  const f = await json<{ properties: { periods: { name: string; temperature: number; windSpeed: string; shortForecast: string; probabilityOfPrecipitation?: { value: number | null } }[] } }>(point.properties.forecast, UA);
  return {
    periods: f.properties.periods.slice(0, 3).map((p) => ({ name: p.name, tempF: p.temperature, wind: p.windSpeed, forecast: p.shortForecast, rainPct: p.probabilityOfPrecipitation?.value ?? null })),
  };
}

let cache: { at: number; value: LiveConditions } | null = null;
let inflight: Promise<LiveConditions> | null = null;

/** Live conditions, fetched at most every ten minutes. Never throws. */
export function liveConditions(now = Date.now()): Promise<LiveConditions> {
  if (cache && now - cache.at < TTL_MS) return Promise.resolve(cache.value);
  inflight ??= Promise.all([tide().catch(() => null), weather().catch(() => null)])
    .then(([t, w]) => {
      const value: LiveConditions = {
        fetchedAt: new Date().toISOString(),
        tide: t,
        weather: w,
        sources: [
          { name: 'NOAA CO-OPS Virginia Key tide station 8723214', url: `https://tidesandcurrents.noaa.gov/stationhome.html?id=${STATION}` },
          { name: 'National Weather Service forecast, Miami Beach', url: 'https://forecast.weather.gov/MapClick.php?lat=25.79&lon=-80.13' },
        ],
      };
      if (t || w) cache = { at: Date.now(), value };
      return value;
    })
    .finally(() => (inflight = null));
  return inflight;
}

export function registerLive(app: FastifyInstance) {
  app.get('/api/live', async () => liveConditions());
}
