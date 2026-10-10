// The Living Ocean globe: Esri satellite imagery under a sky-blue atmosphere, with OpenFreeMap
// labels and borders on top. Optional data layers (the Sources panel on the landing page):
//   relief  NOAA NCEI global DEM mosaic hillshade (seafloor and land relief), as raster tiles
//   heat    NOAA Coral Reef Watch Degree Heating Weeks around the chosen reef (GeoJSON from our server)
//   sites   where each reef's data sources measure (points from the reef packs)
import type { LayerSpecification, Map as MapLibreMap, StyleSpecification } from 'maplibre-gl';
import { REEFS } from '@shared';

const TILES = 'https://tiles.openfreemap.org/planet';
const GLYPHS = 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf';
const ATTRIBUTION =
  '<a href="https://openfreemap.org" target="_blank">OpenFreeMap</a> ' +
  '<a href="https://www.openmaptiles.org/" target="_blank">&copy; OpenMapTiles</a> ' +
  'Data from <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>';
const SATELLITE_TILES = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const SATELLITE_ATTRIBUTION = 'Imagery <a href="https://www.esri.com" target="_blank">&copy; Esri</a>, Maxar, Earthstar Geographics';
const RELIEF_TILES =
  'https://gis.ngdc.noaa.gov/arcgis/rest/services/DEM_mosaics/DEM_global_mosaic_hillshade/ImageServer/exportImage?bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857&size=256,256&format=png&f=image';
const RELIEF_ATTRIBUTION = 'Relief <a href="https://www.ncei.noaa.gov/products/etopo-global-relief-model" target="_blank">NOAA NCEI</a>';

const REGULAR = ['Noto Sans Regular'];
const BOLD = ['Noto Sans Bold'];

export type DataLayer = 'satellite' | 'relief' | 'heat' | 'sites';

/** Map layer ids each toggle shows or hides. */
export const LAYER_IDS: Record<DataLayer, string[]> = {
  satellite: ['satellite'],
  relief: ['relief'],
  heat: ['heat-fill'],
  sites: ['sites-dot', 'sites-label'],
};

/** Every point a reef's data comes from, for the Data sites layer. */
function sitesGeoJson() {
  return {
    type: 'FeatureCollection' as const,
    features: REEFS.flatMap((reef) =>
      reef.sources.filter((s) => s.at).map((s) => ({
        type: 'Feature' as const,
        properties: { label: s.label.split(':')[0] ?? s.label, provenance: s.provenance },
        geometry: { type: 'Point' as const, coordinates: s.at! },
      })),
    ),
  };
}

/** Heat stress colours: NOAA's alert levels (4 and 8 °C-weeks) on a cool-to-hot ramp. */
const HEAT_COLOR = ['interpolate', ['linear'], ['get', 'dhw'], 0, '#7fe3ff', 1, '#c8f7a0', 2, '#ffe066', 4, '#ff9b42', 8, '#e8344a', 12, '#8a1238'];

export function globeStyle(on: Record<DataLayer, boolean>): StyleSpecification {
  const vis = (l: DataLayer) => (on[l] ? 'visible' : 'none') as 'visible' | 'none';
  const label = { 'text-color': '#ffffff', 'text-halo-color': 'rgba(6,58,91,0.85)', 'text-halo-width': 1.6 };
  const layers: LayerSpecification[] = [
    { id: 'ocean', type: 'background', paint: { 'background-color': '#0a6aa0' } },
    { id: 'water', type: 'fill', source: 'omt', 'source-layer': 'water', paint: { 'fill-color': '#1593cf' } },
    {
      id: 'satellite',
      type: 'raster',
      source: 'satellite',
      layout: { visibility: vis('satellite') },
      paint: { 'raster-saturation': 0.15, 'raster-contrast': 0.05, 'raster-fade-duration': 200 },
    },
    { id: 'relief', type: 'raster', source: 'relief', layout: { visibility: vis('relief') }, paint: { 'raster-opacity': 0.55 } },
    { id: 'heat-fill', type: 'fill', source: 'heat', layout: { visibility: vis('heat') }, paint: { 'fill-color': HEAT_COLOR as never, 'fill-opacity': 0.62 } },
    {
      id: 'countries',
      type: 'line',
      source: 'omt',
      'source-layer': 'boundary',
      filter: ['all', ['==', ['get', 'admin_level'], 2], ['!=', ['get', 'maritime'], 1]],
      paint: { 'line-color': '#ffffff', 'line-opacity': 0.45, 'line-width': 0.8 },
    },
    {
      id: 'country-names',
      type: 'symbol',
      source: 'omt',
      'source-layer': 'place',
      maxzoom: 5,
      filter: ['==', ['get', 'class'], 'country'],
      layout: { 'text-field': ['get', 'name:en'], 'text-font': BOLD, 'text-size': 11, 'text-max-width': 8 },
      paint: label,
    },
    {
      id: 'place-names',
      type: 'symbol',
      source: 'omt',
      'source-layer': 'place',
      minzoom: 6,
      filter: ['match', ['get', 'class'], ['city', 'town', 'village', 'island'], true, false],
      layout: { 'text-field': ['get', 'name'], 'text-font': REGULAR, 'text-size': 12 },
      paint: label,
    },
    {
      id: 'sites-dot',
      type: 'circle',
      source: 'sites',
      layout: { visibility: vis('sites') },
      paint: { 'circle-radius': 6, 'circle-color': '#ffe066', 'circle-stroke-color': '#063a5b', 'circle-stroke-width': 2 },
    },
    {
      id: 'sites-label',
      type: 'symbol',
      source: 'sites',
      layout: { visibility: vis('sites'), 'text-field': ['get', 'label'], 'text-font': BOLD, 'text-size': 11, 'text-offset': [0, 1.3], 'text-anchor': 'top' },
      paint: { 'text-color': '#ffe066', 'text-halo-color': '#063a5b', 'text-halo-width': 1.6 },
    },
  ];
  return {
    version: 8,
    projection: { type: 'globe' },
    glyphs: GLYPHS,
    // The Aero sky: a bright horizon fading to space as you zoom out.
    sky: {
      'sky-color': '#7fd3ff',
      'horizon-color': '#e8fbff',
      'fog-color': '#bfeaff',
      'sky-horizon-blend': 0.6,
      'horizon-fog-blend': 0.5,
      'fog-ground-blend': 0.85,
      'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 5, 1, 8, 0],
    },
    sources: {
      omt: { type: 'vector', url: TILES, attribution: ATTRIBUTION },
      satellite: { type: 'raster', tiles: [SATELLITE_TILES], tileSize: 256, maxzoom: 19, attribution: SATELLITE_ATTRIBUTION },
      relief: { type: 'raster', tiles: [RELIEF_TILES], tileSize: 256, maxzoom: 12, attribution: RELIEF_ATTRIBUTION },
      heat: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
      sites: { type: 'geojson', data: sitesGeoJson() },
    },
    layers,
  };
}

export function setLayer(map: MapLibreMap, layer: DataLayer, visible: boolean) {
  for (const id of LAYER_IDS[layer]) if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none');
}

export { HEAT_COLOR };
