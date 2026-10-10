// Saving and loading designs: browser slots (per-viewer convenience), JSON files (the experiment
// design format, re-loadable here and by the server), and STL meshes for CAD and 3D printing.
import { MATERIAL_BUDGET, designOf, designProblems, designToStl, type Design, type Piece } from '@shared';

const KEY = 'reefforge.designs';

export interface Saved {
  name: string;
  savedAt: string;
  pieces: Piece[];
}

export function savedDesigns(): Saved[] {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) ?? '[]') as Saved[];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function saveDesign(name: string, pieces: Piece[]): boolean {
  try {
    const list = savedDesigns().filter((s) => s.name !== name);
    localStorage.setItem(KEY, JSON.stringify([{ name, savedAt: new Date().toISOString(), pieces }, ...list].slice(0, 20)));
    return true;
  } catch {
    return false;
  }
}

function download(name: string, data: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const exportJson = (pieces: Piece[]) =>
  download('reefforge-design.json', JSON.stringify({ format: 'reefforge-design/1', ...designOf(pieces) }, null, 1), 'application/json');

export const exportStl = (design: Design) => download('reefforge-design.stl', designToStl(design), 'model/stl');

/** Reads a design file; only piece-based designs that pass the server's own checks are accepted. */
export async function importJson(file: File): Promise<{ pieces: Piece[] } | { error: string }> {
  try {
    const d = JSON.parse(await file.text()) as Partial<Design>;
    if (!Array.isArray(d.pieces)) return { error: 'This file has no editable pieces.' };
    const problems = designProblems(designOf(d.pieces), MATERIAL_BUDGET);
    return problems.length ? { error: `This design is not valid: ${problems[0]}` } : { pieces: d.pieces };
  } catch {
    return { error: 'That is not a ReefForge design file.' };
  }
}
