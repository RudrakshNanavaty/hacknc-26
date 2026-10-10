// Published reference tiles, as designs on the build grid: the validation targets and the
// "compare with research" designs in Research Mode (docs/scientific-data-audit.md).
import { BUILD_GRID, VOXEL_MM } from './config';
import { type Design, voxelIndex } from './design';

export interface ReferenceTile {
  id: string;
  name: string;
  source: string;
  /** Where the geometry is approximate, and why. */
  note: string | null;
  design: Design;
}

const mm = (v: number) => Math.round(v / VOXEL_MM);

/** Flat substrate: nothing above the tile floor. The control in every study. */
export function flatTile(): Design {
  return { grid: { ...BUILD_GRID }, solid: [] };
}

/**
 * Ridges across the flow, full width: 2.5 mm tall, 7.5 mm apart edge to edge (Levenstein et al.
 * 2022, spacing/height = 3). `widthMm` is the ridge's own width.
 */
export function ridgedTile(heightMm = 2.5, gapMm = 7.5, widthMm = 2.5): Design {
  const g = { ...BUILD_GRID };
  const [h, gap, w] = [mm(heightMm), mm(gapMm), mm(widthMm)];
  const solid: number[] = [];
  for (let x0 = Math.floor(gap / 2); x0 + w <= g.nx; x0 += w + gap) {
    for (let x = x0; x < x0 + w; x++) {
      for (let y = 0; y < h; y++) for (let z = 0; z < g.nz; z++) solid.push(voxelIndex(g, x, y, z));
    }
  }
  return { grid: g, solid: solid.sort((a, b) => a - b) };
}

export const REFERENCE_TILES: readonly ReferenceTile[] = [
  {
    id: 'flat',
    name: 'Flat tile',
    source: 'Control in Levenstein et al. 2022 and Reichert et al. 2025',
    note: null,
    design: flatTile(),
  },
  {
    id: 'ridges-2.5mm',
    name: '2.5 mm ridges',
    source: 'Levenstein et al. 2022, PLOS ONE (simulated: 14.2% settle vs 7.6% on flat)',
    // Fig S7 of the paper has the exact profile; transcribe it to replace this assumption.
    note: 'Ridge width assumed 2.5 mm until the Fig S7 profile is transcribed.',
    design: ridgedTile(),
  },
];
