// The crisis, acted out on the real map. Flood: water rises inside FEMA's AE/VE zones of the spotlight
// areas (flood-by-area.geojson, clipped from the committed layers). Erosion: the beach-side flood zone
// turns to sand and the surf eats into it. Storm: rain and lightning. Development: cranes go up.
// Budget: coins drain away. How strong it looks follows the live readings (intensity.ts); none of it
// changes an outcome, which only the rules engine decides.
import { useEffect, useRef, useState } from 'react';
import { Marker, type GeoJSONSource, type GeoJSONSourceSpecification, type Map as MapLibreMap } from 'maplibre-gl';
import { districtById, type CrisisKind } from '@shared';
import type { Intensity } from './intensity';

/** alert: the crisis lands (the crisis phase). rest: it lingers while the round is played. off: gone. */
export type CrisisStage = 'alert' | 'rest' | 'off';

export interface CrisisFxProps {
  map: MapLibreMap | null;
  /** Changes with each crisis, so the same kind in a later round plays again. */
  id: string | null;
  kind: CrisisKind | null;
  spotlight: string[];
  intensity: Intensity;
  stage: CrisisStage;
}

/** One FEMA flood polygon clipped to one area (pipeline/flood-by-area.ts). */
interface Piece {
  type: 'Feature';
  geometry: { type: 'Polygon' | 'MultiPolygon'; coordinates: unknown };
  properties: { area: string; zone: 'AE' | 'VE'; elev: number | null };
}
type Data = GeoJSONSourceSpecification['data'];
const collection = (features: Piece[]) => ({ type: 'FeatureCollection', features }) as Data;

let pieces: Promise<Piece[]> | null = null;
const loadPieces = () =>
  (pieces ??= fetch('/data/miami-beach/flood-by-area.geojson')
    .then((r) => (r.ok ? r.json() : { features: [] }))
    .then((fc: { features: Piece[] }) => fc.features)
    .catch(() => {
      pieces = null; // try again next crisis
      return [];
    }));

const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const ease = (k: number) => 1 - (1 - k) ** 3;

/** Water height (m) per intensity: exaggerated so it reads at city scale, and labelled as such. */
const WATER_M: Record<Intensity, number> = { 1: 14, 2: 26, 3: 42 };
const REST = 0.35;
const RAIN: Record<Intensity, string> = { 1: 'light', 2: 'steady', 3: 'heavy' };

const WATER = 'crisis-water';
const SAND = 'crisis-sand';
const SURF = 'crisis-surf';

const empty = collection([]);

function ensureLayers(map: MapLibreMap) {
  if (!map.getSource(WATER)) map.addSource(WATER, { type: 'geojson', data: empty });
  if (!map.getSource(SAND)) map.addSource(SAND, { type: 'geojson', data: empty });
  const before = map.getLayer('buildings-3d') ? 'buildings-3d' : undefined;
  if (!map.getLayer(SAND)) map.addLayer({ id: SAND, type: 'fill', source: SAND, paint: { 'fill-color': '#fff0c4', 'fill-outline-color': '#d9a441', 'fill-opacity': 0 } }, before);
  if (!map.getLayer(SURF)) {
    map.addLayer({ id: SURF, type: 'line', source: SAND, layout: { 'line-cap': 'round' }, paint: { 'line-color': '#ffffff', 'line-width': 3, 'line-opacity': 0, 'line-dasharray': [0, 4, 3] } }, before);
  }
  if (!map.getLayer(WATER)) {
    map.addLayer({
      id: WATER, type: 'fill-extrusion', source: WATER,
      paint: { 'fill-extrusion-color': '#22b4f2', 'fill-extrusion-opacity': 0.66, 'fill-extrusion-height': 0, 'fill-extrusion-base': 0 },
    }, before);
  }
}

/** One-shot DOM effects at an area's center (cranes, coins, ripples), removed after `ms`. */
function burst(map: MapLibreMap, district: string, cls: string, html: string, ms: number, delay: number) {
  const timers: ReturnType<typeof setTimeout>[] = [];
  let m: Marker | null = null;
  timers.push(setTimeout(() => {
    const el = document.createElement('div');
    el.className = `fx ${cls}`;
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = html;
    m = new Marker({ element: el, offset: [0, -10] }).setLngLat(districtById(district).center).addTo(map);
    timers.push(setTimeout(() => m?.remove(), ms));
  }, delay));
  return () => {
    timers.forEach(clearTimeout);
    m?.remove();
  };
}

const RIPPLES = '<span class="fx-ripple r1"></span><span class="fx-ripple r2"></span><span class="fx-ripple r3"></span>';
const CRANES = '<span class="fx-crane k1">🏗️</span><span class="fx-crane k2">🏗️</span><span class="fx-crane k3">🏗️</span><span class="fx-dust"></span>';
const DRAIN = '<span class="fx-drain-hole"></span><span class="fx-fall f1">🪙</span><span class="fx-fall f2">🪙</span><span class="fx-fall f3">💵</span><span class="fx-fall f4">🪙</span>';

export function CrisisFx({ map, id, kind, spotlight, intensity, stage }: CrisisFxProps) {
  const [ready, setReady] = useState(false);
  const level = useRef({ water: 0, sand: 0 });
  const spotKey = spotlight.join(',');

  // The map style must be loaded before sources can be added.
  useEffect(() => {
    if (!map) return;
    const on = () => {
      ensureLayers(map);
      setReady(true);
    };
    if (map.isStyleLoaded()) on();
    else map.once('load', on);
    return () => {
      map.off('load', on);
      setReady(false);
    };
  }, [map]);

  // The real shapes for this crisis's areas.
  useEffect(() => {
    if (!map || !ready) return;
    let live = true;
    void loadPieces().then((all) => {
      if (!live) return;
      const here = all.filter((f) => spotlight.includes(f.properties.area));
      const withVE = new Set(here.filter((f) => f.properties.zone === 'VE').map((f) => f.properties.area));
      // Sand: the coastal high-hazard strip where FEMA maps one, else the area's 1% flood zone.
      const sand = here.filter((f) => f.properties.zone === 'VE' || !withVE.has(f.properties.area));
      (map.getSource(WATER) as GeoJSONSource | undefined)?.setData(collection(kind === 'flood' ? here : []) as never);
      (map.getSource(SAND) as GeoJSONSource | undefined)?.setData(collection(kind === 'erosion' ? sand : []) as never);
    });
    return () => {
      live = false;
    };
  }, [map, ready, kind, spotKey]);

  // Water and sand levels, animated toward where this stage wants them.
  useEffect(() => {
    if (!map || !ready) return;
    const H = WATER_M[intensity];
    const water = kind === 'flood' ? (stage === 'alert' ? H : stage === 'rest' ? H * REST : 0) : 0;
    const sand = kind === 'erosion' ? (stage === 'alert' ? 0.95 : stage === 'rest' ? 0.55 : 0) : 0;
    const from = { ...level.current };
    const ms = stage === 'alert' ? 2600 : 1600;
    const t0 = performance.now();
    let raf = 0;
    let dash = 0;
    const paint = (w: number, s: number, t: number) => {
      // A gentle swell on top of the level, so the water reads as water.
      const swell = w > 0 && stage === 'alert' ? Math.sin(t / 420) * H * 0.04 : 0;
      map.setPaintProperty(WATER, 'fill-extrusion-height', Math.max(0, w + swell));
      map.setPaintProperty(SAND, 'fill-opacity', s);
      map.setPaintProperty(SURF, 'line-opacity', s > 0 ? Math.min(1, s + 0.2) : 0);
    };
    if (reduceMotion()) {
      level.current = { water, sand };
      paint(water, sand, 0);
      return;
    }
    const DASHES: [number, number, number][] = [[0, 4, 3], [0.5, 4, 2.5], [1, 4, 2], [1.5, 4, 1.5], [2, 4, 1], [2.5, 4, 0.5], [3, 4, 0]];
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / ms);
      const w = from.water + (water - from.water) * ease(k);
      // Erosion: the sand fades from full to its level as the surf comes in.
      const s = from.sand + (sand - from.sand) * ease(k);
      level.current = { water: w, sand: s };
      paint(w, s, t);
      if (kind === 'erosion' && sand > 0) {
        dash = (dash + 1) % (DASHES.length * 4);
        map.setPaintProperty(SURF, 'line-dasharray', DASHES[Math.floor(dash / 4)]!);
      }
      const animating = k < 1 || (stage === 'alert' && (water > 0 || sand > 0));
      if (animating) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [map, ready, kind, stage, intensity, id]);

  // One-shot effects when the crisis lands.
  useEffect(() => {
    if (!map || stage !== 'alert' || !kind || reduceMotion()) return;
    const stops: (() => void)[] = [];
    spotlight.forEach((d, i) => {
      const delay = 300 + i * 250;
      if (kind === 'flood' || kind === 'erosion') stops.push(burst(map, d, 'fx-flood', RIPPLES, 2600, delay));
      if (kind === 'development') stops.push(burst(map, d, 'fx-cranes', CRANES, 4200, delay));
      if (kind === 'budget') stops.push(burst(map, d, 'fx-drain', DRAIN, 3600, delay));
    });
    return () => stops.forEach((s) => s());
  }, [map, id, kind, stage, spotKey]);

  const flooding = kind === 'flood' && stage !== 'off';
  const raining = kind === 'storm' && stage === 'alert';
  return (
    <>
      {raining && (
        <div key={id} className="rain-layer" data-level={RAIN[intensity]} aria-hidden>
          <span className="storm-flash" />
        </div>
      )}
      {flooding && <p className="water-note lchip">🌊 Water height exaggerated to be seen · flood zones are FEMA’s</p>}
    </>
  );
}
