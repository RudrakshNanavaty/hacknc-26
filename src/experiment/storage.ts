/** Save/load experiment records in IndexedDB, plus JSON export/import. */
import { createStore, del, entries, set } from "idb-keyval";
import type { ExperimentRecord } from "../contracts";

export interface SavedRecord {
  id: string;
  savedAt: string;
  name: string;
  record: ExperimentRecord;
}

let store: ReturnType<typeof createStore> | null = null;
const db = () => (store ??= createStore("reefforge", "records"));

export async function saveRecord(record: ExperimentRecord, name: string): Promise<SavedRecord> {
  const saved: SavedRecord = { id: `rec-${Date.now()}`, savedAt: new Date().toISOString(), name, record };
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
  if (!r || typeof r !== "object" || !r.profile?.segments || !r.config?.params || !r.results) {
    throw new Error("Not a ReefForge experiment record");
  }
  return r;
}
