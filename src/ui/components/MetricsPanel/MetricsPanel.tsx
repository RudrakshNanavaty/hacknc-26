import { lazy, Suspense } from "react";
import { baselines, BENCHMARK, FROZEN } from "../../../experiment/benchmark";
import { ASSUMPTIONS } from "../../../sim/pipeline";
import { DEFAULT_GRID } from "../../../sim/params";
import { useApp } from "../../../state/store";
import { AssumptionsList } from "../AssumptionsList/AssumptionsList";
import { BaselineBars } from "../BaselineBars/BaselineBars";
import { GhostButton } from "../GhostButton/GhostButton";
import { ScoreReadout } from "../ScoreReadout/ScoreReadout";
import { Toggle } from "../Toggle/Toggle";
import styles from "./MetricsPanel.module.css";

const Extrusion = lazy(() => import("../../../scene/Extrusion").then((m) => ({ default: m.Extrusion })));

/** Right-region content: score, baselines, controls, diagnostics. Lives inside one GlassPanel. */
export function MetricsPanel({ showExtrusion = true }: { showExtrusion?: boolean }) {
  const record = useApp((s) => s.record);
  const stale = useApp((s) => s.stale);
  const status = useApp((s) => s.status);
  const seed = useApp((s) => s.seed);
  const showFlow = useApp((s) => s.showFlow);
  const reducedMotion = useApp((s) => s.reducedMotion);
  const profile = useApp((s) => s.history.present);
  const set = useApp((s) => s.set);

  const pct = record ? record.results.settlementPct : null;
  const delta = record && baselines ? { value: record.results.settlementPct - baselines.ridge, vs: "ridge" } : null;
  const d = record?.diagnostics;

  return (
    <div className={styles.panel}>
      <ScoreReadout pct={pct} delta={delta} dimmed={stale || status === "running"} />
      {record && (
        <p className={styles.sub}>
          {record.results.settled} of {record.results.released} larvae · exposed surface {record.results.exposedLength.toFixed(1)} mm ·{" "}
          <span title="Settlement % divided by exposed length relative to flat: adding more wall does not win by itself">
            per-surface score {record.results.normalizedScore?.toFixed(1)}
          </span>
        </p>
      )}

      <section className={styles.section}>
        <h3 className={styles.h}>Compared with baselines</h3>
        <BaselineBars flat={baselines?.flat ?? null} ridge={baselines?.ridge ?? null} recess={baselines?.recess ?? null} yours={pct} />
        <p className={styles.note}>
          {BENCHMARK
            ? `Baselines: mean of ${BENCHMARK.seeds.length} pre-registered seeds, frozen parameters.`
            : FROZEN
              ? "Parameters frozen; held-out run pending."
              : "Calibration not frozen yet: scores are provisional."}
        </p>
      </section>

      <section className={styles.section}>
        <h3 className={styles.h}>Run</h3>
        <div className={styles.row}>
          <label className={styles.seed}>
            Seed
            <input
              type="number"
              min={1}
              value={seed}
              onChange={(e) => set({ seed: Math.max(1, Math.floor(Number(e.target.value) || 1)) })}
            />
          </label>
          <GhostButton size="sm" icon="dice" onClick={() => set({ seed: seed + 1 })}>
            Next seed
          </GhostButton>
        </div>
        <Toggle checked={showFlow} label="Show flow arrows" onChange={(v) => set({ showFlow: v })} />
        <Toggle checked={reducedMotion} label="Reduce motion" onChange={(v) => set({ reducedMotion: v })} />
      </section>

      {d && (
        <section className={styles.section}>
          <h3 className={styles.h}>Diagnostics</h3>
          <dl className={styles.diag}>
            <dt>Solver</dt>
            <dd>LBM D2Q9 (TRT)</dd>
            <dt>Reynolds</dt>
            <dd>{record.physical.reynolds.toFixed(0)} on 2.5 mm</dd>
            <dt>Mass drift</dt>
            <dd>{d.massDriftPct.toExponential(1)} %</dd>
            <dt>Max speed</dt>
            <dd>{((d.maxVelocity / record.config.params.peakVelocity) * record.physical.peakVelocityCmS).toFixed(1)} cm/s</dd>
            <dt>Stable</dt>
            <dd className={d.diverged ? styles.bad : styles.good}>{d.diverged ? "diverged" : "yes"}</dd>
          </dl>
        </section>
      )}

      {showExtrusion && (
        <section className={styles.section}>
          <h3 className={styles.h}>Decorative 3D view</h3>
          <div className={styles.extrusion}>
            <Suspense fallback={null}>
              <Extrusion profile={profile} nx={DEFAULT_GRID.nx} animate={!reducedMotion} />
            </Suspense>
          </div>
          <p className={styles.note}>Your profile stretched into 3D for looks. Only the 2D slice is simulated.</p>
        </section>
      )}

      <details className={styles.section}>
        <summary className={styles.h}>Assumptions</summary>
        <AssumptionsList items={record?.assumptions ?? ASSUMPTIONS} />
      </details>
    </div>
  );
}
