import { useCallback, useEffect, useRef } from "react";
import type { Profile } from "../../contracts";
import { appConfig } from "../../experiment/benchmark";
import { startRun } from "../../sim/client";
import { useApp } from "../../state/store";

const DEBOUNCE_MS = 300;

/** Re-runs the simulation 300 ms after the geometry or seed settles; the worker cancels stale runs. */
export function useRunner() {
  const profile = useApp((s) => s.history.present);
  const seed = useApp((s) => s.seed);
  const lastProgress = useRef(-1);

  const run = useCallback((p: Profile, s: number) => {
    const set = useApp.getState().set;
    lastProgress.current = -1;
    set({ status: "running", progress: 0, stage: "flow", error: null });
    startRun(p, appConfig(s), {
      onProgress(step, total, stage) {
        const pct = Math.floor((step / total) * 100);
        if (pct === lastProgress.current) return; // keep React updates rare
        lastProgress.current = pct;
        set({ progress: step / total, ...(stage ? { stage } : {}) });
      },
      onDone(record) {
        set({ record, stale: false, status: "done", progress: 1 });
      },
      onError(message) {
        set({ status: "error", error: message });
        useApp.getState().notify(`Simulation error: ${message}`, "fail");
      },
    });
  }, []);

  useEffect(() => {
    const t = setTimeout(() => run(profile, seed), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [profile, seed, run]);

  return useCallback(() => run(useApp.getState().history.present, useApp.getState().seed), [run]);
}
