// How each real-terrain reef is presented. Terrain and imagery come from measurements
// (public/terrain/<site>/terrain.json lists them); everything in `generated` is artwork placed by
// the game, and the HUD's "What's real here" panel says so.
import type { ReefId } from '@shared';

export interface WorldStyle {
  site: string;
  /** Water colour and fog (visibility in metres ~ 3 / density). */
  water: string;
  fog: string;
  fogDensity: number;
  /** Where the camera starts (local metres) and how fast you swim (m/s). */
  start: [number, number, number];
  swimSpeed: number;
  /** Minimum height of the camera above the seabed (m). */
  clearance: number;
  /** Water surface height in the terrain's vertical datum (m). */
  surface: number;
  /** Scale of the caustic pattern on the seabed (m per cycle). */
  causticScale: number;
  /** Generated decoration density (per 100 m²) and palettes. */
  decor: { gorgonians: number; corals: number; sponges: number; seagrass: number; rocks: number };
  fish: { schools: number; scale: number };
  /** The finest real terrain detail, shown in "What's real here". */
  resolution: string;
  /** Text for "What's real here". */
  real: string[];
  generated: string[];
}

export const WORLDS: Partial<Record<ReefId, WorldStyle>> = {
  'florida-keys': {
    site: 'florida-keys',
    water: '#1d8fb0',
    fog: '#2a9cbd',
    fogDensity: 0.055,
    start: [6, -2.2, 18],
    swimSpeed: 2.2,
    clearance: 0.35,
    surface: 0,
    causticScale: 1.6,
    decor: { gorgonians: 0.9, corals: 0.25, sponges: 0.35, seagrass: 0, rocks: 0 },
    fish: { schools: 7, scale: 1 },
    resolution: '1 cm elevation, 5 mm imagery (resampled for the web)',
    real: [
      'Seabed shape: USGS SQUID-5 photogrammetry DEM, 1 cm, Eastern Dry Rocks, May 2021',
      'Seabed colours: USGS SQUID-5 orthomosaic of the same survey, aligned to the same grid',
      'Depths: metres below NAVD88; position in NAD83(2011) / UTM 17N',
    ],
    generated: [
      'Fish, sea fans, sponges and the few 3D corals (artwork placed by the game)',
      'Water colour, fog, light rays and caustics',
      'Small gaps in the survey, filled by interpolation (devices cannot be placed there)',
    ],
  },
  'heron-island': {
    site: 'heron-island',
    water: '#1aa6c4',
    fog: '#3cb6d1',
    fogDensity: 0.006,
    start: [0, -3, 120],
    swimSpeed: 18,
    clearance: 0.8,
    surface: 0,
    causticScale: 6,
    decor: { gorgonians: 0, corals: 0.02, sponges: 0.004, seagrass: 0.03, rocks: 0.004 },
    fish: { schools: 9, scale: 1.6 },
    resolution: '30 m elevation, 10 m imagery: the reef platform is real, close-up detail is not',
    real: [
      'Reef platform, lagoon and slope shape: Geoscience Australia GBR 30 m depth model (Beaman 2020), CC BY 4.0',
      'Seabed colours: Copernicus Sentinel-2 true colour, 10 m (contains modified Copernicus Sentinel data 2025)',
      'Depths: metres relative to approximate mean sea level; position in WGS 84 / UTM 56S',
    ],
    generated: [
      'Every feature smaller than the 30 m terrain grid: bumps, corals, seagrass and rocks (artwork)',
      'Fish, water colour, fog, light rays and caustics',
    ],
  },
};
