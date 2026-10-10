import { isMockSim } from "../../sim/client";
import { useApp } from "../../state/store";
import { CONDITIONS } from "../../experiment/missions";
import { Toggle } from "../components/Toggle/Toggle";
import { SimView } from "./SimView";
import styles from "./Stage.module.css";

export function Stage({ buildEnabled }: { buildEnabled: boolean }) {
  const s = useApp();
  const running = s.mode === "simulate";
  const baseline = s.baselineRun && running;
  return <section className={styles.stage} aria-label="Build and simulation view">
    <header className={styles.head}>
      <div className={styles.title}><h2>{running ? s.taskLabel : s.mode === "results" ? "Your settlement map" : "Shape a little shelter"}</h2>
        <p>{s.mode === "build" ? "Click to place · drag vertically for height · shift-click to select · 0.25 mm grid" : "2D physical slice · 34 × 16 mm · scenery and marker sizes are illustrative"}{isMockSim && " · MOCK SIM"}</p>
      </div>
      <div className={styles.side}>{running && <><label className={styles.speed}>Animation <select aria-label="Animation speed" value={s.animationSpeed} onChange={e => s.set({ animationSpeed: Number(e.target.value) })}>{[0.5,1,2].map(v => <option key={v} value={v}>{v}×</option>)}</select></label><Toggle checked={s.showFlow} label="Flow vectors" onChange={v => s.set({ showFlow: v })}/></>}<span className={styles.status}>{baseline ? "Matched control" : s.mode === "build" ? "BUILD MODE" : "SIMULATED"}</span></div>
    </header>
    <div className={styles.body}><SimView buildEnabled={buildEnabled}/></div>
    <div className={styles.caption}>
      <span>{running ? `${s.stage === "flow" ? "Preparing ocean currents" : "Following 2,000 larvae"} · ${Math.round(s.progress*100)}%` : s.mode === "results" ? "Pink markers: horizontal settlement locations · no growth or survival forecast" : "Raised ridges redirect flow. Recesses create cavities. Discover what works here."}</span>
      <span>{s.mode === "build" && s.mission === "clash" ? "4.5 + 3" : s.record && s.mode === "results" ? s.record.physical.peakVelocityCmS : CONDITIONS[s.activeCondition].speed} cm/s waves · seed {s.mode === "build" ? 1 : s.seed}{running && " · animation speed does not change computation"}</span>
    </div>
    {running && <div className={styles.progress} data-active="true" role="progressbar" aria-label={s.taskLabel} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(s.progress*100)}><span className={styles.bar} style={{ transform: `scaleX(${s.progress})` }}/></div>}
  </section>;
}
