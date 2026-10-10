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
  /** Arrival: the camera starts on the slope inside this elevation band (m), looking uphill. */
  startBand: [number, number];
  /** Swimming speed (m/s); scroll changes it. */
  swimSpeed: number;
  /** Minimum height of the camera above the seabed (m). */
  clearance: number;
  /** Water surface height in the terrain's vertical datum (m). */
  surface: number;
  /** Scale of the caustic pattern on the seabed (m per cycle). */
  causticScale: number;
  /**
   * Generated relief finer than the measured grid (coarse sources only): samples across the window
   * and the noise amplitude (m) as a function of elevation. Listed as generated in the HUD.
   */
  relief?: { samples: number; amplitude: (elevation: number) => number };
  /** Generated fine seabed texture over coarse imagery. */
  detailTexture?: boolean;
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
    startBand: [-7.2, -4.5],
    swimSpeed: 2.2,
    clearance: 0.35,
    surface: 0,
    causticScale: 1.6,
    // The orthomosaic already shows the real sea fans and corals: generated 3D life is only a light accent.
    decor: { gorgonians: 0.35, corals: 0.1, sponges: 0.2, seagrass: 0, rocks: 0 },
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
    water: '#1784ad',
    fog: '#2b9cc0',
    fogDensity: 0.032,
    startBand: [-13, -6],
    swimSpeed: 3.5,
    clearance: 0.6,
    surface: 0,
    causticScale: 1.8,
    // Reef crest and upper slope are rough; the flat and deep sand much less so.
    relief: { samples: 513, amplitude: (e) => (e > -2 ? 0.3 : e > -12 ? 1.4 : 0.5) },
    detailTexture: true,
    decor: { gorgonians: 0.08, corals: 0.6, sponges: 0.08, seagrass: 0.1, rocks: 0.15 },
    fish: { schools: 10, scale: 1.2 },
    resolution: '30 m elevation, 10 m imagery: the reef edge is real, close-up detail is generated',
    real: [
      'Shape of the reef flat, crest and slope: Geoscience Australia GBR 30 m depth model (Beaman 2020), CC BY 4.0',
      'Seabed colours: Copernicus Sentinel-2 true colour, 10 m (contains modified Copernicus Sentinel data 2025)',
      'Depths: metres relative to approximate mean sea level; position in WGS 84 / UTM 56S',
    ],
    generated: [
      'Every feature smaller than the 30 m terrain grid: bumps and ridges in the seabed, its fine texture, corals, seagrass and rocks (artwork)',
      'Seabed colour below ~14 m, where the satellite cannot see the bottom',
      'Fish, water colour, fog, light rays and caustics',
    ],
  },
};
