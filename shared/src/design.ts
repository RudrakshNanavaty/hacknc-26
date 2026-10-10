// A design is the set of filled voxels on the build tile. The workshop's pieces (ridge, arch,
// helix ...) are stamps that fill voxels; the engine and the server only ever see the voxels, so
// any piece set scores the same way.
import { BUILD_GRID, MATERIAL_BUDGET } from './config';

export interface Grid {
  nx: number;
  ny: number;
  nz: number;
}

export interface Design {
  grid: Grid;
  /** Filled voxels as indices `x + nx * (y + ny * z)`, each once. */
  solid: number[];
}

export const voxelIndex = (g: Grid, x: number, y: number, z: number) => x + g.nx * (y + g.ny * z);

export function voxelXyz(g: Grid, i: number): [number, number, number] {
  const x = i % g.nx;
  const yz = (i - x) / g.nx;
  const y = yz % g.ny;
  return [x, y, (yz - y) / g.ny];
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
  return problems;
}

/** One evaluated design. `settlementRate` is null until the flow and larvae engine is in. */
export interface ExperimentResult {
  material: number;
  /** Simulated larvae settled / released, 0..1. */
  settlementRate: number | null;
  /** Engine version that produced the numbers, for reproducibility. */
  model: string;
  seed: number;
}

/**
 * Scores a design under a reef's conditions. The flow solver and larval model plug in here
 * (docs/reefforge-one-pager.md section 9); until then only material is computed and the rate stays null,
 * so nothing shows a number the engine did not produce.
 */
export function evaluateDesign(design: Design, seed: number): ExperimentResult {
  return { material: materialOf(design), settlementRate: null, model: 'pending', seed };
}

/**
 * Ranking (the winner rule): higher simulated settlement first, then less material.
 * Designs without a rate rank after those with one.
 */
export function compareResults(a: ExperimentResult, b: ExperimentResult): number {
  const ra = a.settlementRate ?? -1;
  const rb = b.settlementRate ?? -1;
  return rb - ra || a.material - b.material;
}
