import { lazy, Suspense, useEffect, useState } from "react";
import type { ExperimentRecord, Profile } from "../../contracts";
import { BENCHMARK, ciText, FROZEN } from "../../experiment/benchmark";
import { saveRecord } from "../../experiment/storage";
import { preset } from "../../geometry";
import { isMockSim } from "../../sim/client";
import { useApp } from "../../state/store";
import { ShapePalette } from "../builder/ShapePalette";
import { SimView } from "../builder/SimView";
import { AquaButton } from "../components/AquaButton/AquaButton";
import { ChallengeBar } from "../components/ChallengeBar/ChallengeBar";
import { Dock, type DockItem } from "../components/Dock/Dock";
import { GlassPanel } from "../components/GlassPanel/GlassPanel";
import { Icon } from "../components/GlossIcon/icons";
import { MetricsPanel } from "../components/MetricsPanel/MetricsPanel";
import { Modal } from "../components/Modal/Modal";
import { OnboardingOverlay } from "../components/OnboardingOverlay/OnboardingOverlay";
import { Toast } from "../components/Toast/Toast";
import { BenchmarkView } from "../views/BenchmarkView";
import { PresetPicker } from "../views/PresetPicker";
import { RecordsView } from "../views/RecordsView";
import { RecordView } from "../views/RecordView";
import { useRunner } from "./useRunner";
import styles from "./AppShell.module.css";

const ReefBackdrop = lazy(() => import("../../scene/ReefBackdrop").then((m) => ({ default: m.ReefBackdrop })));

const ONBOARDED_KEY = "reefforge.onboarded";

function useIsMobile() {
  const q = "(max-width: 767px)";
  const [m, setM] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const on = () => setM(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return m;
}

type Sheet = "none" | "records" | "record" | "presets" | "results" | "benchmark";

export function AppShell() {
  const mobile = useIsMobile();
  const runNow = useRunner();
  const s = useApp();
  const [sheet, setSheet] = useState<Sheet>("none");
  const profile = s.history.present;

  // Reduced motion is reflected on the root so tokens and CSS respect it.
  useEffect(() => {
    document.documentElement.dataset.reducedMotion = String(s.reducedMotion);
  }, [s.reducedMotion]);

  // First visit: show onboarding.
  useEffect(() => {
    try {
      if (!localStorage.getItem(ONBOARDED_KEY)) useApp.getState().set({ onboarding: 1 });
    } catch {
      /* storage unavailable: skip */
    }
  }, []);
  const closeOnboarding = () => {
    s.set({ onboarding: 0 });
    try {
      localStorage.setItem(ONBOARDED_KEY, "1");
    } catch {
      /* ignore */
    }
  };

  const loadProfile = (p: Profile) => {
    s.setProfile(p);
    setSheet("none");
  };
  const loadRecord = (r: ExperimentRecord) => {
    s.set({ seed: r.config.seed });
    s.setProfile(r.profile);
    setSheet("none");
    s.notify(`Loaded "${r.profile.name}", seed ${r.config.seed}: re-running`, "info");
  };
  const save = async () => {
    if (!s.record) return;
    const name = `${s.record.profile.name} · ${s.record.results.settlementPct.toFixed(1)}%`;
    try {
      await saveRecord(s.record, name);
      s.notify(`Saved "${name}"`, "pass");
    } catch {
      s.notify("Could not save in this browser", "fail");
    }
  };

  // Keyboard shortcuts (desktop building).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || sheet !== "none" || useApp.getState().onboarding) return;
      const st = useApp.getState();
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) st.redo();
        else st.undo();
      } else if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        st.redo();
      } else if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        save();
      } else if (!mod) {
        const tools = { "1": "ridge", "2": "recess", "3": "step", "4": "flat" } as const;
        if (e.key in tools) st.setTool(tools[e.key as keyof typeof tools]);
        else if (e.key === "Enter" || e.key.toLowerCase() === "r") runNow();
        else if (e.key.toLowerCase() === "f") st.set({ showFlow: !st.showFlow });
        else if (e.key === "?") st.set({ onboarding: 1 });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheet, runNow]);

  const status = BENCHMARK ? (BENCHMARK.status === "PASS" ? "pass" : "fail") : "pending";
  const running = s.status === "running";
  const runButton = (
    <AquaButton size={mobile ? "md" : "lg"} onClick={runNow} loading={running}>
      <Icon name="play" size={18} /> {running ? `Running ${Math.round(s.progress * 100)}%` : "Run"}
    </AquaButton>
  );

  const desktopItems: DockItem[] = [
    { id: "undo", label: "Undo", icon: "undo", onClick: s.undo, disabled: s.history.past.length === 0, shortcut: "Ctrl+Z" },
    { id: "redo", label: "Redo", icon: "redo", onClick: s.redo, disabled: s.history.future.length === 0, shortcut: "Ctrl+Y" },
    { id: "reset", label: "Reset", icon: "reset", onClick: () => loadProfile(preset("flat")), tone: "ink" },
    { id: "presets", label: "Presets", icon: "presets", onClick: () => setSheet("presets") },
    { id: "save", label: "Save", icon: "save", onClick: save, disabled: !s.record, tone: "leaf", shortcut: "Ctrl+S" },
    { id: "records", label: "Compare", icon: "records", onClick: () => setSheet("records") },
    { id: "record", label: "Record", icon: "file", onClick: () => setSheet("record"), disabled: !s.record },
    { id: "help", label: "Help", icon: "help", onClick: () => s.set({ onboarding: 1 }), tone: "sun", shortcut: "?" },
  ];
  const mobileItems: DockItem[] = [
    { id: "presets", label: "Presets", icon: "presets", onClick: () => setSheet("presets") },
    { id: "results", label: "Results", icon: "results", onClick: () => setSheet("results") },
    { id: "help", label: "Help", icon: "help", onClick: () => s.set({ onboarding: 1 }), tone: "sun" },
  ];

  return (
    <div className={styles.shell}>
      <div className={styles.backdrop}>
        <Suspense fallback={null}>
          <ReefBackdrop animate={!s.reducedMotion} />
        </Suspense>
      </div>

      <ChallengeBar
        title={mobile ? "Where do larvae settle?" : "Shape the seabed: where do coral larvae settle?"}
        conditions={`Waves 4.5 cm/s · 5.5 s period · 34 × 16 mm tile · 2,000 larvae · seed ${s.seed}${FROZEN ? "" : " · provisional parameters"}${isMockSim ? " · MOCK SIM" : ""}`}
        benchmarkStatus={status}
        ciText={ciText()}
        onBadgeClick={() => setSheet("benchmark")}
      />

      <main className={`${styles.main} ${s.metricsCollapsed ? styles.collapsed : ""}`}>
        {!mobile && (
          <GlassPanel title="Shapes" className={styles.palette}>
            <ShapePalette selected={s.tool} onSelect={s.setTool} />
          </GlassPanel>
        )}

        <section className={styles.center} aria-label="Build and simulation view">
          <SimView buildEnabled={!mobile} />
        </section>

        {!mobile &&
          (s.metricsCollapsed ? (
            <button className={styles.expand} onClick={() => s.set({ metricsCollapsed: false })} aria-label="Show metrics">
              <Icon name="chevronLeft" size={16} />
              <span>Metrics</span>
            </button>
          ) : (
            <GlassPanel title="Metrics" variant="strong" className={styles.metrics} onCollapse={() => s.set({ metricsCollapsed: true })}>
              <MetricsPanel />
            </GlassPanel>
          ))}
      </main>

      <footer className={styles.dockRow}>
        <Dock items={mobile ? mobileItems : desktopItems} primary={runButton} />
      </footer>

      {sheet === "presets" && (
        <Modal title="Reference profiles" onClose={() => setSheet("none")}>
          <PresetPicker current={profile.id} onPick={loadProfile} />
        </Modal>
      )}
      {sheet === "results" && (
        <Modal title="Results" onClose={() => setSheet("none")}>
          <MetricsPanel showExtrusion={false} />
        </Modal>
      )}
      {sheet === "benchmark" && (
        <Modal title="Pre-registered benchmark" onClose={() => setSheet("none")} wide>
          <BenchmarkView />
        </Modal>
      )}
      {sheet === "records" && (
        <Modal title="Saved designs" onClose={() => setSheet("none")} wide>
          <RecordsView onLoad={loadRecord} onError={(m) => s.notify(m, "fail")} />
        </Modal>
      )}
      {sheet === "record" && s.record && (
        <Modal title="Experiment record" onClose={() => setSheet("none")} wide>
          <RecordView record={s.record} onRerun={loadRecord} />
        </Modal>
      )}
      {s.onboarding > 0 && <OnboardingOverlay step={s.onboarding} onStep={(n) => s.set({ onboarding: n })} onClose={closeOnboarding} />}
      <Toast />
    </div>
  );
}
