import { describe, expect, it } from 'vitest';
import { BUILD_GRID, MATERIAL_BUDGET, VOXEL_MM } from './config';
import { compareResults, designOf, designProblems, materialOf, voxelIndex, voxelXyz, type ExperimentResult } from './design';
import { surfaceTriangles, designToStl } from './mesh';
import { occupancy, pieceCells, pieceSize, placementProblem, piecesProblems, type Piece } from './pieces';
import { flatTile, gardenTile, ridgedTile } from './references';
import { REEFS } from './reefs';
import { defaultParams, runPrototype } from './sim/prototype';
import { evaluateDesign } from './sim/evaluate';

const g = BUILD_GRID;
const kaneohe = REEFS[0]!.flow!;

describe('design format', () => {
  it('voxel indices round-trip', () => {
    for (const [x, y, z] of [[0, 0, 0], [95, 23, 47], [10, 4, 7]] as const) expect(voxelXyz(g, voxelIndex(g, x, y, z))).toEqual([x, y, z]);
  });

  it('refuses wrong grids, out-of-tile and repeated voxels, over-budget designs, and pieces that do not match', () => {
    expect(designProblems(null)).toEqual(['no design']);
    expect(designProblems({ grid: { nx: 1, ny: 1, nz: 1 }, solid: [] })[0]).toMatch(/grid must be/);
    const size = g.nx * g.ny * g.nz;
    expect(designProblems({ grid: g, solid: [size] })).toContain('a voxel is outside the tile');
    expect(designProblems({ grid: g, solid: [3, 3] })).toContain('a voxel is listed twice');
    expect(designProblems({ grid: g, solid: Array.from({ length: MATERIAL_BUDGET + 1 }, (_, i) => i) })[0]).toMatch(/budget/);
    const d = ridgedTile();
    expect(designProblems(d)).toEqual([]);
    expect(designProblems({ ...d, solid: d.solid.slice(1) })).toContain('solid does not match the pieces');
    expect(designProblems({ ...d, pieces: [{ id: 'x', kind: 'block', x: 0, y: 3, z: 0, rot: 0 }] })).toContain('piece x is floating');
  });

  it('the ridged reference has Levenstein et al. 2022 geometry: 2.5 mm tall, 7.5 mm gaps', () => {
    const d = ridgedTile();
    const cells = d.solid.map((i) => voxelXyz(d.grid, i));
    expect(Math.max(...cells.map(([, y]) => y)) + 1).toBe(2.5 / VOXEL_MM);
    const xs = [...new Set(cells.filter(([, y, z]) => y === 0 && z === 0).map(([x]) => x))].sort((a, b) => a - b);
    const starts = xs.filter((x, k) => k === 0 || x !== xs[k - 1]! + 1);
    for (let k = 1; k < starts.length; k++) expect(starts[k]! - starts[k - 1]!).toBe((2.5 + 7.5) / VOXEL_MM);
    // Full width across the flow.
    expect(new Set(cells.map(([, , z]) => z)).size).toBe(g.nz);
  });
});

describe('pieces', () => {
  it('rotation keeps the voxel count and swaps the footprint', () => {
    for (const kind of ['block', 'ridge', 'arch', 'tunnel'] as const) {
      const counts = ([0, 1, 2, 3] as const).map((rot) => pieceCells({ kind, x: 0, y: 0, z: 0, rot }).length);
      expect(new Set(counts).size).toBe(1);
      const [w, , d] = pieceSize(kind, 1);
      const cells = pieceCells({ kind, x: 0, y: 0, z: 0, rot: 1 });
      expect(Math.max(...cells.map(([x]) => x)) + 1).toBe(w);
      expect(Math.max(...cells.map(([, , z]) => z)) + 1).toBe(d);
      expect(Math.min(...cells.flatMap(([x, , z]) => [x, z]))).toBe(0);
    }
  });

  it('arches and tunnels leave their 5 x 5 opening empty', () => {
    const arch = new Set(pieceCells({ kind: 'arch', x: 0, y: 0, z: 0, rot: 0 }).map((c) => c.join()));
    expect(arch.has('7,2,2')).toBe(false);
    expect(arch.has('7,7,2')).toBe(true);
  });

  it('checks bounds, overlaps and support', () => {
    const base: Piece = { id: 'a', kind: 'block', x: 0, y: 0, z: 0, rot: 0 };
    const occ = occupancy(g, [base]);
    expect(placementProblem(g, occ, { ...base, x: 2 })).toBe('overlap');
    expect(placementProblem(g, occ, { ...base, x: g.nx - 2 })).toBe('outside');
    expect(placementProblem(g, occ, { ...base, x: 20, y: 5 })).toBe('floating');
    expect(placementProblem(g, occ, { ...base, y: 5 })).toBeNull(); // stacked
    // Order does not matter: a piece listed before its support is still valid.
    expect(piecesProblems(g, [{ ...base, id: 'top', y: 5 }, base])).toEqual([]);
    expect(piecesProblems(g, [base, { ...base, id: 'a' }])).toEqual(expect.arrayContaining([expect.stringMatching(/overlapping|twice/)]));
  });

  it('every template is valid', () => {
    for (const d of [flatTile(), ridgedTile(), gardenTile()]) expect(designProblems(d)).toEqual([]);
  });
});

describe('prototype flow', () => {
  const quick = (seed: number) => ({ ...defaultParams(kaneohe, seed), larvae: 80, durationS: 3 });

  it('is deterministic for a seed and changes with it', () => {
    const a = runPrototype(ridgedTile(), quick(5));
    const b = runPrototype(ridgedTile(), quick(5));
    const c = runPrototype(ridgedTile(), quick(6));
    expect(b.metrics).toEqual(a.metrics);
    expect(Buffer.from(b.frames.buffer).equals(Buffer.from(a.frames.buffer))).toBe(true);
    expect(Buffer.from(c.frames.buffer).equals(Buffer.from(a.frames.buffer))).toBe(false);
  });

  it('never puts a larva inside a solid voxel or below the floor', () => {
    const d = gardenTile();
    const run = runPrototype(d, quick(9));
    const solid = new Set(d.solid);
    for (let i = 0; i < run.frames.length; i += 3) {
      const [x, y, z] = [run.frames[i]!, run.frames[i + 1]!, run.frames[i + 2]!];
      expect(y).toBeGreaterThanOrEqual(0);
      if (y < g.ny) expect(solid.has(voxelIndex(g, Math.floor(x), Math.floor(y), Math.floor(z)))).toBe(false);
    }
  });

  it('a flat tile has no structure to reach; a structure is reached', () => {
    expect(runPrototype(flatTile(), quick(1)).metrics.reachedStructure).toBe(0);
    expect(runPrototype(ridgedTile(), quick(1)).metrics.reachedStructure).toBeGreaterThan(0);
  });

  it('evaluation reports prototype metrics and never a settlement rate', () => {
    const r = evaluateDesign(ridgedTile(), kaneohe, 42);
    expect(r.settlementRate).toBeNull();
    expect(r.model).toBe('prototype-flow-0.1');
    expect(r.material).toBe(materialOf(ridgedTile()));
    expect(r.prototype?.released).toBe(300);
  });
});

describe('mesh', () => {
  it('one voxel is a closed cube of 12 triangles; touching voxels share no inner faces', () => {
    const one = { grid: g, solid: [0] };
    expect(surfaceTriangles(one).length / 9).toBe(12);
    const two = { grid: g, solid: [0, 1] };
    expect(surfaceTriangles(two).length / 9).toBe(20);
    expect(designToStl(two).byteLength).toBe(84 + 20 * 50);
  });
});

describe('ranking', () => {
  const r = (material: number, reached: number | null, settlementRate: number | null = null): ExperimentResult => ({
    material, settlementRate, model: 'm', seed: 1,
    prototype: reached === null ? null : { released: 300, reachedStructure: reached, structureContacts: 0, reachedFloor: 0, meanNearStructureS: 0, meanShelteredS: 0, durationS: 1 },
  });

  it('arcade objective until the settlement engine exists: most larvae reached, then less material', () => {
    const a = r(100, 50), b = r(50, 50), c = r(10, 20), d = r(1, null);
    expect([a, b, c, d].sort(compareResults)).toEqual([b, a, c, d]);
  });

  it('settlement rates win when both designs have one', () => {
    expect([r(1, 99, 0.05), r(1, 1, 0.14)].sort(compareResults).map((x) => x.settlementRate)).toEqual([0.14, 0.05]);
  });

  it('designOf keeps pieces editable', () => {
    expect(designOf([{ id: 'p', kind: 'block', x: 0, y: 0, z: 0, rot: 0 }]).pieces).toHaveLength(1);
  });
});
