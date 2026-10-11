// Builds Coastal Clash's Miami Beach data from the live public GIS services (npm run data).
//
//   1. Queries each ArcGIS layer for the Miami Beach area only (never the whole county), in WGS84.
//   2. Caches the raw answers in pipeline/cache/ (so a rebuild works offline), with the fetch time.
//   3. Writes web-ready overlays to app/public/data/miami-beach/ and the playable areas' facts to
//      shared/src/data/districts.json, each with its source layer, query and feature ids.
//
// A playable area is a focus box drawn around a real place. Its geometry is the union of the real
// zoning polygons whose centroid lies in that box, so every area is made of source features with ids.
// Its facts (flood zone shares, zoning shares) are measured by sampling a 20 m grid over those polygons.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as turf from '@turf/turf';
import type { Feature, FeatureCollection, MultiPolygon, Point, Polygon } from "geojson";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, 'pipeline', 'cache');
const WEB = join(ROOT, 'app', 'public', 'data', 'miami-beach');
const SHARED = join(ROOT, 'shared', 'src', 'data');
const refresh = process.argv.includes('--refresh');

/** Miami Beach city limits, with a margin (lon/lat). */
const CITY_BBOX: [number, number, number, number] = [-80.17, 25.76, -80.112, 25.874];
/** The flood overlay is clipped wider than the query, so its edge stays off screen. */
const FLOOD_CLIP: [number, number, number, number] = [-80.24, 25.70, -80.05, 25.93];

export const LAYERS = {
  zoning: {
    name: 'City of Miami Beach Zoning',
    url: 'https://gis.miamibeachfl.gov/public/rest/services/gc/gc_Zoning/MapServer/0',
    fields: 'ZONING_CODE,OBJECTID_12',
  },
  planningDistricts: {
    name: 'City of Miami Beach Planning Districts',
    url: 'https://gis.miamibeachfl.gov/public/rest/services/gc/gc_Cadastral/MapServer/10',
    fields: 'DISTRICT,OBJECTID',
  },
  floodZones: {
    name: 'Miami-Dade County FEMA Flood Zones',
    url: 'https://gisweb.miamidade.gov/ArcGIS/rest/services/EnerGov/MD_LandMgtViewer/MapServer/63',
    fields: 'FZONE,ELEV,ZONESUBTY,OBJECTID',
  },
} as const;
type LayerId = keyof typeof LAYERS;

/** The playable areas: a focus box around a real place, and the shoreline it faces. */
const AREAS = [
  {
    id: 'south-pointe',
    name: 'South Pointe',
    blurb: 'The southern tip of South Beach: South Pointe Park, the Government Cut jetty, oceanfront towers and hotels.',
    box: [-80.1395, 25.7625, -80.127, 25.77],
    shore: 'ocean',
  },
  {
    id: 'west-avenue',
    name: 'West Avenue Bayfront',
    blurb: 'Low-lying blocks on Biscayne Bay, west of Alton Road, where king tides reach the street.',
    box: [-80.145, 25.774, -80.1395, 25.786],
    shore: 'bay',
  },
  {
    id: 'collins-mid-beach',
    name: 'Collins Avenue, Mid-Beach',
    blurb: 'The oceanfront hotel row along Collins Avenue, between Indian Creek and the beach.',
    box: [-80.1245, 25.812, -80.117, 25.826],
    shore: 'ocean',
  },
  {
    id: 'north-beach-oceanside',
    name: 'North Beach Oceanside',
    blurb: 'North Beach Oceanside Park, the dune walk and the Town Center blocks around 72nd Street.',
    box: [-80.124, 25.856, -80.116, 25.87],
    shore: 'ocean',
  },
] as const;

interface Query {
  layer: LayerId;
  url: string;
  fetchedAt: string;
}

/** One ArcGIS query as GeoJSON, cached on disk. */
async function query(layer: LayerId, bbox?: [number, number, number, number]): Promise<{ fc: FeatureCollection; q: Query }> {
  const file = join(CACHE, `${layer}.json`);
  if (!refresh && existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'));
  const params = new URLSearchParams({
    where: '1=1',
    outFields: LAYERS[layer].fields,
    outSR: '4326',
    geometryPrecision: '6',
    f: 'geojson',
  });
  if (bbox) {
    params.set('geometry', bbox.join(','));
    params.set('geometryType', 'esriGeometryEnvelope');
    params.set('inSR', '4326');
    params.set('spatialRel', 'esriSpatialRelIntersects');
  }
  const url = `${LAYERS[layer].url}/query?${params}`;
  console.log(`fetching ${LAYERS[layer].name}`);
  const res = await fetch(url, { signal: AbortSignal.timeout(90_000) });
  if (!res.ok) throw new Error(`${layer}: HTTP ${res.status}`);
  const fc = (await res.json()) as FeatureCollection & { exceededTransferLimit?: boolean };
  if (!Array.isArray(fc.features)) throw new Error(`${layer}: not GeoJSON`);
  if (fc.exceededTransferLimit) throw new Error(`${layer}: more features than one page; narrow the query`);
  const out = { fc, q: { layer, url, fetchedAt: new Date().toISOString() } };
  mkdirSync(CACHE, { recursive: true });
  writeFileSync(file, JSON.stringify(out));
  return out;
}

type Poly = Feature<Polygon | MultiPolygon>;
const polys = (fc: FeatureCollection) => fc.features.filter((f): f is Poly => f.geometry?.type === 'Polygon' || f.geometry?.type === 'MultiPolygon');
const round6 = (n: number) => Math.round(n * 1e6) / 1e6;
const pct = (n: number) => Math.round(n * 1000) / 1000;

/** Every coordinate rounded, so files stay small. */
function roundCoords<T>(g: T): T {
  return JSON.parse(JSON.stringify(g, (_k, v) => (typeof v === 'number' ? round6(v) : v)));
}

function firstHit<T extends Poly>(features: T[], pt: Feature<Point>): T | undefined {
  return features.find((f) => turf.booleanPointInPolygon(pt, f));
}

/** Hotel/commercial use is allowed (game reading of the Miami Beach code families; see docs). */
const HOTEL_ZONES = /^(RM-2|RM-3|CD-|CPS-|MXE|TC-|RO)/;
const RESIDENTIAL_ZONES = /^(RS-|RM-|RPS-|RMPS-|TH|RO)/;
const PUBLIC_ZONES = /^GU$/;

async function main() {
  const zoning = await query('zoning');
  const districts = await query('planningDistricts');
  const flood = await query('floodZones', CITY_BBOX);

  const zoningPolys = polys(zoning.fc);
  const districtPolys = polys(districts.fc);
  const floodPolys = polys(flood.fc).filter((f) => f.properties?.FZONE !== 'OPEN WATER');
  const vePolys = floodPolys.filter((f) => f.properties?.FZONE === 'VE');

  // Overlays for the map: zoning and planning districts as they are, flood zones clipped to the city.
  mkdirSync(WEB, { recursive: true });
  const zoningOut = turf.featureCollection(
    zoningPolys.map((f) => turf.feature(roundCoords(f.geometry), { id: f.properties!.OBJECTID_12, code: String(f.properties!.ZONING_CODE ?? '').trim() || 'unzoned' })),
  );
  writeFileSync(join(WEB, 'zoning.geojson'), JSON.stringify(zoningOut));
  const districtOut = turf.featureCollection(districtPolys.map((f) => turf.feature(roundCoords(f.geometry), { id: f.properties!.OBJECTID, name: f.properties!.DISTRICT })));
  writeFileSync(join(WEB, 'planning-districts.geojson'), JSON.stringify(districtOut));
  const floodOut = turf.featureCollection(
    polys(flood.fc).flatMap((f) => {
      const clipped = turf.bboxClip(f, FLOOD_CLIP);
      const simple = turf.simplify(clipped, { tolerance: 0.00003, highQuality: false });
      if (!simple.geometry.coordinates.length) return [];
      return [turf.feature(roundCoords(simple.geometry), { id: f.properties!.OBJECTID, zone: f.properties!.FZONE, elev: f.properties!.ELEV > 0 ? f.properties!.ELEV : null })];
    }),
  );
  writeFileSync(join(WEB, 'flood-zones.geojson'), JSON.stringify(floodOut));

  const areaFeatures: Feature[] = [];
  const facts = [];
  for (const a of AREAS) {
    const box = turf.bboxPolygon(a.box as unknown as [number, number, number, number]);
    const parts = zoningPolys.filter((f) => turf.booleanPointInPolygon(turf.centroid(f), box));
    if (!parts.length) throw new Error(`${a.id}: no zoning polygons in its box`);
    const merged = parts.length === 1 ? parts[0]! : turf.union(turf.featureCollection(parts))!;
    const geometry = roundCoords(merged.geometry);

    // 20 m grid over the area: zoning and flood zone shares, and the planning district.
    const grid = turf.pointGrid(a.box as unknown as [number, number, number, number], 0.02, { units: 'kilometers', mask: merged });
    const zoneCount: Record<string, number> = {};
    const floodCount: Record<string, number> = {};
    const elevs: number[] = [];
    const districtCount: Record<string, number> = {};
    const floodIds = new Set<number>();
    for (const p of grid.features) {
      const z = firstHit(parts, p);
      const code = String(z?.properties?.ZONING_CODE ?? '').trim() || 'unzoned';
      zoneCount[code] = (zoneCount[code] ?? 0) + 1;
      const fz = firstHit(floodPolys, p);
      const zone = fz ? String(fz.properties!.FZONE) : 'unmapped';
      floodCount[zone] = (floodCount[zone] ?? 0) + 1;
      if (fz) floodIds.add(fz.properties!.OBJECTID);
      if (fz && fz.properties!.ELEV > 0) elevs.push(fz.properties!.ELEV);
      const d = firstHit(districtPolys, p);
      if (d) districtCount[d.properties!.DISTRICT] = (districtCount[d.properties!.DISTRICT] ?? 0) + 1;
    }
    const n = grid.features.length;
    const share = (pred: (k: string) => boolean, counts: Record<string, number>) => pct(Object.entries(counts).filter(([k]) => pred(k)).reduce((s, [, v]) => s + v, 0) / n);

    // FEMA VE (coastal high hazard) in a 100 m band around the area: is it on the wave-exposed shore?
    const band = turf.buffer(merged, 100, { units: 'meters' })!;
    const bandGrid = turf.pointGrid(turf.bbox(band) as [number, number, number, number], 0.02, { units: 'kilometers', mask: band });
    const veHits = bandGrid.features.filter((p) => !turf.booleanPointInPolygon(p, merged) && firstHit(vePolys, p));
    const bandOutside = bandGrid.features.filter((p) => !turf.booleanPointInPolygon(p, merged)).length;
    const veBandShare = pct(veHits.length / Math.max(1, bandOutside));
    const veIds = new Set(veHits.map((p) => firstHit(vePolys, p)!.properties!.OBJECTID as number));

    elevs.sort((x, y) => x - y);
    const center = turf.centerOfMass(merged).geometry.coordinates as [number, number];
    const planningDistrict = Object.entries(districtCount).sort((x, y) => y[1] - x[1])[0]?.[0] ?? 'unknown';
    const fact = {
      id: a.id,
      name: a.name,
      blurb: a.blurb,
      shore: a.shore,
      planningDistrict,
      center: center.map(round6),
      bbox: turf.bbox(merged).map(round6),
      areaKm2: Math.round(turf.area(merged) / 1e4) / 100,
      samplePoints: n,
      zoning: Object.fromEntries(Object.entries(zoneCount).sort((x, y) => y[1] - x[1]).map(([k, v]) => [k, pct(v / n)])),
      flood: Object.fromEntries(Object.entries(floodCount).sort((x, y) => y[1] - x[1]).map(([k, v]) => [k, pct(v / n)])),
      /** Share in FEMA's 1% annual chance flood area (Special Flood Hazard Area: A*, V*). */
      sfhaShare: share((k) => /^(A|V)/.test(k), floodCount),
      veBandShare,
      medianBaseFloodElevFt: elevs.length ? elevs[Math.floor(elevs.length / 2)]! : null,
      hotelZoningShare: share((k) => HOTEL_ZONES.test(k), zoneCount),
      residentialZoningShare: share((k) => RESIDENTIAL_ZONES.test(k), zoneCount),
      publicZoningShare: share((k) => PUBLIC_ZONES.test(k), zoneCount),
      sources: {
        zoningIds: parts.map((f) => f.properties!.OBJECTID_12 as number).sort((x, y) => x - y),
        floodZoneIds: [...floodIds].sort((x, y) => x - y),
        veZoneIdsNearby: [...veIds].sort((x, y) => x - y),
      },
    };
    facts.push(fact);
    areaFeatures.push(turf.feature(geometry, { id: a.id, name: a.name }));
    console.log(`${a.id}: ${parts.length} zoning polygons, ${fact.areaKm2} km2, SFHA ${fact.sfhaShare}, VE band ${veBandShare}, hotel ${fact.hotelZoningShare}, residential ${fact.residentialZoningShare}, district ${planningDistrict}`);
  }
  writeFileSync(join(WEB, 'areas.geojson'), JSON.stringify(turf.featureCollection(areaFeatures)));

  const sources = (Object.keys(LAYERS) as LayerId[]).map((id) => {
    const q = id === 'zoning' ? zoning.q : id === 'planningDistricts' ? districts.q : flood.q;
    return { id, name: LAYERS[id].name, layer: LAYERS[id].url, query: q.url, fetchedAt: q.fetchedAt };
  });
  mkdirSync(SHARED, { recursive: true });
  writeFileSync(
    join(SHARED, 'districts.json'),
    JSON.stringify({ city: 'Miami Beach, Florida', builtAt: new Date().toISOString(), method: 'Area = union of the zoning polygons whose centroid lies in a focus box. Shares are the fraction of a 20 m point grid over the area. VE band = share of a 100 m band outside the area that lies in FEMA VE.', sources, districts: facts }, null, 2) + '\n',
  );
  console.log(`wrote ${WEB} and ${join(SHARED, 'districts.json')}`);
}

await main();
