/** Minimal undo/redo stack over immutable values. */
export interface History<T> {
  past: T[];
  present: T;
  future: T[];
}

const LIMIT = 100;

export const historyInit = <T,>(present: T): History<T> => ({ past: [], present, future: [] });

export function historyPush<T>(h: History<T>, next: T): History<T> {
  return { past: [...h.past, h.present].slice(-LIMIT), present: next, future: [] };
}

export function historyUndo<T>(h: History<T>): History<T> {
  const prev = h.past.at(-1);
  if (prev === undefined) return h;
  return { past: h.past.slice(0, -1), present: prev, future: [h.present, ...h.future] };
}

export function historyRedo<T>(h: History<T>): History<T> {
  const [next, ...rest] = h.future;
  if (next === undefined) return h;
  return { past: [...h.past, h.present], present: next, future: rest };
}
