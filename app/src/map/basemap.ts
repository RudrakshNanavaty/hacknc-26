// The board's street map, ported from Mayday Mayor (map/basemap.ts, same team): OpenFreeMap's
// OpenMapTiles vector tiles drawn as a printed street map in chalk and ink, with 3D buildings from
// the tiles' heights, real street and place names, and the FEMA flood zones as water. Satellite
// imagery is a toggle, as in Mayday Mayor.
import type { ExpressionSpecification, LayerSpecification } from 'maplibre-gl';

export const TILES = 'https://tiles.openfreemap.org/planet';
export const GLYPHS = 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf';
export const SATELLITE_TILES = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
export const ATTRIBUTION =
  '<a href="https://openfreemap.org" target="_blank">OpenFreeMap</a> <a href="https://www.openmaptiles.org/" target="_blank">&copy; OpenMapTiles</a> ' +
  'Data from <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> · ' +
  'Zoning: <a href="https://gis.miamibeachfl.gov/public/rest/services" target="_blank">City of Miami Beach GIS</a> · ' +
  'FEMA flood zones: <a href="https://gisweb.miamidade.gov/ArcGIS/rest/services" target="_blank">Miami-Dade County GIS</a>';
export const SATELLITE_ATTRIBUTION = 'Imagery <a href="https://www.esri.com" target="_blank">&copy; Esri</a>, Maxar, Earthstar Geographics';

const REGULAR = ['Noto Sans Regular'];
const BOLD = ['Noto Sans Bold'];
const ITALIC = ['Noto Sans Italic'];

/** Mayday Mayor's day palette. */
export const INK = {
  land: '#dce4e1', // chalk
  paper: '#f7f9f8', // bond
  ink: '#1e2a47',
  water: '#0078bf', // flood
  deep: '#00508a', // flood-deep
  green: '#00a95c', // safe
};

const notTunnel: ExpressionSpecification = ['!=', ['get', 'brunnel'], 'tunnel'];
const isClass = (classes: string[]): ExpressionSpecification => ['match', ['get', 'class'], classes, true, false];
const roadClass = (classes: string[]): ExpressionSpecification => ['all', notTunnel, isClass(classes)];
const width = (...stops: number[]): ExpressionSpecification => ['interpolate', ['exponential', 1.5], ['zoom'], ...stops] as ExpressionSpecification;
const rgba = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

const MINOR = ['minor', 'service'];
const MAJOR = ['primary', 'secondary', 'tertiary', 'trunk'];

/** A street drawn as a fill inside a thin casing, like a printed street map. */
function street(id: string, classes: string[], minzoom: number, casing: number[], fill: number[], casingOpacity: number): LayerSpecification[] {
  return [
    {
      id: `${id}-casing`, type: 'line', source: 'omt', 'source-layer': 'transportation', minzoom, filter: roadClass(classes),
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': INK.ink, 'line-opacity': casingOpacity, 'line-width': width(...casing) },
    },
    {
      id, type: 'line', source: 'omt', 'source-layer': 'transportation', minzoom, filter: roadClass(classes),
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': INK.paper, 'line-width': width(...fill) },
    },
  ];
}

/** Land, green, water and imagery: everything under the flood zones. */
export function groundLayers(): LayerSpecification[] {
  return [
    { id: 'land', type: 'background', paint: { 'background-color': INK.land } },
    { id: 'woods', type: 'fill', source: 'omt', 'source-layer': 'landcover', filter: isClass(['wood', 'grass']), paint: { 'fill-color': INK.green, 'fill-opacity': 0.1 } },
    { id: 'parks', type: 'fill', source: 'omt', 'source-layer': 'park', paint: { 'fill-color': INK.green, 'fill-opacity': 0.16 } },
    { id: 'grounds', type: 'fill', source: 'omt', 'source-layer': 'landuse', filter: isClass(['cemetery', 'pitch', 'playground', 'stadium']), paint: { 'fill-color': INK.green, 'fill-opacity': 0.1 } },
    { id: 'water', type: 'fill', source: 'omt', 'source-layer': 'water', filter: notTunnel, paint: { 'fill-color': rgba(INK.water, 0.35) } },
    { id: 'waterway', type: 'line', source: 'omt', 'source-layer': 'waterway', filter: notTunnel, layout: { 'line-cap': 'round' }, paint: { 'line-color': rgba(INK.water, 0.7), 'line-width': width(11, 0.8, 17, 4) } },
    { id: 'satellite', type: 'raster', source: 'satellite', layout: { visibility: 'none' }, paint: { 'raster-fade-duration': 150 } },
  ];
}

/** Footprints and streets: drawn over the flood water, so the city reads through it. */
export function streetLayers(): LayerSpecification[] {
  return [
    { id: 'buildings', type: 'fill', source: 'omt', 'source-layer': 'building', minzoom: 13, paint: { 'fill-color': rgba(INK.ink, 0.08) } },
    { id: 'rail', type: 'line', source: 'omt', 'source-layer': 'transportation', minzoom: 11, filter: roadClass(['rail', 'transit']), paint: { 'line-color': rgba(INK.ink, 0.6), 'line-width': width(11, 0.6, 17, 1.6), 'line-dasharray': [3, 2] } },
    ...street('roads-minor', MINOR, 13, [13, 0.8, 17, 9], [13, 0.4, 17, 7.5], 0.3),
    ...street('roads-major', MAJOR, 10, [10, 1, 17, 14], [10, 0.4, 17, 11.5], 0.55),
    ...street('roads-motorway', ['motorway'], 8, [8, 1.2, 17, 18], [8, 0.4, 17, 14], 0.75),
  ];
}

/** 3D buildings from the tiles' heights. */
export function buildings3dLayer(): LayerSpecification {
  return {
    id: 'buildings-3d', type: 'fill-extrusion', source: 'omt', 'source-layer': 'building', minzoom: 12,
    filter: ['!=', ['get', 'hide_3d'], true],
    paint: {
      'fill-extrusion-color': '#d8d3ca',
      'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 6],
      'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
      'fill-extrusion-opacity': 0.92,
    },
  };
}

export function labelLayers(): LayerSpecification[] {
  const label = { 'text-color': INK.ink, 'text-halo-color': INK.land, 'text-halo-width': 1.5 };
  return [
    { id: 'water-names', type: 'symbol', source: 'omt', 'source-layer': 'water_name', layout: { 'text-field': ['get', 'name'], 'text-font': ITALIC, 'text-size': 12 }, paint: label },
    { id: 'waterway-names', type: 'symbol', source: 'omt', 'source-layer': 'waterway', minzoom: 13, layout: { 'symbol-placement': 'line', 'text-field': ['get', 'name'], 'text-font': ITALIC, 'text-size': 12 }, paint: label },
    { id: 'street-names-minor', type: 'symbol', source: 'omt', 'source-layer': 'transportation_name', minzoom: 15, filter: isClass(MINOR), layout: { 'symbol-placement': 'line', 'text-field': ['get', 'name'], 'text-font': REGULAR, 'text-size': 11 }, paint: label },
    {
      id: 'street-names-major', type: 'symbol', source: 'omt', 'source-layer': 'transportation_name', minzoom: 12, filter: isClass([...MAJOR, 'motorway']),
      layout: { 'symbol-placement': 'line', 'text-field': ['get', 'name'], 'text-font': REGULAR, 'text-size': ['interpolate', ['linear'], ['zoom'], 13, 11, 17, 13] }, paint: label,
    },
    {
      id: 'place-names', type: 'symbol', source: 'omt', 'source-layer': 'place', filter: isClass(['city', 'town', 'suburb', 'neighbourhood', 'quarter']),
      layout: { 'text-field': ['get', 'name'], 'text-font': BOLD, 'text-size': ['match', ['get', 'class'], ['city', 'town'], 15, 13], 'text-max-width': 8 },
      paint: { ...label, 'text-halo-width': 2 },
    },
  ];
}

/** Printed-map layers that fade out when the satellite imagery is on, with their full opacity. */
export const PRINT_FADE: [string, string, number][] = [
  ['woods', 'fill-opacity', 0.1],
  ['parks', 'fill-opacity', 0.16],
  ['grounds', 'fill-opacity', 0.1],
  ['buildings', 'fill-opacity', 1],
  ['roads-minor-casing', 'line-opacity', 0.3],
  ['roads-major-casing', 'line-opacity', 0.55],
  ['roads-motorway-casing', 'line-opacity', 0.75],
];
