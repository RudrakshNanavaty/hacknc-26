import { lazy, Suspense } from "react";
import { baselines, BENCHMARK, ciText, FROZEN } from "../../../experiment/benchmark";
import { ASSUMPTIONS } from "../../../sim/pipeline";
import { DEFAULT_GRID } from "../../../sim/params";
import { useApp } from "../../../state/store";
import { AssumptionsList } from "../AssumptionsList/AssumptionsList";
import { BaselineBars } from "../BaselineBars/BaselineBars";
import { CriticCard } from "../CriticCard/CriticCard";
import { GhostButton } from "../GhostButton/GhostButton";
import { ScoreReadout } from "../ScoreReadout/ScoreReadout";
import { Toggle } from "../Toggle/Toggle";
import styles from "./MetricsPanel.module.css";

const Extrusion = lazy(() => import("../../../scene/Extrusion").then((m) => ({ default: m.Extrusion })));

/**
 * Right-region content, in reading order: the score, how it compares, whether the
 * model's pre-registered prediction held, an optional AI explanation, then details.
 */
export function MetricsPanel({
  showExtrusion = true,
  onOpenBenchmark,
  onOpenRecord,
}: {
  showExtrusion?: boolean;
  onOpenBenchmark(): void;
  onOpenRecord(): void;
}) {
  const record = useApp((s) => s.record);
  const stale = useApp((s) => s.stale);
  const status = useApp((s) => s.status);
  const seed = useApp((s) => s.seed);
  const reducedMotion = useApp((s) => s.reducedMotion);
  const profile = useApp((s) => s.history.present);
  const set = useApp((s) => s.set);

  const pct = record ? record.results.settlementPct : null;
  const delta = record && baselines ? { value: record.results.settlementPct - baselines.ridge, vs: "ridge" } : null;
  const d = record?.diagnostics;
  const settled = record !== null && !stale && status !== "running";

  return (
    <div className={styles.panel}>
      <ScoreReadout pct={pct} delta={delta} dimmed={stale || status === "running"} />

      <section className={styles.section}>
        <h3 className={styles.h}>Compared with baselines</h3>
        <BaselineBars flat={baselines?.flat ?? null} ridge={baselines?.ridge ?? null} recess={baselines?.recess ?? null} yours={pct} />
        <p className={styles.note}>
          {BENCHMARK ? `Baselines: mean of ${BENCHMARK.seeds.length} seeds, frozen parameters.` : FROZEN ? "Held-out run pending." : "Provisional parameters."}
        </p>
      </section>

      <button className={`${styles.bench} ${BENCHMARK ? (BENCHMARK.status === "PASS" ? styles.pass : styles.fail) : ""}`} onClick={onOpenBenchmark}>
        <span className={styles.benchHead}>
          <span className={styles.h}>Pre-registered test</span>
          <span className={styles.benchStatus}>{BENCHMARK ? BENCHMARK.status : "PENDING"}</span>
        </span>
        <span className={styles.benchBody}>
          Predicted: a recess beats a ridge.{" "}
          {BENCHMARK ? (BENCHMARK.status === "PASS" ? "The prediction held." : "It did not.") : "Not run yet."}
        </span>
        <span className={styles.benchCi}>{ciText()}</span>
      </button>

      {settled && <CriticCard record={record} />}

      <details className={styles.details}>
        <summary>
          <span>Run details</span>
          {record && (
            <span className={styles.summaryMeta}>
              {record.results.settled.toLocaleString()} of {record.results.released.toLocaleString()} settled
            </span>
          )}
        </summary>
        <div className={styles.detailsBody}>
          <div className={styles.row}>
            <label className={styles.seed}>
              Seed
              <input
                type="number"
                inputMode="numeric"
                min={1}
                value={seed}
                onChange={(e) => set({ seed: Math.max(1, Math.floor(Number(e.target.value) || 1)) })}
              />
            </label>
            <GhostButton size="sm" icon="dice" onClick={() => set({ seed: seed + 1 })}>
              Next seed
            </GhostButton>
          </div>

          {record && d && (
            <dl className={styles.diag}>
              <dt>Exposed surface</dt>
              <dd>{record.results.exposedLength.toFixed(1)} mm</dd>
              <dt title="Settlement % divided by exposed length relative to flat">Per-surface score</dt>
              <dd>{record.results.normalizedScore?.toFixed(1)}</dd>
              <dt>Reynolds (2.5 mm)</dt>
              <dd>{record.physical.reynolds.toFixed(0)}</dd>
              <dt>Mass drift</dt>
              <dd>{d.massDriftPct.toExponential(1)} %</dd>
              <dt>Solver</dt>
              <dd className={d.diverged ? styles.bad : styles.good}>{d.diverged ? "diverged" : "LBM D2Q9 · stable"}</dd>
            </dl>
          )}

          {record && (
            <GhostButton size="sm" icon="file" onClick={onOpenRecord}>
              View experiment record
            </GhostButton>
          )}

          {showExtrusion && (
            <figure className={styles.extrusion}>
              <div className={styles.extrusionCanvas}>
                <Suspense fallback={null}>
                  <Extrusion profile={profile} nx={DEFAULT_GRID.nx} animate={!reducedMotion} />
                </Suspense>
              </div>
              <figcaption>Decorative 3D view. Only the 2D slice is simulated.</figcaption>
            </figure>
          )}

          <Toggle checked={reducedMotion} label="Reduce motion" onChange={(v) => set({ reducedMotion: v })} />

          <div>
            <h4 className={styles.h}>Assumptions</h4>
            <AssumptionsList items={record?.assumptions ?? ASSUMPTIONS} />
          </div>
        </div>
      </details>
    </div>
  );
}
