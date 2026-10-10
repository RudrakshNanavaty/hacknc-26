// The reef packs on the globe and in reef select (the city packs of Mayday Mayor). Only reefs with
// `ready` load a game; the others show on the globe and say they are next.
//
// Every environmental value carries where it came from (docs/scientific-data-audit.md), so the
// game never shows a game-defined number as if it were measured.

/** measured: an instrument at the site. published: a paper's numbers. model: an ocean model's
 *  output. game-defined: a tuning knob we chose. */
export type Provenance = 'measured' | 'published' | 'model' | 'game-defined';

export interface DataSource {
  label: string;
  url: string;
  provenance: Provenance;
  /** Where this source measures, [lon, lat], for the map's Data sites layer. */
  at?: [number, number];
}

/** The water the tile sits in. Oscillating flow sweeps back and forth with `periodS`. */
export interface Flow {
  kind: 'steady' | 'oscillating';
  /** Peak free-stream speed over the tile, cm/s. */
  peakCmS: number;
  periodS: number | null;
  provenance: Provenance;
  source: string;
}

export const REEF_IDS = ['kaneohe', 'heron-island', 'florida-keys', 'maldives'] as const;
export type ReefId = (typeof REEF_IDS)[number];
export const isReefId = (v: unknown): v is ReefId => typeof v === 'string' && (REEF_IDS as readonly string[]).includes(v);

export interface Reef {
  id: ReefId;
  name: string;
  region: string;
  lat: number;
  lon: number;
  /** Playable now. Others show on the globe as coming next. */
  ready: boolean;
  mission: { title: string; brief: string };
  /** null until the flow is derived from the site's data. */
  flow: Flow | null;
  sources: DataSource[];
  /** The reef's imagery extent [west, south, east, north]: the card's picture and where the dive lands. */
  bbox: [number, number, number, number];
  /**
   * An explorable underwater world built from this reef's real terrain (app/public/terrain/<id>/).
   * `center` is the terrain window's centre [lon, lat], where the dive lands.
   */
  world?: { terrain: string; center: [number, number] };
}

/**
 * Levenstein et al. (2022)'s flume conditions, used as the test water on reefs whose own near-bed
 * flow is not derived yet. Labelled as such: it is published, but not measured at that reef.
 */
const REFERENCE_FLOW = (reef: string): Flow => ({
  kind: 'oscillating',
  peakCmS: 4.5,
  periodS: 5.5,
  provenance: 'published',
  source: `Reference flume conditions from Levenstein et al. 2022 (PLOS ONE). Not measured at ${reef}: the site's near-bed flow is not derived yet.`,
});

export const REEFS: readonly Reef[] = [
  {
    id: 'kaneohe',
    name: 'Kāneʻohe Bay',
    region: 'Oʻahu, Hawaiʻi',
    lat: 21.475,
    lon: -157.825,
    ready: true,
    mission: {
      title: 'The Helix Mission',
      brief: 'This is where researchers tested 3D-printed helix-recess modules. Build a tile that beats flat ground for settling larvae.',
    },
    flow: {
      kind: 'oscillating',
      peakCmS: 4.5,
      periodS: 5.5,
      provenance: 'published',
      source: 'Levenstein et al. 2022, PLOS ONE: flume and simulation conditions (within the < 20 cm/s reef-flat currents Lowe et al. 2009 measured in Kāneʻohe Bay)',
    },
    bbox: [-157.87, 21.41, -157.76, 21.51],
    sources: [
      { label: 'Seafloor: NOAA NCEI Oʻahu coastal DEM, 1/3 arc-second', url: 'https://www.ngdc.noaa.gov/thredds/catalog/regional/catalog.html?dataset=regionalDatasetScan/oahu_13_mhw_2011.nc', provenance: 'measured' },
      { label: 'Heat stress: NOAA Coral Reef Watch, daily 5 km', url: 'https://coastwatch.noaa.gov/erddap/griddap/noaacrwdhwDaily', provenance: 'measured', at: [-157.825, 21.475] },
      { label: 'Ridge flow and settlement: Levenstein et al. 2022', url: 'https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0274088', provenance: 'published' },
      { label: 'Helix recesses: Reichert et al. 2025 (preprint)', url: 'https://www.biorxiv.org/content/10.1101/2024.11.14.623685', provenance: 'published' },
    ],
  },
  {
    id: 'heron-island',
    name: 'Heron Reef',
    region: 'Great Barrier Reef, Australia',
    lat: -23.452536,
    lon: 151.920804,
    ready: true,
    mission: { title: 'The Current Challenge', brief: 'Explore the reef platform around Heron Island, pick a site and build a device for strong tidal currents.' },
    // Tile water: the reference conditions until Heron's near-bed flow is derived (docs/simulation-plan.md §4).
    // Measured context: IMOS GBRHIS current meter, 1.41 m above the bed: median 23.8, p90 45.0 cm/s.
    flow: REFERENCE_FLOW('Heron Reef'),
    sources: [
      { label: 'Terrain: Geoscience Australia GBR 30 m depth model 2020 (Beaman), CC BY 4.0', url: 'https://doi.org/10.4225/25/5a207b36022d2', provenance: 'measured' },
      { label: 'Imagery: Copernicus Sentinel-2 L2A, 10 m (contains modified Copernicus Sentinel data 2025)', url: 'https://registry.opendata.aws/sentinel-2-l2a-cogs/', provenance: 'measured' },
      { label: 'Currents: IMOS ANMN mooring GBRHIS (AWAC, 8.7 m), CC BY 4.0', url: 'https://thredds.aodn.org.au/thredds/catalog/IMOS/ANMN/QLD/GBRHIS/Velocity/catalog.html', provenance: 'measured', at: [151.9553, -23.5123] },
    ],
    bbox: [151.88, -23.48, 151.98, -23.41],
    world: { terrain: 'heron-island', center: [151.920804, -23.452536] },
  },
  {
    id: 'florida-keys',
    name: 'Eastern Dry Rocks',
    region: 'Florida Keys, USA',
    lat: 24.461168,
    lon: -81.841361,
    ready: true,
    mission: { title: 'The Recovery Mission', brief: 'Swim a real scanned reef, choose a site on the measured seabed and build a material-efficient device.' },
    flow: REFERENCE_FLOW('Eastern Dry Rocks'),
    sources: [
      { label: 'Terrain + imagery: USGS SQUID-5 1 cm DEM and 5 mm orthomosaic, May 2021 (public domain)', url: 'https://doi.org/10.5066/P93RIIG9', provenance: 'measured', at: [-81.8419, 24.4607] },
      { label: 'Heat stress: NOAA Coral Reef Watch, daily 5 km', url: 'https://coastwatch.noaa.gov/erddap/griddap/noaacrwdhwDaily', provenance: 'measured' },
    ],
    bbox: [-81.8475, 24.4565, -81.8365, 24.4650],
    world: { terrain: 'florida-keys', center: [-81.841361, 24.461168] },
  },
  {
    id: 'maldives',
    name: 'North Malé Atoll',
    region: 'Maldives',
    lat: 4.3,
    lon: 73.5,
    ready: false,
    mission: { title: 'The Efficiency Challenge', brief: 'Build a compact tile under a tighter material budget.' },
    flow: null,
    sources: [],
    bbox: [73.42, 4.2, 73.6, 4.36],
  },
];

export const reefById = (id: ReefId): Reef => REEFS.find((r) => r.id === id)!;

/** Esri World Imagery of the reef's extent (no key; credit Esri wherever it shows). */
export function reefImageUrl(reef: Reef, width = 480, height = 300): string {
  return `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export?bbox=${reef.bbox.join(',')}&bboxSR=4326&imageSR=3857&size=${width},${height}&format=jpg&f=image`;
}
