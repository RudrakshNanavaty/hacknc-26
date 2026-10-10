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
}

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
    name: 'Heron Island',
    region: 'Great Barrier Reef, Australia',
    lat: -23.5123,
    lon: 151.9553,
    ready: false,
    mission: { title: 'The Current Challenge', brief: 'Build a tile that holds up across the currents measured on this reef.' },
    // Next: speed percentiles from the IMOS GBRHIS current meters (docs/scientific-data-audit.md).
    flow: null,
    sources: [
      { label: 'Currents: IMOS ANMN mooring GBRHIS (ADCP, 8.7 m)', url: 'https://thredds.aodn.org.au/thredds/catalog/IMOS/ANMN/QLD/GBRHIS/Velocity/catalog.html', provenance: 'measured', at: [151.9553, -23.5123] },
    ],
    bbox: [151.88, -23.48, 151.98, -23.41],
  },
  {
    id: 'florida-keys',
    name: 'Florida Keys',
    region: 'Florida, USA',
    lat: 24.546,
    lon: -81.406,
    ready: false,
    mission: { title: 'The Recovery Mission', brief: 'Build a material-efficient tile that improves simulated settlement.' },
    flow: null,
    sources: [
      { label: 'Seafloor: NOAA NGS topobathy lidar, Florida Keys outer reef', url: 'https://www.fisheries.noaa.gov/inport/item/48373', provenance: 'measured' },
    ],
    bbox: [-81.46, 24.51, -81.36, 24.58],
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
