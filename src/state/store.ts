import { create } from "zustand";
import type { ExperimentRecord, Profile } from "../contracts";
import { historyInit, historyPush, historyRedo, historyUndo, preset, TOOL_DEFAULTS, type History, type Tool } from "../geometry";
import { buildError, type MissionAttempt, type MissionId, type FlowCondition } from "../experiment/missions";

export type RunStatus = "idle" | "running" | "done" | "error";

/** UI state only. Solver state lives in the worker; frames bypass React entirely. */
interface AppState {
  mission: MissionId;
  activeCondition: FlowCondition;
  resultCondition: number;
  animationSpeed: number;
  baselineRun: boolean;
  mode: "build" | "simulate" | "results";
  taskLabel: string;
  attempt: MissionAttempt | null;
  attempts: MissionAttempt[];
  toolWidth: number;
  toolHeight: number;
  selectedColumn: number | null;
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

  setProfile(p: Profile): boolean;
  undo(): void;
  redo(): void;
  setTool(t: Tool): void;
  setSeed(s: number): void;
  set(partial: Partial<AppState>): void;
  notify(text: string, tone?: "info" | "pass" | "fail"): void;
}

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

export const useApp = create<AppState>((set, get) => ({
  mission: "first", activeCondition: "reference", resultCondition: 0, animationSpeed: 1, baselineRun: false,
  mode: "build", taskLabel: "", attempt: null, attempts: [], toolWidth: 4, toolHeight: 10, selectedColumn: null,
  history: historyInit(preset("flat")),
  tool: "ridge",
  seed: 1,
  status: "idle",
  progress: 0,
  stage: "flow",
  error: null,
  record: null,
  stale: false,
  showFlow: false,
  reducedMotion: prefersReducedMotion(),
  metricsCollapsed: false,
  onboarding: 0,
  toast: null,

  setProfile: (p) => {
    const s = get();
    if (s.status === "running") return false;
    const error = buildError(p);
    if (error) { set({ error, toast: { text: error, tone: "fail" } }); return false; }
    if (JSON.stringify(p) === JSON.stringify(s.history.present)) return true;
    set({ history: historyPush(s.history, structuredClone(p)), stale: s.record !== null, mode: "build", selectedColumn: null, error: null });
    return true;
  },
  undo: () => set((s) => s.status === "running" ? {} : ({ history: historyUndo(s.history), stale: s.record !== null, mode: "build", selectedColumn: null, error: null })),
  redo: () => set((s) => s.status === "running" || (s.history.future[0] && buildError(s.history.future[0])) ? {} : ({ history: historyRedo(s.history), stale: s.record !== null, mode: "build", selectedColumn: null, error: null })),
  setTool: (tool) => set({ tool, toolWidth: TOOL_DEFAULTS[tool].width, toolHeight: TOOL_DEFAULTS[tool].height, selectedColumn: null }),
  setSeed: (seed) => set({ seed }),
  set: (partial) => set(partial),
  notify: (text, tone = "info") => set({ toast: { text, tone } }),
}));

export const currentProfile = () => useApp.getState().history.present;
