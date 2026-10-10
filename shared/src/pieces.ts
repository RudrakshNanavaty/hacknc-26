// Workshop pieces: voxel stamps the builder places on the tile. A design keeps its pieces (so it
// can be edited again) and the union of their voxels (what the engine evaluates). Sizes are in
// voxels (0.5 mm); the ridge's 5 x 5 cross-section is Levenstein et al. 2022's 2.5 mm ridge.
import type { Grid } from './design';
import { voxelIndex } from './design';

export const PIECE_KINDS = ['block', 'ridge', 'arch', 'tunnel'] as const;
export type PieceKind = (typeof PIECE_KINDS)[number];
export const isPieceKind = (v: unknown): v is PieceKind => typeof v === 'string' && (PIECE_KINDS as readonly string[]).includes(v);

/** Quarter turns about the vertical axis. */
export type Rotation = 0 | 1 | 2 | 3;

export interface Piece {
  id: string;
  kind: PieceKind;
  /** The piece's minimum corner on the grid, after rotation. */
  x: number;
  y: number;
  z: number;
  rot: Rotation;
}

interface Shape {
  /** Width (x), height (y), depth (z) before rotation. */
  size: [number, number, number];
  filled: (x: number, y: number, z: number) => boolean;
}

export const SHAPES: Record<PieceKind, Shape> = {
  block: { size: [5, 5, 5], filled: () => true },
  ridge: { size: [5, 5, 16], filled: () => true },
  // Two legs and a lintel: a 5 x 5 opening under a 15-wide span.
  arch: { size: [15, 10, 5], filled: (x, y) => y >= 5 || x < 5 || x >= 10 },
  // The arch run long: a sheltered 5 x 5 channel through it.
  tunnel: { size: [15, 10, 16], filled: (x, y) => y >= 5 || x < 5 || x >= 10 },
};

/** Size on the grid after rotation: odd quarter turns swap width and depth. */
export function pieceSize(kind: PieceKind, rot: Rotation): [number, number, number] {
  const [w, h, d] = SHAPES[kind].size;
  return rot % 2 ? [d, h, w] : [w, h, d];
}

/** The piece's voxels as grid coordinates (may fall outside the grid; see placementProblem). */
export function pieceCells(p: Pick<Piece, 'kind' | 'x' | 'y' | 'z' | 'rot'>): [number, number, number][] {
  const { size, filled } = SHAPES[p.kind];
  const [w, h, d] = size;
  const out: [number, number, number][] = [];
  for (let lx = 0; lx < w; lx++) {
    for (let ly = 0; ly < h; ly++) {
      for (let lz = 0; lz < d; lz++) {
        if (!filled(lx, ly, lz)) continue;
        // Rotate the local cell, then shift so the rotated piece's minimum corner is at (0, 0).
        let rx = lx;
        let rz = lz;
        if (p.rot === 1) [rx, rz] = [d - 1 - lz, lx];
        else if (p.rot === 2) [rx, rz] = [w - 1 - lx, d - 1 - lz];
        else if (p.rot === 3) [rx, rz] = [lz, w - 1 - lx];
        out.push([p.x + rx, p.y + ly, p.z + rz]);
      }
    }
  }
  return out;
}

export type PlacementProblem = 'outside' | 'overlap' | 'floating';

/**
 * Why a piece cannot go where it is, given the voxels already filled (`occupied`, one byte per
 * voxel; pass the occupancy without this piece when moving it). Pieces must stay inside the tile,
 * must not overlap, and must rest on the tile floor or on another piece.
 */
export function placementProblem(grid: Grid, occupied: Uint8Array, p: Pick<Piece, 'kind' | 'x' | 'y' | 'z' | 'rot'>): PlacementProblem | null {
  let supported = false;
  for (const [x, y, z] of pieceCells(p)) {
    if (x < 0 || y < 0 || z < 0 || x >= grid.nx || y >= grid.ny || z >= grid.nz) return 'outside';
    if (occupied[voxelIndex(grid, x, y, z)]) return 'overlap';
    if (y === 0 || occupied[voxelIndex(grid, x, y - 1, z)]) supported = true;
  }
  return supported ? null : 'floating';
}

/** One byte per voxel: 1 where any of `pieces` fills it. */
export function occupancy(grid: Grid, pieces: readonly Piece[], skip?: string): Uint8Array {
  const occ = new Uint8Array(grid.nx * grid.ny * grid.nz);
  for (const p of pieces) {
    if (p.id === skip) continue;
    for (const [x, y, z] of pieceCells(p)) {
      if (x >= 0 && y >= 0 && z >= 0 && x < grid.nx && y < grid.ny && z < grid.nz) occ[voxelIndex(grid, x, y, z)] = 1;
    }
  }
  return occ;
}

/** The sorted voxel indices a set of pieces fills (each once). */
export function solidOf(grid: Grid, pieces: readonly Piece[]): number[] {
  const occ = occupancy(grid, pieces);
  const out: number[] = [];
  for (let i = 0; i < occ.length; i++) if (occ[i]) out.push(i);
  return out;
}

/**
 * Problems with a whole piece list, placed in order (so support can come from earlier pieces):
 * empty when every piece is valid.
 */
export function piecesProblems(grid: Grid, pieces: readonly Piece[]): string[] {
  const occ = new Uint8Array(grid.nx * grid.ny * grid.nz);
  const problems: string[] = [];
  const ids = new Set<string>();
  const wellFormed = (p: Piece) =>
    !!p && typeof p.id === 'string' && isPieceKind(p.kind) && [0, 1, 2, 3].includes(p.rot) && [p.x, p.y, p.z].every(Number.isInteger);
  for (const p of pieces) if (!wellFormed(p)) problems.push(`piece ${String(p?.id)} is malformed`);
  if (problems.length) return problems;
  // Supported pieces first: a piece resting on a later piece in the list is still valid.
  const pending = [...pieces];
  let progress = true;
  while (pending.length && progress) {
    progress = false;
    for (let k = 0; k < pending.length; k++) {
      const p = pending[k]!;
      if (placementProblem(grid, occ, p) === 'floating') continue;
      pending.splice(k--, 1);
      progress = true;
      if (ids.has(p.id)) problems.push(`piece id ${p.id} is used twice`);
      ids.add(p.id);
      const why = placementProblem(grid, occ, p);
      if (why) {
        problems.push(`piece ${p.id} is ${why === 'outside' ? 'outside the tile' : 'overlapping another piece'}`);
        continue;
      }
      for (const [x, y, z] of pieceCells(p)) occ[voxelIndex(grid, x, y, z)] = 1;
    }
  }
  for (const p of pending) problems.push(`piece ${p.id} is floating`);
  return problems;
}
