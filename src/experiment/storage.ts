/** Save/load experiment records in IndexedDB, plus JSON export/import. */
import { createStore, del, entries, set } from "idb-keyval";
import type { ExperimentRecord } from "../contracts";
import type { MissionAttempt } from "./missions";
import { buildError } from "./missions";
import { DEFAULT_GRID, SIM_VERSION } from "../sim/params";

export interface SavedRecord {
  id: string;
  savedAt: string;
  name: string;
  record: ExperimentRecord;
  mission?: MissionAttempt;
}

let store: ReturnType<typeof createStore> | null = null;
const db = () => (store ??= createStore("reefforge", "records"));

export async function saveRecord(record: ExperimentRecord, name: string, mission?: MissionAttempt): Promise<SavedRecord> {
  const saved: SavedRecord = { id: `rec-${crypto.randomUUID()}`, savedAt: new Date().toISOString(), name, record, ...(mission ? { mission } : {}) };
  await set(saved.id, saved, db());
  return saved;
}

export async function listRecords(): Promise<SavedRecord[]> {
  const all = await entries<string, SavedRecord>(db());
  return all.map(([, v]) => v).sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

export const deleteRecord = (id: string) => del(id, db());

export function exportRecordJson(record: ExperimentRecord, filename: string) {
  const blob = new Blob([JSON.stringify(record, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Parse and minimally validate an imported record. */
export function parseRecord(text: string): ExperimentRecord {
  const r = JSON.parse(text) as ExperimentRecord;
  if (!r || typeof r !== "object" || !r.profile?.segments || !r.config?.params || !r.results || !r.physical || !r.diagnostics || !Array.isArray(r.assumptions)) {
    throw new Error("Not a ReefForge experiment record");
  }
  const error = buildError(r.profile);
  if (error) throw new Error(error);
  if (!r.config.grid || r.config.grid.nx !== DEFAULT_GRID.nx || r.config.grid.ny !== DEFAULT_GRID.ny || r.config.grid.cellSizeMm !== DEFAULT_GRID.cellSizeMm || r.config.simVersion !== SIM_VERSION)
    throw new Error("This record uses a grid or simulator version this build cannot reproduce.");
  if (!Array.isArray(r.results.settledX) || r.results.settledX.some(x => !Number.isFinite(x) || x < 0 || x >= DEFAULT_GRID.nx) ||
      !Number.isFinite(r.results.settlementPct) || !Number.isInteger(r.config.seed) || !Number.isFinite(r.physical.peakVelocityCmS))
    throw new Error("The record has invalid results or coordinates.");
  return r;
}
