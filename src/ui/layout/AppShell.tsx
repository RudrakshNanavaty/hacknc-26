import { lazy, Suspense, useEffect, useState } from "react";
import type { ExperimentRecord, Profile } from "../../contracts";
import { BENCHMARK, ciText } from "../../experiment/benchmark";
import { saveRecord } from "../../experiment/storage";
import { useApp } from "../../state/store";
import { ShapePalette } from "../builder/ShapePalette";
import { Stage } from "../builder/Stage";
import { AquaButton } from "../components/AquaButton/AquaButton";
import { ChallengeBar } from "../components/ChallengeBar/ChallengeBar";
import { Dock, type DockItem } from "../components/Dock/Dock";
import { GlassPanel } from "../components/GlassPanel/GlassPanel";
import { Icon } from "../components/GlossIcon/icons";
import { MetricsPanel } from "../components/MetricsPanel/MetricsPanel";
import { Modal } from "../components/Modal/Modal";
import { OnboardingOverlay } from "../components/OnboardingOverlay/OnboardingOverlay";
import { Segmented } from "../components/Segmented/Segmented";
import { Toast } from "../components/Toast/Toast";
import { BenchmarkView } from "../views/BenchmarkView";
import { LeaderboardView } from "../views/LeaderboardView";
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

type Sheet = "none" | "library" | "presets" | "results" | "benchmark" | "leaderboard";
type LibraryTab = "run" | "saved";

export function AppShell() {
  const mobile = useIsMobile();
  const runNow = useRunner();
  const s = useApp();
  const [sheet, setSheet] = useState<Sheet>("none");
  const [libraryTab, setLibraryTab] = useState<LibraryTab>("run");
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
    s.notify(`Loaded "${r.profile.name}", seed ${r.config.seed}`, "info");
  };
  const openLibrary = (tab: LibraryTab) => {
    setLibraryTab(tab);
    setSheet("library");
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

  // Keyboard shortcuts (desktop building). Keyboard actions never animate.
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
    <AquaButton size="lg" onClick={runNow} loading={running} className={styles.run}>
      <Icon name="play" size={16} />
      <span className={styles.runLabel}>{running ? `${Math.round(s.progress * 100)}%` : "Run"}</span>
    </AquaButton>
  );

  const desktopItems: DockItem[] = [
    { id: "presets", label: "Presets", icon: "presets", onClick: () => setSheet("presets") },
    { id: "save", label: "Save", icon: "save", onClick: save, disabled: !s.record, tone: "leaf", shortcut: "Ctrl+S" },
    { id: "library", label: "Library", icon: "records", onClick: () => openLibrary("saved") },
    { id: "leaderboard", label: "Leaderboard", icon: "trophy", onClick: () => setSheet("leaderboard"), tone: "sun" },
    { id: "help", label: "Help", icon: "help", onClick: () => s.set({ onboarding: 1 }), tone: "ink", shortcut: "?" },
  ];
  const mobileItems: DockItem[] = [
    { id: "presets", label: "Presets", icon: "presets", onClick: () => setSheet("presets") },
    { id: "results", label: "Results", icon: "results", onClick: () => setSheet("results") },
    { id: "help", label: "Help", icon: "help", onClick: () => s.set({ onboarding: 1 }), tone: "ink" },
  ];

  const metrics = (extrusion: boolean) => (
    <MetricsPanel showExtrusion={extrusion} onOpenBenchmark={() => setSheet("benchmark")} onOpenRecord={() => openLibrary("run")} />
  );

  return (
    <div className={styles.shell}>
      <div className={styles.backdrop}>
        <Suspense fallback={null}>
          <ReefBackdrop animate={!s.reducedMotion} />
        </Suspense>
      </div>

      <ChallengeBar
        title={mobile ? "Where do larvae settle?" : "Shape the seabed. See where coral larvae settle."}
        benchmarkStatus={status}
        ciText={ciText()}
        onBadgeClick={() => setSheet("benchmark")}
      />

      <main className={`${styles.main} ${s.metricsCollapsed ? styles.collapsed : ""}`}>
        {!mobile && (
          <GlassPanel className={styles.rail}>
            <ShapePalette
              selected={s.tool}
              onSelect={s.setTool}
              onUndo={s.undo}
              onRedo={s.redo}
              canUndo={s.history.past.length > 0}
              canRedo={s.history.future.length > 0}
            />
          </GlassPanel>
        )}

        <Stage buildEnabled={!mobile} />

        {!mobile &&
          (s.metricsCollapsed ? (
            <button className={styles.expand} onClick={() => s.set({ metricsCollapsed: false })} aria-label="Show results">
              <Icon name="chevronLeft" size={16} />
              <span>Results</span>
            </button>
          ) : (
            <GlassPanel title="Results" variant="strong" className={styles.metrics} onCollapse={() => s.set({ metricsCollapsed: true })}>
              {metrics(true)}
            </GlassPanel>
          ))}
      </main>

      <footer className={styles.dockRow}>
        <Dock items={mobile ? mobileItems : desktopItems} primary={runButton} />
      </footer>

      {sheet === "presets" && (
        <Modal title="Start from a reference profile" onClose={() => setSheet("none")}>
          <PresetPicker current={profile.id} onPick={loadProfile} />
        </Modal>
      )}
      {sheet === "results" && (
        <Modal title="Results" onClose={() => setSheet("none")}>
          {metrics(false)}
        </Modal>
      )}
      {sheet === "benchmark" && (
        <Modal title="Pre-registered benchmark" onClose={() => setSheet("none")} wide>
          <BenchmarkView />
        </Modal>
      )}
      {sheet === "library" && (
        <Modal title="Library" onClose={() => setSheet("none")} wide>
          <div className={styles.libraryTabs}>
            <Segmented<LibraryTab>
              label="Library"
              value={libraryTab}
              onChange={setLibraryTab}
              options={[
                { value: "run", label: "This run" },
                { value: "saved", label: "Saved designs" },
              ]}
            />
          </div>
          {libraryTab === "run" ? (
            s.record ? (
              <RecordView record={s.record} onRerun={loadRecord} />
            ) : (
              <p className={styles.emptyNote}>Run a design first. Its reproducible record will appear here.</p>
            )
          ) : (
            <RecordsView onLoad={loadRecord} onError={(m) => s.notify(m, "fail")} />
          )}
        </Modal>
      )}
      {sheet === "leaderboard" && (
        <Modal title="Beat the Recess" onClose={() => setSheet("none")} wide>
          <LeaderboardView profile={profile} onLoad={loadProfile} />
        </Modal>
      )}
      {s.onboarding > 0 && <OnboardingOverlay step={s.onboarding} onStep={(n) => s.set({ onboarding: n })} onClose={closeOnboarding} />}
      <Toast />
    </div>
  );
}
