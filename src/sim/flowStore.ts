/**
 * Persistent cache of computed flow cycles (IndexedDB), keyed by geometry, flow
 * parameters and simulator version. A cached cycle is the exact Float32 data the
 * solver produced, so results are bit-identical with or without the cache.
 */
import { createStore, del, get, set } from "idb-keyval";
import type { FlowCycle } from "./flow";
import { SIM_VERSION } from "./params";

const LIMIT = 10; // ~3.3 MB per cycle
const INDEX_KEY = "__index";

let store: ReturnType<typeof createStore> | null = null;
const db = () => (store ??= createStore("reefforge-flow", "cycles"));
const fullKey = (key: string) => `${SIM_VERSION}|${key}`;

export async function loadFlow(key: string): Promise<FlowCycle | undefined> {
  try {
    return await get<FlowCycle>(fullKey(key), db());
  } catch {
    return undefined; // storage unavailable: recompute
  }
}

export async function saveFlow(key: string, flow: FlowCycle): Promise<void> {
  try {
    const k = fullKey(key);
    const index = ((await get<string[]>(INDEX_KEY, db())) ?? []).filter((x) => x !== k);
    index.push(k);
    while (index.length > LIMIT) await del(index.shift()!, db());
    await set(k, flow, db());
    await set(INDEX_KEY, index, db());
  } catch {
    /* storage full or unavailable: the in-memory cache still works */
  }
}
