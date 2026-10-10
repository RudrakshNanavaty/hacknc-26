import { lazy, Suspense, useEffect, useState } from "react";
import type { ExperimentRecord, Profile } from "../../contracts";
import { MISSIONS, CONDITIONS, TARGET_GAIN, materialUsed, reliefArea, evaluateMissionSet, type MissionId, type MissionAttempt } from "../../experiment/missions";
import { BENCHMARK } from "../../experiment/benchmark";
import { saveRecord } from "../../experiment/storage";
import { useApp } from "../../state/store";
import { BuildControls } from "../builder/BuildControls";
import { Stage } from "../builder/Stage";
import { AquaButton } from "../components/AquaButton/AquaButton";
import { GhostButton } from "../components/GhostButton/GhostButton";
import { GlassPanel } from "../components/GlassPanel/GlassPanel";
import { Icon } from "../components/GlossIcon/icons";
import { Modal } from "../components/Modal/Modal";
import { Toast } from "../components/Toast/Toast";
import { Toggle } from "../components/Toggle/Toggle";
import { AssumptionsList } from "../components/AssumptionsList/AssumptionsList";
import { BenchmarkView } from "../views/BenchmarkView";
import { LeaderboardView } from "../views/LeaderboardView";
import { PresetPicker } from "../views/PresetPicker";
import { RecordsView } from "../views/RecordsView";
import { RecordView } from "../views/RecordView";
import { useRunner } from "./useRunner";
import styles from "./AppShell.module.css";

const ReefBackdrop = lazy(() => import("../../scene/ReefBackdrop").then(m => ({ default: m.ReefBackdrop })));
type Sheet = "none" | "missions" | "presets" | "library" | "science" | "benchmark" | "leaderboard";
const signed = (n: number) => `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(2)}`;

export function AppShell() {
  const { runNow, cancel, replay } = useRunner();
  const s = useApp();
  const MISSION = MISSIONS[s.mission];
  const [sheet, setSheet] = useState<Sheet>("none");
  const [showTip, setShowTip] = useState(() => { try { return localStorage.getItem("reefforge.intro.v2") !== "done"; } catch { return true; } });
  const profile = s.history.present;
  const running = s.mode === "simulate";
  const record = s.record;
  const attempt = s.attempt;
  const result = attempt?.conditions[s.resultCondition] ?? attempt;
  const attemptIndex = attempt ? s.attempts.findIndex(a => a.design.createdAt === attempt.design.createdAt) : -1;
  const previous = s.attempts.slice(0,Math.max(0,attemptIndex)).filter(a => a.missionId === s.mission).at(-1)?.conditions.find(c => c.condition === result?.condition);
  useEffect(() => { document.documentElement.dataset.reducedMotion = String(s.reducedMotion); }, [s.reducedMotion]);
  const dismissTip = () => { setShowTip(false); try { localStorage.setItem("reefforge.intro.v2", "done"); } catch { /* optional persistence */ } };
  const loadProfile = (p: Profile) => { if (s.setProfile(p)) setSheet("none"); };
  const loadRecord = (r: ExperimentRecord, savedMission?: MissionAttempt) => {
    if (!s.setProfile(r.profile)) return;
    let restored: MissionAttempt | null = null;
    if (savedMission) {
      try { restored = evaluateMissionSet(savedMission.missionId, savedMission.conditions); } catch { /* old records remain viewable without mission credit */ }
    }
    s.set({ record: r, attempt: restored, stale: false, mode: "results", status: "done", seed: r.config.seed, resultCondition: restored ? Math.max(0, restored.conditions.findIndex(c => c.design.config.params.peakVelocityCmS === r.config.params.peakVelocityCmS)) : 0, ...(restored ? { mission: restored.missionId } : {}) });
    setSheet("none");
  };
  const chooseMission = (mission: MissionId) => {
    s.set({ mission, mode: "build", status: "idle", record: null, attempt: null, resultCondition: 0, error: null, seed: 1, activeCondition: "reference" });
    setSheet("none");
  };
  const save = async () => {
    const current = useApp.getState();
    if (!current.record || current.stale || current.status === "running") return;
    try {
      await saveRecord(current.record, `${current.record.profile.name} · ${current.record.results.settlementPct.toFixed(2)}%`, current.attempt ?? undefined);
      current.notify("Experiment saved to this browser's library.", "pass");
    } catch { current.notify("Could not save in this browser.", "fail"); }
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(el.tagName) || sheet !== "none") return;
      const st = useApp.getState();
      const mod = e.ctrlKey || e.metaKey;
      if (e.key === "Escape" && st.status === "running") { cancel(); return; }
      if (st.status === "running") return;
      if (mod && e.key.toLowerCase() === "z") { e.preventDefault(); if (e.shiftKey) st.redo(); else st.undo(); }
      else if (mod && e.key.toLowerCase() === "y") { e.preventDefault(); st.redo(); }
      else if (mod && e.key.toLowerCase() === "s") { e.preventDefault(); void save(); }
      else if (!mod) {
        const tools = { "1": "ridge", "2": "recess", "3": "step", "4": "flat" } as const;
        if (e.key in tools && st.mode === "build") st.setTool(tools[e.key as keyof typeof tools]);
        else if (e.key.toLowerCase() === "r") runNow();
        else if (e.key.toLowerCase() === "f") st.set({ showFlow: !st.showFlow });
        else if (e.key === "?") setShowTip(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sheet, runNow, cancel]);

  const tip = s.mode === "results" ? "Read the map. Change one feature and compare your next experiment."
    : running ? "Every larva is simulated. Only a small sample is drawn so you can follow the current."
    : profile.segments.some(seg => seg.height !== 0) ? "Your first habitat is ready. Run the current to discover where larvae settle."
    : "Baby corals need a place to settle. Click the seabed to place a ridge, or choose a preset.";

  return <div className={styles.shell} data-mode={s.mode}>
    <div className={styles.backdrop}><Suspense fallback={null}><ReefBackdrop animate={!s.reducedMotion} /></Suspense></div>
    <header className={styles.topbar}>
      <div className={styles.brand}><span className={styles.brandIcon}><Icon name="ridge" size={24} /></span><span>ReefForge<small>OCEAN EXPLORER</small></span></div>
      <nav className={styles.phases} aria-label="Experiment stages">{["build", "simulate", "results"].map((m,i) => <span key={m} aria-current={s.mode === m ? "step" : undefined}><b>{i+1}</b>{m === "build" ? "Build" : m === "simulate" ? "Simulate" : "Discover"}</span>)}</nav>
      <div className={styles.topActions}><GhostButton size="sm" icon="records" disabled={running} onClick={() => setSheet("library")}>Library</GhostButton><GhostButton size="sm" icon="file" disabled={running} onClick={() => setSheet("science")}>Research</GhostButton></div>
    </header>

    <div className={styles.missionRow}>
      <div><span className={styles.eyebrow}>MISSION {MISSION.number} · {MISSION.place}</span><h1>{MISSION.name}</h1><p>{MISSION.objective}</p></div>
      <GhostButton icon="presets" disabled={running} onClick={() => setSheet("missions")}>Missions</GhostButton>
    </div>

    <main className={`${styles.main} ${s.mode === "results" && record ? styles.withResults : ""}`}>
      <Stage buildEnabled={s.mode === "build"} />
      {s.mode === "results" && record && <GlassPanel variant="strong" className={styles.resultPanel}>
        <div className={styles.results} aria-live="polite">
          <span className={`${styles.outcome} ${attempt?.complete ? styles.complete : ""}`}>{attempt ? attempt.complete ? "Mission complete" : "A discovery worth building on" : "Saved / replayed experiment"}</span>
          {attempt && attempt.conditions.length > 1 && <div className={styles.conditionTabs} aria-label="Compare currents">{attempt.conditions.map((c,i) => <button key={c.condition} aria-pressed={s.resultCondition === i} onClick={() => s.set({ resultCondition: i, record: c.design, activeCondition: c.condition })}>{CONDITIONS[c.condition].speed} cm/s<strong>{signed(c.gain)} pts</strong></button>)}</div>}
          <div><span className={styles.eyebrow}>SIMULATED SETTLEMENT</span><div className={styles.score} data-testid="settlement-score">{record.results.settlementPct.toFixed(2)}<span>%</span></div><small>{record.results.settled} of {record.results.released} larvae settled</small></div>
          {attempt && result && <div className={styles.comparison}>
            <strong>{signed(result.gain)} points vs flat</strong>
            <div className={styles.compareRow}><span>Flat</span><meter min={0} max={100} value={result.baseline.results.settlementPct} /><b>{result.baseline.results.settlementPct.toFixed(2)}%</b></div>
            <div className={styles.compareRow}><span>Yours</span><meter min={0} max={100} value={record.results.settlementPct} /><b>{record.results.settlementPct.toFixed(2)}%</b></div>
            <small>Same seed, current and biology. {attempt.complete ? "Target reached." : `${Math.max(0, TARGET_GAIN-attempt.gain).toFixed(2)} more points needed in the limiting current.`}</small>
          </div>}
          <div className={styles.resultStats}><span>Material<strong>{materialUsed(record.profile).toFixed(1)} / 54 mm</strong><small>Area {reliefArea(record.profile).toFixed(1)} / 30 mm²</small></span><span>Efficiency<strong>{(record.results.settled / materialUsed(record.profile)).toFixed(1)} settlers/mm</strong></span></div>
          {attempt && <><div><h3>Observed trade-off</h3><p>{attempt.tradeoff}</p></div><div className={styles.nextStep}><h3>Try one change</h3><p>{attempt.suggestion}</p></div></>}
          {previous && attempt && <small>Previous attempt: {signed(record.results.settlementPct-previous.design.results.settlementPct)} settlement points.</small>}
          {attempt?.complete && s.mission === "first" && <GhostButton size="sm" onClick={() => chooseMission("clash")}>Next mission: Current Clash</GhostButton>}
          <small>One-seed puzzle result, not scientific validation. Assumptions and diagnostics are in Research.</small>
        </div>
      </GlassPanel>}
    </main>

    <footer className={styles.footer}>
      {s.mode === "build" && <GlassPanel className={styles.controls}><BuildControls /></GlassPanel>}
      {s.error && <p role="alert" className={styles.error}>{s.error}</p>}
      <div className={styles.actionRow}>
        <div className={styles.guidance}>{showTip ? <><span className={styles.tipIcon}><Icon name="help" size={18}/></span><p>{tip}</p><button aria-label="Dismiss tip" onClick={dismissTip}>×</button></> : <><span>2D settlement sandbox · Decorative ocean scenery</span><GhostButton size="sm" onClick={() => setShowTip(true)}>Help</GhostButton></>}</div>
        <div className={styles.primaryActions}>
          {s.mode === "build" && <><GhostButton icon="presets" onClick={() => setSheet("presets")}>Presets</GhostButton><AquaButton size="lg" onClick={runNow}><Icon name="play" size={16}/>Run experiment</AquaButton></>}
          {running && <GhostButton onClick={cancel}>Cancel experiment</GhostButton>}
          {s.mode === "results" && <><GhostButton size="sm" icon="save" onClick={save}>Save experiment</GhostButton><GhostButton size="sm" icon="play" onClick={runNow}>Repeat mission run</GhostButton><AquaButton onClick={() => s.set({ mode: "build", error: null })}>Improve design <Icon name="chevronRight" size={16} /></AquaButton></>}
        </div>
      </div>
    </footer>

    {sheet === "missions" && <Modal title="Choose your expedition" onClose={() => setSheet("none")}><div className={styles.missionCards}>{(Object.keys(MISSIONS) as MissionId[]).map(id => <div className={styles.missionCard} key={id}><span className={styles.eyebrow}>MISSION {MISSIONS[id].number}</span><h2>{MISSIONS[id].name}</h2><p>{MISSIONS[id].subtitle}</p><p>{MISSIONS[id].objective}</p><p>{MISSIONS[id].conditions.map(c => `${CONDITIONS[c].speed} cm/s`).join(" + ")} waves · fixed seed 1 · 2,000 larvae per condition</p><AquaButton onClick={() => chooseMission(id)}>Choose {MISSIONS[id].name}</AquaButton></div>)}</div></Modal>}
    {sheet === "presets" && <Modal title="Choose a starting shape" onClose={() => setSheet("none")}><p>Reference shapes are starting points. Their outcomes are computed when you run.</p><PresetPicker current={profile.id} onPick={loadProfile}/></Modal>}
    {sheet === "library" && <Modal title="Experiment library" onClose={() => setSheet("none")} wide><RecordsView onLoad={loadRecord} onError={m => s.notify(m, "fail")}/><details className={styles.attempts}><summary>Recent mission attempts ({s.attempts.length})</summary>{s.attempts.map((a,i) => <div key={i}><span>Attempt {i+1} · {MISSIONS[a.missionId].name} · {signed(a.gain)} points</span><GhostButton size="sm" onClick={() => loadRecord(a.design,a)}>Review</GhostButton></div>)}</details></Modal>}
    {sheet === "science" && <Modal title="Research & reproducibility" onClose={() => setSheet("none")} wide>
      <p>Mission completion and scientific benchmark status are independent. The held-out benchmark remains available with its original result.</p>
      <div className={styles.resultActions}><GhostButton onClick={() => setSheet("benchmark")}>Benchmark: {BENCHMARK?.status ?? "PENDING"} · view evidence</GhostButton><GhostButton onClick={() => setSheet("leaderboard")}>Local research leaderboard</GhostButton></div>
      <Toggle checked={s.reducedMotion} label="Reduce motion" onChange={v => s.set({ reducedMotion: v })}/>
      {record ? <><RecordView record={record} onRerun={r => { setSheet("none"); replay(r); }}/><h3>Diagnostics</h3><p>Mass drift: {record.diagnostics.massDriftPct.toExponential(2)}% · Max lattice velocity: {record.diagnostics.maxVelocity.toFixed(4)} · {record.diagnostics.diverged ? "Diverged" : "Stable"}</p><AssumptionsList items={record.assumptions}/></> : <p>Run an experiment to inspect its exact parameters, diagnostics and assumptions.</p>}
      {result && <details><summary>Matched flat baseline record</summary><RecordView record={result.baseline} onRerun={r => { setSheet("none"); replay(r); }}/></details>}
      {s.mission === "clash" && <p>Current Clash adds an exploratory 3 cm/s forcing scenario. The calibrated attachment rules, viscosity, time step and wave period stay fixed. This scenario is outside the held-out benchmark.</p>}
      <p>Material is a surface-fabrication proxy: 34 mm of bed plus vertical walls around the periodic tile, limited to 54 mm. Added or excavated cross-sectional area is also limited to 30 mm²; this prevents a whole-bed lift bypassing the wall allowance. These are construction costs, not physical mass. Flattening refunds both. Settlement-map heights are illustrative; saved data contains horizontal settlement coordinates.</p>
    </Modal>}
    {sheet === "benchmark" && <Modal title="Pre-registered benchmark" onClose={() => setSheet("none")} wide><BenchmarkView /></Modal>}
    {sheet === "leaderboard" && <Modal title="Beat the Recess · research challenge" onClose={() => setSheet("none")} wide><LeaderboardView profile={profile} onLoad={loadProfile}/></Modal>}
    <Toast />
  </div>;
}
