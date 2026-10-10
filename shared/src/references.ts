// Templates for the workshop and Research Mode. Published reference tiles are the validation
// targets (docs/scientific-data-audit.md); the garden is a game-made starting point, labelled so.
import { BUILD_GRID } from './config';
import { type Design, designOf } from './design';
import type { Piece } from './pieces';
import { SHAPES } from './pieces';

export interface ReferenceTile {
  id: string;
  name: string;
  source: string;
  /** published: geometry from a paper. game: a starting point we made. */
  kind: 'published' | 'game';
  /** Where the geometry is approximate, and why. */
  note: string | null;
  design: Design;
}

/** Flat substrate: nothing above the tile floor. The control in every study. */
export function flatTile(): Design {
  return designOf([]);
}

/**
 * Ridges across the flow, full width: 2.5 mm tall and wide, 7.5 mm apart edge to edge
 * (Levenstein et al. 2022, spacing/height = 3), built from ridge pieces.
 */
export function ridgedTile(): Design {
  const [w, , d] = SHAPES.ridge.size; // 5 x 5 x 16 voxels
  const gap = 15; // 7.5 mm
  const pieces: Piece[] = [];
  for (let x = Math.floor(gap / 2); x + w <= BUILD_GRID.nx; x += w + gap) {
    for (let z = 0; z + d <= BUILD_GRID.nz; z += d) pieces.push({ id: `r${x}-${z}`, kind: 'ridge', x, y: 0, z, rot: 0 });
  }
  return designOf(pieces);
}

/** A playful mix of every piece: arches, a tunnel and a stack. Game-made, not from a paper. */
export function gardenTile(): Design {
  return designOf([
    { id: 'g1', kind: 'tunnel', x: 8, y: 0, z: 16, rot: 0 },
    { id: 'g2', kind: 'arch', x: 40, y: 0, z: 6, rot: 0 },
    { id: 'g3', kind: 'arch', x: 40, y: 0, z: 34, rot: 0 },
    { id: 'g4', kind: 'ridge', x: 60, y: 0, z: 16, rot: 0 },
    { id: 'g5', kind: 'block', x: 78, y: 0, z: 20, rot: 0 },
    { id: 'g6', kind: 'block', x: 78, y: 5, z: 20, rot: 0 },
    { id: 'g7', kind: 'block', x: 78, y: 10, z: 20, rot: 0 },
    { id: 'g8', kind: 'ridge', x: 70, y: 0, z: 2, rot: 1 },
  ]);
}

export const REFERENCE_TILES: readonly ReferenceTile[] = [
  {
    id: 'flat',
    name: 'Flat tile',
    source: 'Control in Levenstein et al. 2022 and Reichert et al. 2025',
    kind: 'published',
    note: null,
    design: flatTile(),
  },
  {
    id: 'ridges-2.5mm',
    name: '2.5 mm ridges',
    source: 'Levenstein et al. 2022, PLOS ONE (their simulation: 14.2% settle vs 7.6% on flat)',
    kind: 'published',
    // Fig S7 of the paper has the exact profile; transcribe it to replace this assumption.
    note: 'Ridge width assumed 2.5 mm until the Fig S7 profile is transcribed.',
    design: ridgedTile(),
  },
  {
    id: 'garden',
    name: 'Reef garden',
    source: 'A starting point made for the game, not from a paper',
    kind: 'game',
    note: null,
    design: gardenTile(),
  },
];
