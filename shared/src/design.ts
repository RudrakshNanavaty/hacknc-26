// A design is the set of filled voxels on the build tile. The workshop's pieces (ridge, arch,
// tunnel ...) are stamps that fill voxels; the engine only ever sees the voxels, so any piece set
// is evaluated the same way.
//
// Format (v1): { grid, solid } where solid lists filled voxel indices x + nx * (y + ny * z).
// Compatible extension: `pieces`, the editable stamps. When present, `solid` must equal the union
// of their voxels, and the pieces must be valid (inside, no overlaps, nothing floating).
import { BUILD_GRID, MATERIAL_BUDGET } from './config';
import { type Piece, piecesProblems, solidOf } from './pieces';
import type { PrototypeMetrics } from './sim/prototype';

export interface Grid {
  nx: number;
  ny: number;
  nz: number;
}

export interface Design {
  grid: Grid;
  /** Filled voxels as indices `x + nx * (y + ny * z)`, each once. */
  solid: number[];
  /** The editable pieces that fill `solid` (absent for raw voxel designs). */
  pieces?: Piece[];
}

export const voxelIndex = (g: Grid, x: number, y: number, z: number) => x + g.nx * (y + g.ny * z);

export function voxelXyz(g: Grid, i: number): [number, number, number] {
  const x = i % g.nx;
  const yz = (i - x) / g.nx;
  const y = yz % g.ny;
  return [x, y, (yz - y) / g.ny];
}

/** A design from pieces: the union of their voxels, plus the pieces themselves. */
export function designOf(pieces: Piece[], grid: Grid = BUILD_GRID): Design {
  return { grid: { ...grid }, solid: solidOf(grid, pieces), pieces: pieces.map((p) => ({ ...p })) };
}

/** Voxels filled: the material a design costs. */
export const materialOf = (d: Design) => d.solid.length;

/** What is wrong with a design sent by a client; empty when it is valid. */
export function designProblems(value: unknown, budget = MATERIAL_BUDGET): string[] {
  const d = value as Partial<Design> | null;
  if (!d || typeof d !== 'object') return ['no design'];
  const g = d.grid;
  if (!g || g.nx !== BUILD_GRID.nx || g.ny !== BUILD_GRID.ny || g.nz !== BUILD_GRID.nz) {
    return [`grid must be ${BUILD_GRID.nx}x${BUILD_GRID.ny}x${BUILD_GRID.nz}`];
  }
  if (!Array.isArray(d.solid)) return ['solid must be a list of voxel indices'];
  const size = g.nx * g.ny * g.nz;
  const problems: string[] = [];
  if (d.solid.some((i) => !Number.isInteger(i) || i < 0 || i >= size)) problems.push('a voxel is outside the tile');
  if (new Set(d.solid).size !== d.solid.length) problems.push('a voxel is listed twice');
  if (d.solid.length > budget) problems.push(`uses ${d.solid.length} voxels, the budget is ${budget}`);
  if (d.pieces !== undefined) {
    if (!Array.isArray(d.pieces)) return [...problems, 'pieces must be a list'];
    if (d.pieces.length > 2000) return [...problems, 'too many pieces'];
    const bad = piecesProblems(g, d.pieces);
    if (bad.length) problems.push(...bad);
    else {
      const want = solidOf(g, d.pieces);
      const have = [...d.solid].sort((a, b) => a - b);
      if (want.length !== have.length || want.some((v, k) => v !== have[k])) problems.push('solid does not match the pieces');
    }
  }
  return problems;
}

/** One evaluated design. */
export interface ExperimentResult {
  material: number;
  /** Simulated larvae settled / released, 0..1. null until the validated settlement engine exists. */
  settlementRate: number | null;
  /** What the prototype flow showed (encounters, shelter time ...); not a settlement result. */
  prototype: PrototypeMetrics | null;
  /** Engine version that produced the numbers, for reproducibility. */
  model: string;
  seed: number;
}

/**
 * Ranking. With settlement rates (the validated engine), higher settlement first. Until then the
 * explicit arcade objective: the most larvae reaching the structure, then less material. Designs
 * without numbers rank last.
 */
export function compareResults(a: ExperimentResult, b: ExperimentResult): number {
  if (a.settlementRate !== null && b.settlementRate !== null) return b.settlementRate - a.settlementRate || a.material - b.material;
  const ra = a.prototype?.reachedStructure ?? -1;
  const rb = b.prototype?.reachedStructure ?? -1;
  return rb - ra || a.material - b.material;
}
