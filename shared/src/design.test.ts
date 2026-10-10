import { describe, expect, it } from 'vitest';
import { BUILD_GRID, MATERIAL_BUDGET, VOXEL_MM } from './config';
import { compareResults, designProblems, evaluateDesign, materialOf, voxelIndex, voxelXyz } from './design';
import { flatTile, ridgedTile } from './references';

describe('design', () => {
  it('voxel indices round-trip', () => {
    const g = BUILD_GRID;
    for (const [x, y, z] of [[0, 0, 0], [95, 23, 15], [10, 4, 7]] as const) {
      expect(voxelXyz(g, voxelIndex(g, x, y, z))).toEqual([x, y, z]);
    }
  });

  it('refuses wrong grids, out-of-tile and repeated voxels, and over-budget designs', () => {
    expect(designProblems(null)).toEqual(['no design']);
    expect(designProblems({ grid: { nx: 1, ny: 1, nz: 1 }, solid: [] })[0]).toMatch(/grid must be/);
    const g = { ...BUILD_GRID };
    const size = g.nx * g.ny * g.nz;
    expect(designProblems({ grid: g, solid: [size] })).toContain('a voxel is outside the tile');
    expect(designProblems({ grid: g, solid: [1.5] })).toContain('a voxel is outside the tile');
    expect(designProblems({ grid: g, solid: [3, 3] })).toContain('a voxel is listed twice');
    expect(designProblems({ grid: g, solid: Array.from({ length: MATERIAL_BUDGET + 1 }, (_, i) => i) })[0]).toMatch(/budget/);
    expect(designProblems(flatTile())).toEqual([]);
  });

  it('the ridged reference has Levenstein et al. 2022 geometry: 2.5 mm tall, 7.5 mm gaps', () => {
    const d = ridgedTile();
    expect(designProblems(d)).toEqual([]);
    const cells = d.solid.map((i) => voxelXyz(d.grid, i));
    expect(Math.max(...cells.map(([, y]) => y)) + 1).toBe(2.5 / VOXEL_MM);
    // Ridge starts along x, from the z = 0, y = 0 row.
    const xs = [...new Set(cells.filter(([, y, z]) => y === 0 && z === 0).map(([x]) => x))].sort((a, b) => a - b);
    const starts = xs.filter((x, k) => k === 0 || x !== xs[k - 1]! + 1);
    const period = (2.5 + 7.5) / VOXEL_MM;
    for (let k = 1; k < starts.length; k++) expect(starts[k]! - starts[k - 1]!).toBe(period);
    expect(starts.length).toBeGreaterThanOrEqual(4);
  });

  it('evaluation never invents a settlement rate before the engine exists', () => {
    const r = evaluateDesign(ridgedTile(), 42);
    expect(r).toEqual({ material: materialOf(ridgedTile()), settlementRate: null, model: 'pending', seed: 42 });
  });

  it('ranks by settlement, then less material, with unrated designs last', () => {
    const base = { model: 'm', seed: 1 };
    const a = { ...base, material: 100, settlementRate: 0.14 };
    const b = { ...base, material: 50, settlementRate: 0.08 };
    const c = { ...base, material: 10, settlementRate: 0.14 };
    const d = { ...base, material: 1, settlementRate: null };
    expect([a, b, c, d].sort(compareResults)).toEqual([c, a, b, d]);
  });
});
