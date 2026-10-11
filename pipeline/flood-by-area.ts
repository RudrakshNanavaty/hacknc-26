// Derives flood-by-area.geojson from two layers already committed under app/public/data/miami-beach:
// the four playable areas and FEMA's flood zones. Each AE/VE flood polygon is clipped to each area, so
// the map can fill a crisis area with water (or sand) along the real flood-zone shapes and nowhere
// else. Offline: no network, rerun after `bun run data` refreshes the source layers.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as turf from '@turf/turf';
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from 'geojson';

const DIR = fileURLToPath(new URL('../app/public/data/miami-beach/', import.meta.url));
type Shape = Feature<Polygon | MultiPolygon>;
const read = (name: string) => JSON.parse(readFileSync(DIR + name, 'utf8')) as FeatureCollection<Polygon | MultiPolygon>;

const areas = read('areas.geojson').features as Shape[];
const flood = (read('flood-zones.geojson').features as Shape[]).filter((f) => f.properties?.zone === 'AE' || f.properties?.zone === 'VE');

/** Four decimals is about 11 m: plenty for a map effect, and keeps the file small. */
const round = <T>(c: T): T => (Array.isArray(c) ? (typeof c[0] === 'number' ? c.map((n: number) => Math.round(n * 1e4) / 1e4) : c.map(round)) : c) as T;

const out: Shape[] = [];
for (const area of areas) {
  for (const zone of flood) {
    if (!turf.booleanIntersects(area, zone)) continue;
    const clip = turf.intersect(turf.featureCollection([area, zone]));
    if (!clip || turf.area(clip) < 200) continue;
    out.push(turf.feature({ ...clip.geometry, coordinates: round(clip.geometry.coordinates) } as Polygon | MultiPolygon, {
      area: area.properties!.id, zone: zone.properties!.zone, elev: zone.properties!.elev ?? null,
    }));
  }
}

writeFileSync(DIR + 'flood-by-area.geojson', JSON.stringify(turf.featureCollection(out)));
const by = Object.fromEntries(areas.map((a) => [a.properties!.id, out.filter((f) => f.properties!.area === a.properties!.id).length]));
console.log(`flood-by-area.geojson: ${out.length} pieces`, by);
