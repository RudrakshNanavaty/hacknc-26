// The character models as pictures, shared by everything that draws a character. Models load lazily
// (three.js is split off the main bundle), each is rendered once, and listeners hear as each arrives;
// until then (or if WebGL or a model is unavailable) callers keep their drawn sprite.
import { useSyncExternalStore } from 'react';
import type { PersonaId } from '@shared';

export type CharacterKey = PersonaId | 'anchor';

export interface Portrait {
  /** The whole figure, turned a little. */
  full: string;
  /** The face, for orbs. */
  face: string;
  /** Head and chest (the news anchor's window). */
  bust: string;
}

const KEYS: CharacterKey[] = ['mayor', 'activist', 'resort', 'resident', 'anchor'];
const ready: Partial<Record<CharacterKey, Portrait>> = {};
const listeners = new Set<() => void>();
let started: Promise<void> | null = null;
let version = 0;

const emit = () => {
  version += 1;
  for (const l of listeners) l();
};

/** Start rendering the portraits (once). Safe to call from anywhere; never throws. */
export function ensurePortraits(): Promise<void> {
  started ??= (async () => {
    try {
      const { loadModel, shoot } = await import('./render');
      for (const key of KEYS) {
        try {
          const model = await loadModel(`/characters/${key}.glb`);
          ready[key] = {
            full: shoot(model, { framing: 'full', yaw: -28 }),
            face: shoot(model, { framing: 'face', yaw: -6 }),
            bust: shoot(model, { framing: 'bust', yaw: -6 }),
          };
          emit();
        } catch {
          // This model failed (missing file, no WebGL): its sprite stays.
        }
      }
    } catch {
      // three.js itself failed to load: sprites everywhere.
    }
  })();
  return started;
}

export const portraitOf = (key: CharacterKey): Portrait | null => ready[key] ?? null;

/** Call back now if the portrait exists, else when it arrives. Returns the unsubscribe. */
export function onPortrait(key: CharacterKey, cb: (p: Portrait) => void): () => void {
  void ensurePortraits();
  const have = ready[key];
  if (have) {
    cb(have);
    return () => {};
  }
  const l = () => {
    const p = ready[key];
    if (p) {
      listeners.delete(l);
      cb(p);
    }
  };
  listeners.add(l);
  return () => void listeners.delete(l);
}

/** React: the portrait, or null until it is ready. */
export function usePortrait(key: CharacterKey): Portrait | null {
  useSyncExternalStore(
    (cb) => {
      void ensurePortraits();
      listeners.add(cb);
      return () => void listeners.delete(cb);
    },
    () => version,
  );
  return ready[key] ?? null;
}
