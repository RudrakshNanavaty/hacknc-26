import { useEffect, useRef, useState } from "react";
import type { ExperimentRecord } from "../../contracts";
import type { MissionAttempt } from "../../experiment/missions";
import { deleteRecord, exportRecordJson, listRecords, parseRecord, type SavedRecord } from "../../experiment/storage";
import { GhostButton } from "../components/GhostButton/GhostButton";
import styles from "./views.module.css";

/** Saved designs side by side, with load / export / delete / import. */
export function RecordsView({ onLoad, onError }: { onLoad(r: ExperimentRecord, mission?: MissionAttempt): void; onError(msg: string): void }) {
  const [items, setItems] = useState<SavedRecord[] | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const refresh = () => listRecords().then(setItems, () => setItems([]));
  useEffect(() => {
    refresh();
  }, []);

  const onImport = async (file: File) => {
    try {
      onLoad(parseRecord(await file.text()));
    } catch (e) {
      onError(e instanceof Error ? e.message : "Could not read that file");
    }
  };

  return (
    <div className={styles.stack}>
      {items === null ? (
        <p className={styles.muted}>Loading…</p>
      ) : items.length === 0 ? (
        <p className={styles.muted}>No saved designs yet. Run a design, then press Save.</p>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Design</th>
              <th>Settled</th>
              <th>Per surface</th>
              <th>Seed</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.id}>
                <td>
                  {it.name}
                  <div className={styles.muted}>{new Date(it.savedAt).toLocaleString()}</div>
                </td>
                <td>{it.record.results.settlementPct.toFixed(1)}%</td>
                <td>{it.record.results.normalizedScore?.toFixed(1) ?? "—"}</td>
                <td>{it.record.config.seed}</td>
                <td className={styles.rowActions}>
                  <GhostButton size="sm" onClick={() => onLoad(it.record, it.mission)}>
                    Load
                  </GhostButton>
                  <GhostButton size="sm" icon="download" aria-label={`Export ${it.name}`} onClick={() => exportRecordJson(it.record, `${it.name}.json`)} />
                  <GhostButton size="sm" icon="trash" aria-label={`Delete ${it.name}`} onClick={() => deleteRecord(it.id).then(refresh)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className={styles.actions}>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onImport(f);
            e.target.value = "";
          }}
        />
        <GhostButton icon="upload" onClick={() => fileRef.current?.click()}>
          Import record JSON
        </GhostButton>
      </div>
    </div>
  );
}
