import { BENCHMARK, ciText, PREREGISTRATION } from "../../experiment/benchmark";
import { ASSUMPTIONS } from "../../sim/pipeline";
import { AssumptionsList } from "../components/AssumptionsList/AssumptionsList";
import styles from "./views.module.css";

const fmt = (x: number) => x.toFixed(2);

/** The pre-registered test, its result, and the model's assumptions. */
export function BenchmarkView() {
  const bench = BENCHMARK;
  return (
    <div className={styles.stack}>
      <section>
        <h4 className={styles.h}>The test</h4>
        <p>
          Two attachment parameters were calibrated on <b>flat vs. ridge</b> only (Levenstein et al. 2022 flume geometry and
          flow). Then they were frozen, and this prediction was committed before the recess was ever simulated:
        </p>
        <p className={styles.quote}>{PREREGISTRATION?.prediction ?? "Not pre-registered yet."}</p>
        <p className={styles.muted}>{PREREGISTRATION?.passRule}</p>
      </section>
      <section>
        <h4 className={styles.h}>Result</h4>
        {bench ? (
          <>
            <p className={bench.status === "PASS" ? styles.pass : styles.fail}>
              Benchmark: {bench.status} · {ciText()}
            </p>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Profile</th>
                  <th>Mean</th>
                  <th>95% CI</th>
                </tr>
              </thead>
              <tbody>
                {(["flat", "ridge", "recess"] as const).map((k) => {
                  const c = bench.settlementPct[k];
                  return (
                    <tr key={k}>
                      <td>{k}</td>
                      <td>{fmt(c.mean)}%</td>
                      <td>
                        [{fmt(c.lo)}, {fmt(c.hi)}]
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className={styles.muted}>Pre-registration commit {bench.preregistrationCommit.slice(0, 7)} · simulated settlement, not survival.</p>
          </>
        ) : (
          <p className={styles.muted}>The held-out run has not been recorded yet.</p>
        )}
      </section>
      <section>
        <h4 className={styles.h}>What this does not show</h4>
        <p>
          The recess hypothesis comes from cm-scale 3D helix recesses in the field (Reichert et al. 2025). Our recess is a
          mm-scale 2D cavity. A pass means the frozen model agrees with that hypothesis; it does not validate the model against
          recess data, because none exists at this scale.
        </p>
      </section>
      <section>
        <h4 className={styles.h}>Assumptions</h4>
        <AssumptionsList items={ASSUMPTIONS} />
      </section>
    </div>
  );
}
