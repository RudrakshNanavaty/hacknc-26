// Grid <-> world. The tile is magnified for play: one 0.5 mm voxel is 0.1 world units, so the
// 48 x 24 mm tile is a 9.6 x 4.8 platform. The tile is centred on the origin, its floor at y = 0.
import { BUILD_GRID } from '@shared';

export const S = 0.1;
export const { nx: NX, ny: NY, nz: NZ } = BUILD_GRID;
export const HALF_X = (NX * S) / 2;
export const HALF_Z = (NZ * S) / 2;

/** World centre of voxel (x, y, z), or of any point in voxel units. */
export const toWorld = (x: number, y: number, z: number): [number, number, number] => [(x - NX / 2) * S, y * S, (z - NZ / 2) * S];

/** The voxel cell containing a world point. */
export const toCell = (wx: number, wy: number, wz: number): [number, number, number] => [
  Math.floor(wx / S + NX / 2),
  Math.floor(wy / S),
  Math.floor(wz / S + NZ / 2),
];

export const inTile = (x: number, y: number, z: number) => x >= 0 && z >= 0 && y >= 0 && x < NX && z < NZ && y < NY;

/** Piece colours: a glazed-ceramic coral palette. */
export const PIECE_COLOR = {
  block: '#ffb59a',
  ridge: '#ff7a8a',
  arch: '#b79cff',
  tunnel: '#4fd6e8',
} as const;
