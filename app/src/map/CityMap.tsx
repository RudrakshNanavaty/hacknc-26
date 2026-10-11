// The game board: Miami Beach on satellite imagery, with the real FEMA flood zones and City zoning
// as overlays, and the four playable areas (unions of real zoning polygons) drawn on top. Areas are
// tinted by their resilience meter; built projects appear as glossy markers; the crisis spotlight
// pulses. Labels are HTML chips, so they stay tappable on a phone and need no font server.
import { useEffect, useRef, useState } from 'react';
import { Map as MapLibreMap, Marker, type LngLatBoundsLike, type StyleSpecification } from 'maplibre-gl';
import { DISTRICTS, PROJECTS, type CityState, type MapFeatureKind } from '@shared';

const DATA = '/data/miami-beach';
const SATELLITE = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const ATTRIBUTION =
  'Imagery <a href="https://www.esri.com" target="_blank">&copy; Esri</a>, Maxar, Earthstar Geographics · ' +
  'Zoning and planning districts: <a href="https://gis.miamibeachfl.gov/public/rest/services" target="_blank">City of Miami Beach GIS</a> · ' +
  'FEMA flood zones: <a href="https://gisweb.miamidade.gov/ArcGIS/rest/services" target="_blank">Miami-Dade County GIS</a>';

export interface Overlays {
  flood: boolean;
  zoning: boolean;
}

/** Zoning families, for the overlay's colors and legend. */
export const ZONING_FAMILIES = [
  { label: 'Hotel / commercial', color: '#ffb020', match: ['RM-2', 'RM-3', 'CD-1', 'CD-2', 'CD-3', 'CPS-1', 'CPS-2', 'CPS-3', 'CPS-4', 'MXE', 'TC-1', 'TC-2', 'TC-3', 'TC-3C', 'TC-C', 'RO'] },
  { label: 'Residential', color: '#ff7a6b', match: ['RS-1', 'RS-2', 'RS-3', 'RS-4', 'RM-1', 'RM-PRD', 'RM-PRD-2', 'RPS-1', 'RPS-2', 'RPS-3', 'RPS-4', 'RMPS-1', 'TH'] },
  { label: 'Government use (parks, public land)', color: '#6fd13a', match: ['GU'] },
  { label: 'Other', color: '#b79cff', match: [] },
];
export const FLOOD_COLORS = { VE: '#ff4fa3', AE: '#19b6e6', X: '#cfefff' } as const;

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
    sources: {
      satellite: { type: 'raster', tiles: [SATELLITE], tileSize: 256, maxzoom: 19, attribution: ATTRIBUTION },
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
      { id: 'sky', type: 'background', paint: { 'background-color': '#7fd3f5' } },
      { id: 'satellite', type: 'raster', source: 'satellite', paint: { 'raster-saturation': 0.25, 'raster-contrast': 0.08, 'raster-brightness-min': 0.04 } },
      {
        id: 'flood-fill', type: 'fill', source: 'flood', layout: { visibility: 'none' },
        filter: ['in', ['get', 'zone'], ['literal', ['VE', 'AE']]],
        paint: { 'fill-color': ['match', ['get', 'zone'], 'VE', FLOOD_COLORS.VE, FLOOD_COLORS.AE], 'fill-opacity': ['match', ['get', 'zone'], 'VE', 0.42, 0.28] },
      },
      {
        id: 'flood-line', type: 'line', source: 'flood', layout: { visibility: 'none' },
        filter: ['==', ['get', 'zone'], 'VE'],
        paint: { 'line-color': FLOOD_COLORS.VE, 'line-width': 1.5 },
      },
      { id: 'zoning-fill', type: 'fill', source: 'zoning', layout: { visibility: 'none' }, paint: { 'fill-color': zoningColor as never, 'fill-opacity': 0.3 } },
      { id: 'zoning-line', type: 'line', source: 'zoning', layout: { visibility: 'none' }, paint: { 'line-color': '#ffffff', 'line-opacity': 0.55, 'line-width': 0.6 } },
      {
        id: 'areas-fill', type: 'fill', source: 'areas',
        paint: {
          'fill-color': ['interpolate', ['linear'], ['coalesce', ['feature-state', 'resilience'], 40], 0, '#ff4f6d', 35, '#ffb020', 60, '#9be85a', 100, '#19e6c1'],
          'fill-opacity': ['case', ['==', ['feature-state', 'eligible'], false], 0.08, ['boolean', ['feature-state', 'target'], false], 0.75, 0.58],
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
      {
        id: 'areas-glow', type: 'line', source: 'areas',
        paint: { 'line-color': '#ffffff', 'line-width': 9, 'line-blur': 7, 'line-opacity': ['case', ['==', ['feature-state', 'eligible'], false], 0.1, 0.75] },
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
    ],
  };
}

/** All four areas, with a little room. */
const AREA_BOUNDS = (() => {
  const xs = DISTRICTS.flatMap((d) => [d.bbox[0], d.bbox[2]]);
  const ys = DISTRICTS.flatMap((d) => [d.bbox[1], d.bbox[3]]);
  return [[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]] as LngLatBoundsLike;
})();

export interface CityMapProps {
  city: CityState;
  spotlight?: string[];
  target?: string | null;
  /** When a card is chosen: which areas it may go to (others dim). */
  eligible?: Record<string, boolean> | null;
  overlays: Overlays;
  onPick?: (districtId: string) => void;
  /** Fly the camera to an area (null: the overview). */
  focus?: string | null;
  /** Room to keep clear for the HUD, in px. */
  padding?: { top: number; bottom: number; left: number; right: number };
  onReady?: (map: MapLibreMap) => void;
  /** Hide the chips (studio uses its own markers). */
  chips?: boolean;
  /** Extra text per area chip (e.g. counts in the studio). */
  chipNote?: (districtId: string) => string | null;
  className?: string;
}

export function CityMap({ city, spotlight = [], target = null, eligible = null, overlays, onPick, focus = null, padding, onReady, chips = true, chipNote, className = '' }: CityMapProps) {
  const container = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<MapLibreMap | null>(null);
  const [loaded, setLoaded] = useState(false);
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;
  const chipEls = useRef(new Map<string, HTMLButtonElement>());
  const markerSets = useRef(new Map<string, Marker[]>());
  const pad = padding ?? { top: 40, bottom: 40, left: 40, right: 40 };
  const padRef = useRef(pad);
  padRef.current = pad;

  // Landscape screens turn the barrier island sideways (north to the left) so all four areas fit.
  const bearing = () => (container.current && container.current.clientWidth > container.current.clientHeight * 1.15 ? -90 : 0);

  useEffect(() => {
    if (!container.current) return;
    const m = new MapLibreMap({
      container: container.current,
      style: style(),
      bounds: AREA_BOUNDS,
      fitBoundsOptions: { padding: padRef.current, bearing: bearing() },
      attributionControl: { compact: true },
      maxZoom: 18,
      minZoom: 11,
      dragRotate: false,
      pitchWithRotate: false,
    });
    m.touchZoomRotate.disableRotation();
    m.on('load', () => setLoaded(true));
    m.on('click', 'areas-fill', (e) => {
      const id = e.features?.[0]?.properties?.id;
      if (typeof id === 'string') onPickRef.current?.(id);
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
        el.addEventListener('click', (ev) => {
          ev.stopPropagation();
          onPickRef.current?.(d.id);
        });
        chipEls.current.set(d.id, el);
        const below = d.id === 'south-pointe';
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
  }, [map, loaded, overlays.flood, overlays.zoning]);

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
      el.dataset.target = String(target === d.id);
      el.dataset.spot = String(spotlight.includes(d.id));
      el.dataset.off = String(off);
      el.setAttribute('aria-label', `${d.name}, resilience ${r}${off ? ', not allowed for this card' : ''}`);
      el.innerHTML = `<span class="map-chip-name">${d.name}</span><span class="map-chip-meter"><span style="width:${r}%"></span></span>${note ? `<span class="map-chip-note">${note}</span>` : ''}`;
    }
  }, [city, target, spotlight, eligible, chipNote]);

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
    if (!map) return;
    const p = padRef.current;
    if (focus) {
      const d = DISTRICTS.find((x) => x.id === focus);
      if (!d) return;
      const cam = map.cameraForBounds([[d.bbox[0], d.bbox[1]], [d.bbox[2], d.bbox[3]]], { padding: p, bearing: bearing() });
      if (cam) map.flyTo({ ...cam, zoom: Math.min(cam.zoom ?? 15, 16.2), duration: 1400, essential: true });
    } else {
      map.fitBounds(AREA_BOUNDS, { padding: p, bearing: bearing(), duration: 1200 });
    }
  }, [map, focus, pad.top, pad.bottom, pad.left, pad.right]);

  return (
    <div className={`relative h-full w-full overflow-hidden ${className}`}>
      <div ref={container} style={{ position: "absolute", inset: 0 }} />
      <div aria-hidden className="water-shimmer pointer-events-none absolute inset-0" />
    </div>
  );
}
