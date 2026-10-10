// The workshop's build state: pieces with undo/redo history, the active tool, rotation, snapping,
// selection and the hover target. Pure state; the 3D scene and the HUD both read it.
import { create } from 'zustand';
import {
  BUILD_GRID, MATERIAL_BUDGET, SHAPES, occupancy, pieceCells, pieceSize, placementProblem,
  type Piece, type PieceKind, type PlacementProblem, type Rotation,
} from '@shared';

export type Tool = PieceKind | 'select';
/** Coarse snapping steps by the 5-voxel (2.5 mm) module every piece is built from. */
export const COARSE_SNAP = 5;
const HISTORY = 200;

export interface Candidate {
  piece: Omit<Piece, 'id'>;
  problem: PlacementProblem | 'budget' | null;
}

interface BuildState {
  pieces: Piece[];
  past: Piece[][];
  future: Piece[][];
  tool: Tool;
  rot: Rotation;
  fine: boolean;
  selected: string | null;
  /** The selected piece follows the pointer until the next click. */
  moving: boolean;
  /** The grid cell under the pointer where a piece's base would sit. */
  hover: [number, number, number] | null;
  setTool: (t: Tool) => void;
  rotate: () => void;
  toggleFine: () => void;
  setHover: (c: [number, number, number] | null) => void;
  select: (id: string | null) => void;
  startMove: () => void;
  /** Put a moving piece back where it was. */
  cancel: () => void;
  /** Place the current tool's piece (or drop the moving piece) at the hover target. */
  commit: () => boolean;
  removeSelected: () => void;
  undo: () => void;
  redo: () => void;
  load: (pieces: Piece[]) => void;
  clear: () => void;
}

let nextId = 1;
const newId = () => `p${Date.now().toString(36)}${(nextId++).toString(36)}`;

/** Material a piece list fills (pieces never overlap, so it is a plain sum). */
export const materialOfPieces = (pieces: readonly Piece[]) => pieces.reduce((n, p) => n + pieceCells(p).length, 0);

/** What the next click would do: which piece where, and whether it is allowed. */
export function candidateOf(s: Pick<BuildState, 'pieces' | 'tool' | 'rot' | 'fine' | 'selected' | 'moving' | 'hover'>): Candidate | null {
  if (!s.hover) return null;
  const moving = s.moving && s.selected ? s.pieces.find((p) => p.id === s.selected) : undefined;
  const kind = moving?.kind ?? (s.tool === 'select' ? null : s.tool);
  if (!kind) return null;
  const rot = moving?.rot ?? s.rot;
  const [w, , d] = pieceSize(kind, rot);
  const [cx, cy, cz] = s.hover;
  let x = cx - Math.floor(w / 2);
  let z = cz - Math.floor(d / 2);
  if (!s.fine) {
    x = Math.round(x / COARSE_SNAP) * COARSE_SNAP;
    z = Math.round(z / COARSE_SNAP) * COARSE_SNAP;
  }
  // Keep the footprint on the tile when the pointer is near an edge.
  x = Math.max(0, Math.min(BUILD_GRID.nx - w, x));
  z = Math.max(0, Math.min(BUILD_GRID.nz - d, z));
  const piece = { kind, rot, x, y: cy, z };
  const occ = occupancy(BUILD_GRID, s.pieces, moving?.id);
  let problem: Candidate['problem'] = placementProblem(BUILD_GRID, occ, piece);
  const others = moving ? s.pieces.filter((p) => p.id !== moving.id) : s.pieces;
  if (!problem && materialOfPieces(others) + pieceCells(piece).length > MATERIAL_BUDGET) problem = 'budget';
  return { piece, problem };
}

/** Pieces that rest on `id` (directly or through others) would float if it moved or went away. */
function dependents(pieces: Piece[], id: string): Set<string> {
  const gone = new Set([id]);
  for (;;) {
    const occ = occupancy(BUILD_GRID, pieces.filter((p) => !gone.has(p.id)));
    let grew = false;
    for (const p of pieces) {
      if (gone.has(p.id)) continue;
      const cells = pieceCells(p);
      const own = new Set(cells.map(([x, y, z]) => `${x},${y},${z}`));
      const held = cells.some(([x, y, z]) => y === 0 || (!own.has(`${x},${y - 1},${z}`) && occ[x + BUILD_GRID.nx * (y - 1 + BUILD_GRID.ny * z)]));
      if (!held) {
        gone.add(p.id);
        grew = true;
      }
    }
    if (!grew) return gone;
  }
}

export const useBuild = create<BuildState>((set, get) => {
  /** Every edit goes through here, so undo sees it. */
  const edit = (pieces: Piece[], extra: Partial<BuildState> = {}) =>
    set((s) => ({ pieces, past: [...s.past, s.pieces].slice(-HISTORY), future: [], ...extra }));

  return {
    pieces: [],
    past: [],
    future: [],
    tool: 'ridge',
    rot: 0,
    fine: false,
    selected: null,
    moving: false,
    hover: null,
    setTool: (tool) => set({ tool, moving: false, selected: tool === 'select' ? get().selected : null }),
    rotate: () => {
      const s = get();
      if (s.selected && !s.moving) {
        // Rotate the selected piece in place, if it still fits.
        const p = s.pieces.find((q) => q.id === s.selected);
        if (!p) return;
        const turned = { ...p, rot: ((p.rot + 1) % 4) as Rotation };
        const occ = occupancy(BUILD_GRID, s.pieces, p.id);
        // Only when it fits and nothing rests on it (dependents always includes the piece itself).
        if (!placementProblem(BUILD_GRID, occ, turned) && dependents(s.pieces, p.id).size === 1) {
          edit(s.pieces.map((q) => (q.id === p.id ? turned : q)));
        }
        return;
      }
      if (s.moving && s.selected) {
        set({ pieces: s.pieces.map((q) => (q.id === s.selected ? { ...q, rot: ((q.rot + 1) % 4) as Rotation } : q)) });
        return;
      }
      set({ rot: ((s.rot + 1) % 4) as Rotation });
    },
    toggleFine: () => set((s) => ({ fine: !s.fine })),
    setHover: (hover) => {
      const h = get().hover;
      if (h === hover || (h && hover && h[0] === hover[0] && h[1] === hover[1] && h[2] === hover[2])) return;
      set({ hover });
    },
    select: (selected) => set({ selected, moving: false }),
    startMove: () => {
      const s = get();
      if (!s.selected) return;
      // Something resting on it would float: refuse rather than break the stack.
      if (dependents(s.pieces, s.selected).size > 1) return;
      set({ moving: true, past: [...s.past, s.pieces].slice(-HISTORY), future: [] });
    },
    cancel: () => {
      const s = get();
      if (s.moving) {
        const prev = s.past.at(-1);
        set({ moving: false, ...(prev ? { pieces: prev, past: s.past.slice(0, -1) } : {}) });
      } else set({ selected: null });
    },
    commit: () => {
      const s = get();
      const c = candidateOf(s);
      if (!c || c.problem) return false;
      if (s.moving && s.selected) {
        set({ pieces: s.pieces.map((p) => (p.id === s.selected ? { ...p, ...c.piece } : p)), moving: false });
      } else {
        edit([...s.pieces, { id: newId(), ...c.piece }]);
      }
      return true;
    },
    removeSelected: () => {
      const s = get();
      if (!s.selected) return;
      // Removing a piece also removes whatever would be left floating on it.
      const gone = dependents(s.pieces, s.selected);
      edit(s.pieces.filter((p) => !gone.has(p.id)), { selected: null, moving: false });
    },
    undo: () => {
      const s = get();
      const prev = s.past.at(-1);
      if (!prev) return;
      set({ pieces: prev, past: s.past.slice(0, -1), future: [s.pieces, ...s.future], selected: null, moving: false });
    },
    redo: () => {
      const s = get();
      const next = s.future[0];
      if (!next) return;
      set({ pieces: next, past: [...s.past, s.pieces], future: s.future.slice(1), selected: null, moving: false });
    },
    load: (pieces) => edit(pieces.map((p) => ({ ...p })), { selected: null, moving: false }),
    clear: () => edit([], { selected: null, moving: false }),
  };
});

export { SHAPES };
