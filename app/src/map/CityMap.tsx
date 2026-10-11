// The game board, drawn like Mayday Mayor's city: a tilted printed street map of Miami Beach with
// 3D buildings, real street and place names, and the real FEMA flood zones as water (map/basemap.ts).
// City zoning and satellite imagery are toggles. The four playable areas (unions of real zoning
// polygons) are tinted on the ground by their resilience meter; built projects appear as glossy
// pins; the crisis spotlight pulses. Area labels are HTML chips, so they stay tappable on a phone.
import { useEffect, useRef, useState } from 'react';
import { Map as MapLibreMap, Marker, type StyleSpecification } from 'maplibre-gl';
import { DISTRICTS, PROJECTS, type CityState, type MapFeatureKind } from '@shared';
import { ATTRIBUTION, GLYPHS, INK, PRINT_FADE, SATELLITE_ATTRIBUTION, SATELLITE_TILES, TILES, buildings3dLayer, groundLayers, labelLayers, streetLayers } from './basemap';

const DATA = '/data/miami-beach';

export interface Overlays {
  flood: boolean;
  zoning: boolean;
  satellite?: boolean;
}

/** Zoning families, for the overlay's colors and legend. */
export const ZONING_FAMILIES = [
  { label: 'Hotel / commercial', color: '#ffb020', match: ['RM-2', 'RM-3', 'CD-1', 'CD-2', 'CD-3', 'CPS-1', 'CPS-2', 'CPS-3', 'CPS-4', 'MXE', 'TC-1', 'TC-2', 'TC-3', 'TC-3C', 'TC-C', 'RO'] },
  { label: 'Residential', color: '#ff7a6b', match: ['RS-1', 'RS-2', 'RS-3', 'RS-4', 'RM-1', 'RM-PRD', 'RM-PRD-2', 'RPS-1', 'RPS-2', 'RPS-3', 'RPS-4', 'RMPS-1', 'TH'] },
  { label: 'Government use (parks, public land)', color: '#6fd13a', match: ['GU'] },
  { label: 'Other', color: '#b79cff', match: [] },
];
/** FEMA zones drawn as water, in Mayday Mayor's flood blues. */
export const FLOOD_COLORS = { VE: INK.deep, AE: INK.water, X: '#cfefff' } as const;

const FEATURE_ICON: Record<MapFeatureKind, string> = {
  drainage: PROJECTS.drainage.marker,
  shoreline: PROJECTS.shoreline.marker,
  hotel: PROJECTS.hotel.marker,
  elevate: PROJECTS.elevate.marker,
  seawall: PROJECTS.seawall.marker,
  dune: PROJECTS.dune.marker,
  marina: PROJECTS.marina.marker,
  housing: PROJECTS.housing.marker,
  'access-corridor': '🚶',
  'dune-setback': '📐',
  'eco-label': '🏅',
};

function style(): StyleSpecification {
  const zoningColor = ['match', ['get', 'code'], ...ZONING_FAMILIES.slice(0, 3).flatMap((f) => [f.match, f.color]), ZONING_FAMILIES[3]!.color];
  return {
    version: 8,
    glyphs: GLYPHS,
    sources: {
      omt: { type: 'vector', url: TILES, attribution: ATTRIBUTION },
      satellite: { type: 'raster', tiles: [SATELLITE_TILES], tileSize: 256, maxzoom: 19, attribution: SATELLITE_ATTRIBUTION },
      flood: { type: 'geojson', data: `${DATA}/flood-zones.geojson` },
      zoning: { type: 'geojson', data: `${DATA}/zoning.geojson` },
      areas: { type: 'geojson', data: `${DATA}/areas.geojson`, promoteId: 'id' },
      centers: {
        type: 'geojson',
        promoteId: 'id',
        data: { type: 'FeatureCollection', features: DISTRICTS.map((d) => ({ type: 'Feature', properties: { id: d.id }, geometry: { type: 'Point', coordinates: d.center } })) },
      },
    },
    layers: [
      ...groundLayers(),
      {
        id: 'flood-fill', type: 'fill', source: 'flood', layout: { visibility: 'none' },
        filter: ['in', ['get', 'zone'], ['literal', ['VE', 'AE']]],
        paint: { 'fill-color': ['match', ['get', 'zone'], 'VE', FLOOD_COLORS.VE, FLOOD_COLORS.AE], 'fill-opacity': ['match', ['get', 'zone'], 'VE', 0.55, 0.38] },
      },
      {
        id: 'flood-line', type: 'line', source: 'flood', layout: { visibility: 'none' },
        filter: ['==', ['get', 'zone'], 'VE'],
        paint: { 'line-color': FLOOD_COLORS.VE, 'line-width': 1.2, 'line-opacity': 0.7 },
      },
      { id: 'zoning-fill', type: 'fill', source: 'zoning', layout: { visibility: 'none' }, paint: { 'fill-color': zoningColor as never, 'fill-opacity': 0.3 } },
      { id: 'zoning-line', type: 'line', source: 'zoning', layout: { visibility: 'none' }, paint: { 'line-color': '#ffffff', 'line-opacity': 0.55, 'line-width': 0.6 } },
      ...streetLayers(),
      {
        id: 'areas-fill', type: 'fill', source: 'areas',
        paint: {
          'fill-color': ['interpolate', ['linear'], ['coalesce', ['feature-state', 'resilience'], 40], 0, '#ff4f6d', 35, '#ffb020', 60, '#9be85a', 100, '#19e6c1'],
          'fill-opacity': ['case', ['==', ['feature-state', 'eligible'], false], 0.08, ['boolean', ['feature-state', 'target'], false], 0.8, 0.62],
        },
      },
      {
        id: 'areas-halo', type: 'circle', source: 'centers',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 12, 26, 14, 60, 16, 140],
          'circle-blur': 0.85,
          'circle-color': ['interpolate', ['linear'], ['coalesce', ['feature-state', 'resilience'], 40], 0, '#ff4f6d', 35, '#ffb020', 60, '#9be85a', 100, '#19e6c1'],
          'circle-opacity': ['case', ['==', ['feature-state', 'eligible'], false], 0.1, ['boolean', ['feature-state', 'target'], false], 0.85, 0.6],
        },
      },
      buildings3dLayer(),
      {
        id: 'areas-glow', type: 'line', source: 'areas',
        paint: { 'line-color': '#ffffff', 'line-width': 7, 'line-blur': 5, 'line-opacity': ['case', ['==', ['feature-state', 'eligible'], false], 0.1, 0.75] },
      },
      {
        id: 'areas-line', type: 'line', source: 'areas',
        paint: {
          'line-color': ['case', ['boolean', ['feature-state', 'target'], false], '#ffe066', ['boolean', ['feature-state', 'spotlight'], false], '#ffe066', '#ffffff'],
          'line-width': ['case', ['boolean', ['feature-state', 'target'], false], 4.5, 2.2],
          'line-opacity': ['case', ['==', ['feature-state', 'eligible'], false], 0.35, 1],
        },
      },
      {
        id: 'areas-spot', type: 'line', source: 'areas',
        paint: { 'line-color': '#ffe066', 'line-width': 3, 'line-blur': 2, 'line-opacity': ['case', ['boolean', ['feature-state', 'spotlight'], false], 1, 0] },
      },
      ...labelLayers(),
    ],
  };
}


const OVERVIEW_PITCH = 66;
const FOCUS_PITCH = 62;
/**
 * The overview: low over Biscayne Bay at South Beach, looking up the island (North Beach on the
 * horizon), close enough for the 3D city, like Mayday Mayor's view of Brickell.
 */
const overview = () => ({ center: [-80.1355, 25.7835] as [number, number], zoom: 14.15, pitch: OVERVIEW_PITCH, bearing: 14 });

/** South Pointe's chip hangs below its center (the area is at the island's tip); the rest sit above. */
export const chipBelow = (districtId: string) => districtId === 'south-pointe';

export interface CityMapProps {
  city: CityState;
  spotlight?: string[];
  target?: string | null;
  /** When a card is chosen: which areas it may go to (others dim). */
  eligible?: Record<string, boolean> | null;
  overlays: Overlays;
  onPick?: (districtId: string) => void;
  /** A click on the map outside every area (closes whatever is open on the map). */
  onBlank?: () => void;
  /** Fly the camera to an area (null: the overview). */
  focus?: string | null;
  /** The player drives the camera: `focus` changes no longer move it. */
  free?: boolean;
  /** Bump to fly back to the overview (the Recenter button). */
  recenter?: number;
  /** Room to keep clear for the HUD, in px. */
  padding?: { top: number; bottom: number; left: number; right: number };
  onReady?: (map: MapLibreMap) => void;
  /** Hide the chips (studio uses its own markers). */
  chips?: boolean;
  /** Extra text per area chip (e.g. counts in the studio). */
  chipNote?: (districtId: string) => string | null;
  /** A small icon on the chip's corner (the crisis kind on its spotlight areas). */
  chipBadge?: (districtId: string) => string | null;
  className?: string;
}

export function CityMap({ city, spotlight = [], target = null, eligible = null, overlays, onPick, onBlank, focus = null, free = false, recenter = 0, padding, onReady, chips = true, chipNote, chipBadge, className = '' }: CityMapProps) {
  const container = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<MapLibreMap | null>(null);
  const [loaded, setLoaded] = useState(false);
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;
  const onBlankRef = useRef(onBlank);
  onBlankRef.current = onBlank;
  const chipEls = useRef(new Map<string, HTMLButtonElement>());
  const markerSets = useRef(new Map<string, Marker[]>());
  const pad = padding ?? { top: 40, bottom: 40, left: 40, right: 40 };
  const padRef = useRef(pad);
  padRef.current = pad;

  // A tilted view up the barrier island, like Mayday Mayor's city: South Beach in front, North Beach behind.
  const bearing = () => (container.current && container.current.clientWidth > container.current.clientHeight * 1.15 ? 18 : 8);

  useEffect(() => {
    if (!container.current) return;
    const m = new MapLibreMap({
      container: container.current,
      style: style(),
      ...overview(),
      maxPitch: 75,
      attributionControl: { compact: true },
      maxZoom: 18,
      minZoom: 11,
    });
    m.on('load', () => setLoaded(true));
    m.on('click', 'areas-fill', (e) => {
      const id = e.features?.[0]?.properties?.id;
      if (typeof id === 'string') onPickRef.current?.(id);
    });
    m.on('click', (e) => {
      if (!m.getLayer('areas-fill') || m.queryRenderedFeatures(e.point, { layers: ['areas-fill'] }).length) return;
      onBlankRef.current?.();
    });
    m.on('mouseenter', 'areas-fill', () => (m.getCanvas().style.cursor = onPickRef.current ? 'pointer' : ''));
    m.on('mouseleave', 'areas-fill', () => (m.getCanvas().style.cursor = ''));
    setMap(m);
    onReady?.(m);
    const resize = new ResizeObserver(() => m.resize());
    resize.observe(container.current);

    // District chips.
    const chipMarkers: Marker[] = [];
    if (chips) {
      for (const d of DISTRICTS) {
        const el = document.createElement('button');
        el.type = 'button';
        el.className = 'map-chip';
        el.dataset.id = d.id;
        el.addEventListener('click', (ev) => {
          ev.stopPropagation();
          onPickRef.current?.(d.id);
        });
        chipEls.current.set(d.id, el);
        const below = chipBelow(d.id);
        chipMarkers.push(new Marker({ element: el, anchor: below ? 'top' : 'bottom', offset: [0, below ? 14 : -14] }).setLngLat(d.center).addTo(m));
      }
    }
    return () => {
      resize.disconnect();
      chipMarkers.forEach((x) => x.remove());
      chipEls.current.clear();
      markerSets.current.forEach((xs) => xs.forEach((x) => x.remove()));
      markerSets.current.clear();
      m.remove();
      setMap(null);
      setLoaded(false);
    };
    // The map is built once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Overlays.
  useEffect(() => {
    if (!map || !loaded) return;
    for (const id of ['flood-fill', 'flood-line']) map.setLayoutProperty(id, 'visibility', overlays.flood ? 'visible' : 'none');
    for (const id of ['zoning-fill', 'zoning-line']) map.setLayoutProperty(id, 'visibility', overlays.zoning ? 'visible' : 'none');
    const sat = !!overlays.satellite;
    map.setLayoutProperty('satellite', 'visibility', sat ? 'visible' : 'none');
    for (const [id, prop, full] of PRINT_FADE) map.setPaintProperty(id, prop, sat ? 0 : full);
    map.setPaintProperty('buildings-3d', 'fill-extrusion-opacity', sat ? 0.55 : 0.92);
  }, [map, loaded, overlays.flood, overlays.zoning, overlays.satellite]);

  // Area states: resilience tint, spotlight, target, eligibility.
  useEffect(() => {
    if (!map || !loaded) return;
    for (const d of DISTRICTS) {
      map.setFeatureState(
        { source: 'areas', id: d.id },
        { resilience: city.districts[d.id]?.resilience ?? 40, spotlight: spotlight.includes(d.id), target: target === d.id, eligible: eligible ? eligible[d.id] !== false : true },
      );
      map.setFeatureState(
        { source: 'centers', id: d.id },
        { resilience: city.districts[d.id]?.resilience ?? 40, target: target === d.id, eligible: eligible ? eligible[d.id] !== false : true },
      );
    }
  }, [map, loaded, city, spotlight, target, eligible]);

  // The spotlight pulses.
  useEffect(() => {
    if (!map || !loaded || !spotlight.length) return;
    let raf = 0;
    const loop = (t: number) => {
      if (map.getLayer('areas-spot')) map.setPaintProperty('areas-spot', 'line-width', 3 + 2.5 * (0.5 + 0.5 * Math.sin(t / 260)));
      raf = requestAnimationFrame(loop);
    };
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [map, loaded, spotlight.join(',')]);

  // Chip text.
  useEffect(() => {
    for (const d of DISTRICTS) {
      const el = chipEls.current.get(d.id);
      if (!el) continue;
      const r = city.districts[d.id]?.resilience ?? 0;
      const off = eligible ? eligible[d.id] === false : false;
      const note = chipNote?.(d.id);
      const badge = chipBadge?.(d.id);
      el.dataset.target = String(target === d.id);
      el.dataset.spot = String(spotlight.includes(d.id));
      el.dataset.off = String(off);
      el.setAttribute('aria-label', `${d.name}, resilience ${r}${off ? ', not allowed for this card' : ''}`);
      el.innerHTML = `${badge ? `<span class="map-chip-badge" aria-hidden="true">${badge}</span>` : ''}<span class="map-chip-name">${d.name}</span><span class="map-chip-meter"><span style="width:${r}%"></span></span>${note ? `<span class="map-chip-note">${note}</span>` : ''}`;
    }
  }, [city, target, spotlight, eligible, chipNote, chipBadge]);

  // Built projects: glossy markers in a small ring around each area's center.
  useEffect(() => {
    if (!map) return;
    for (const d of DISTRICTS) {
      const feats = city.districts[d.id]?.features ?? [];
      const old = markerSets.current.get(d.id) ?? [];
      if (old.length === feats.length) continue;
      const added = feats.slice(old.length).map((f, i) => {
        const k = old.length + i;
        const el = document.createElement('div');
        el.className = 'map-pin-anchor';
        el.title = f.label;
        el.innerHTML = `<span class="map-pin">${FEATURE_ICON[f.kind]}</span>`;
        const angle = (k * 2.3) % (2 * Math.PI);
        const r = 34 + 6 * Math.floor(k / 3);
        return new Marker({ element: el, offset: [Math.cos(angle) * r, Math.sin(angle) * r + 18] }).setLngLat(d.center).addTo(map);
      });
      for (const x of old.slice(feats.length)) x.remove();
      markerSets.current.set(d.id, [...old.slice(0, feats.length), ...added]);
    }
  }, [map, city]);

  // Camera.
  useEffect(() => {
    if (!map || free) return;
    const p = padRef.current;
    if (focus) {
      const d = DISTRICTS.find((x) => x.id === focus);
      if (!d) return;
      const cam = map.cameraForBounds([[d.bbox[0], d.bbox[1]], [d.bbox[2], d.bbox[3]]], { padding: p, bearing: bearing() });
      if (cam) map.flyTo({ ...cam, zoom: Math.min((cam.zoom ?? 15) - 0.2, 16), pitch: FOCUS_PITCH, duration: 1600, essential: true });
    } else {
      map.flyTo({ ...overview(), padding: p, duration: 1400, essential: true });
    }
  }, [map, focus, free, pad.top, pad.bottom, pad.left, pad.right]);

  // Recenter: back to the overview, whoever is driving.
  useEffect(() => {
    if (!map || !recenter) return;
    map.flyTo({ ...overview(), padding: padRef.current, duration: 1200, essential: true });
  }, [map, recenter]);

  return (
    <div className={`relative h-full w-full overflow-hidden ${className}`}>
      <div ref={container} style={{ position: "absolute", inset: 0 }} />
    </div>
  );
}
