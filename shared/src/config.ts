// Game config. Values marked game-defined are tuning knobs, not science; change them freely.

/** The build tile, in voxels: x runs with the flow, y is up, z is across the flow. */
export const BUILD_GRID = { nx: 96, ny: 24, nz: 48 } as const;

/**
 * Edge of one voxel in millimetres. 0.5 mm lets the tile hold Levenstein et al. (2022)'s reference
 * ridges exactly (2.5 mm tall = 5 voxels, 7.5 mm apart = 15 voxels). Tile: 48 x 12 x 24 mm.
 */
export const VOXEL_MM = 0.5;

/** Game-defined: how many voxels a design may fill. */
export const MATERIAL_BUDGET = 12000;

/** Game-defined: seconds of narrated briefing, then of building, in a room. */
export const BRIEFING_SECONDS = 20;
export const BUILD_SECONDS = 180;
