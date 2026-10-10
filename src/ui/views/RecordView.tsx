import type { ExperimentRecord } from "../../contracts";
import { exportRecordJson } from "../../experiment/storage";
import { GhostButton } from "../components/GhostButton/GhostButton";
import styles from "./views.module.css";

/** Shows the reproducible experiment record for the current run. */
export function RecordView({ record, onRerun }: { record: ExperimentRecord; onRerun(r: ExperimentRecord): void }) {
  const p = record.config.params;
  return (
    <div className={styles.stack}>
      <p>
        Everything needed to reproduce this run: geometry, grid, physical scale, recorded parameters, simulator version and seed.
        The same record always gives the same result.
      </p>
      <dl className={styles.kv}>
        <dt>Profile</dt>
        <dd>
          {record.profile.name} ({record.profile.segments.length} segments)
        </dd>
        <dt>Grid</dt>
        <dd>
          {record.config.grid.nx} × {record.config.grid.ny} cells of {record.config.grid.cellSizeMm} mm
        </dd>
        <dt>Flow</dt>
        <dd>
          {record.physical.peakVelocityCmS} cm/s peak, {record.physical.periodS.toFixed(2)} s period, Re {record.physical.reynolds.toFixed(0)}
        </dd>
        <dt>Larvae</dt>
        <dd>
          {p.larvaeCount} released, swim {p.swimSpeedMmS} mm/s, attach p = {p.cueAttachProb} below {p.attachMaxSpeedMmS} mm/s
        </dd>
        <dt>Seed · version</dt>
        <dd>
          {record.config.seed} · sim {record.config.simVersion}
        </dd>
        <dt>Result</dt>
        <dd>
          {record.results.settled} / {record.results.released} settled = {record.results.settlementPct.toFixed(2)}%
        </dd>
      </dl>
      <div className={styles.actions}>
        <GhostButton icon="download" onClick={() => exportRecordJson(record, `reefforge-${record.profile.id}-seed${record.config.seed}.json`)}>
          Export JSON
        </GhostButton>
        <GhostButton icon="play" onClick={() => onRerun(record)}>
          Re-run from this record
        </GhostButton>
      </div>
      <details>
        <summary className={styles.h}>Raw record</summary>
        <pre className={styles.pre}>{JSON.stringify({ ...record, results: { ...record.results, settledX: `[${record.results.settledX.length} values]` } }, null, 2)}</pre>
      </details>
    </div>
  );
}
