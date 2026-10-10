import { create } from "zustand";
import type { ExperimentRecord, Profile } from "../contracts";
import { historyInit, historyPush, historyRedo, historyUndo, preset, type History, type Tool } from "../geometry";

export type RunStatus = "idle" | "running" | "done" | "error";

/** UI state only. Solver state lives in the worker; frames bypass React entirely. */
interface AppState {
  history: History<Profile>;
  tool: Tool;
  seed: number;
  status: RunStatus;
  progress: number; // 0..1
  stage: "flow" | "larvae";
  error: string | null;
  record: ExperimentRecord | null;
  /** True while the shown record belongs to an older geometry (dimmed). */
  stale: boolean;
  showFlow: boolean;
  reducedMotion: boolean;
  metricsCollapsed: boolean;
  onboarding: number; // 0 = hidden, 1..3 = step
  toast: { text: string; tone: "info" | "pass" | "fail" } | null;

  setProfile(p: Profile): void;
  undo(): void;
  redo(): void;
  setTool(t: Tool): void;
  setSeed(s: number): void;
  set(partial: Partial<AppState>): void;
  notify(text: string, tone?: "info" | "pass" | "fail"): void;
}

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

export const useApp = create<AppState>((set) => ({
  history: historyInit(preset("ridge")),
  tool: "ridge",
  seed: 1,
  status: "idle",
  progress: 0,
  stage: "flow",
  error: null,
  record: null,
  stale: false,
  showFlow: true,
  reducedMotion: prefersReducedMotion(),
  metricsCollapsed: false,
  onboarding: 0,
  toast: null,

  setProfile: (p) => set((s) => ({ history: historyPush(s.history, p), stale: s.record !== null })),
  undo: () => set((s) => ({ history: historyUndo(s.history), stale: s.record !== null })),
  redo: () => set((s) => ({ history: historyRedo(s.history), stale: s.record !== null })),
  setTool: (tool) => set({ tool }),
  setSeed: (seed) => set({ seed }),
  set: (partial) => set(partial),
  notify: (text, tone = "info") => set({ toast: { text, tone } }),
}));

export const currentProfile = () => useApp.getState().history.present;
