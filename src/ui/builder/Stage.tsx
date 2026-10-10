import { FROZEN } from "../../experiment/benchmark";
import { isMockSim } from "../../sim/client";
import { useApp } from "../../state/store";
import { Toggle } from "../components/Toggle/Toggle";
import { SimView } from "./SimView";
import styles from "./Stage.module.css";

/** Centre region: what you're looking at, under what conditions, and the sim itself. */
export function Stage({ buildEnabled }: { buildEnabled: boolean }) {
  const profile = useApp((s) => s.history.present);
  const status = useApp((s) => s.status);
  const stage = useApp((s) => s.stage);
  const progress = useApp((s) => s.progress);
  const showFlow = useApp((s) => s.showFlow);
  const seed = useApp((s) => s.seed);
  const set = useApp((s) => s.set);
  const running = status === "running";

  return (
    <section className={styles.stage} aria-label="Build and simulation view">
      <header className={styles.head}>
        <div className={styles.title}>
          <h2>{profile.name}</h2>
          <p>
            2D cross-section · 34 × 16 mm · waves 4.5 cm/s, 5.5 s · seed {seed}
            {!FROZEN && " · provisional parameters"}
            {isMockSim && " · MOCK SIM"}
          </p>
        </div>
        <div className={styles.side}>
          {running ? (
            <span className={styles.status} aria-live="polite">
              {stage === "flow" ? "Spinning up the flow" : "Larvae swimming"} · {Math.round(progress * 100)}%
            </span>
          ) : (
            <ul className={styles.legend} aria-label="Legend">
              <li>
                <i className={styles.larva} /> Larva
              </li>
              <li>
                <i className={styles.settled} /> Settled
              </li>
              <li>
                <i className={styles.flow} /> Flow
              </li>
            </ul>
          )}
          <Toggle checked={showFlow} label="Flow" onChange={(v) => set({ showFlow: v })} />
        </div>
      </header>

      <div className={styles.body}>
        <SimView buildEnabled={buildEnabled} />
      </div>

      <div className={styles.progress} data-active={running} aria-hidden={!running}>
        <span className={styles.bar} style={{ transform: `scaleX(${running ? progress : 0})` }} />
      </div>
    </section>
  );
}
