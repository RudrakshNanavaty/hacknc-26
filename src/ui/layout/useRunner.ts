import { useCallback, useEffect, useRef } from "react";
import type { ExperimentRecord, Profile, SimConfig } from "../../contracts";
import { buildError, evaluateMissionSet, missionConfig, MISSIONS, CONDITIONS, type FlowCondition } from "../../experiment/missions";
import { preset } from "../../geometry";
import { cancelRun, isMockSim, startRun } from "../../sim/client";
import { useApp } from "../../state/store";

/** Explicit paired experiments through the existing worker protocol. */
export function useRunner() {
  const generation = useRef(0);
  const baselines = useRef(new Map<FlowCondition, ExperimentRecord>());
  const cancel = useCallback(() => {
    generation.current++;
    cancelRun();
    useApp.getState().set({ status: "idle", mode: "build", progress: 0, taskLabel: "", stale: true });
  }, []);
  useEffect(() => () => { generation.current++; cancelRun(); }, []);

  const execute = useCallback((profile: Profile, config: SimConfig, token: number, label: string, done: (r: ExperimentRecord) => void) => {
    useApp.getState().set({ taskLabel: label, progress: 0, stage: "flow" });
    startRun(profile, config, {
      onProgress(step, total, stage) {
        if (generation.current !== token) return;
        const next = stage === "larvae" ? 0.55 + 0.45 * step / total : 0.55 * step / total;
        const progress = Math.min(0.99, Math.max(useApp.getState().progress, next));
        if (Math.floor(progress * 100) !== Math.floor(useApp.getState().progress * 100) || stage !== useApp.getState().stage)
          useApp.getState().set({ progress, ...(stage ? { stage } : {}) });
      },
      onDone(record) { if (generation.current === token) done(record); },
      onError(message) {
        if (generation.current !== token) return;
        useApp.getState().set({ status: "error", mode: "build", error: message });
        useApp.getState().notify(message, "fail");
      },
    });
  }, []);

  const runNow = useCallback(() => {
    const s = useApp.getState();
    if (s.status === "running") return;
    const p = structuredClone(s.history.present);
    const error = buildError(p);
    if (error) { s.notify(error, "fail"); return; }
    const token = ++generation.current;
    const missionId = s.mission;
    const conditions = MISSIONS[missionId].conditions;
    const pairs: { condition: FlowCondition; design: ExperimentRecord; baseline: ExperimentRecord }[] = [];
    s.set({ mode: "simulate", status: "running", error: null, stale: true, record: null, attempt: null, seed: 1, resultCondition: 0 });
    const next = (index: number) => {
      if (token !== generation.current) return;
      const condition = conditions[index]!;
      const config = missionConfig(condition);
      const conditionLabel = conditions.length > 1 ? ` · ${index+1}/${conditions.length}: ${CONDITIONS[condition].name}` : "";
      useApp.getState().set({ activeCondition: condition });
      const runDesign = (flat: ExperimentRecord) => {
        useApp.getState().set({ baselineRun: false });
        execute(p, config, token, `Testing your design${conditionLabel}`, record => {
          pairs.push({ condition, design: record, baseline: flat });
          if (index + 1 < conditions.length) { next(index + 1); return; }
          try {
            if (isMockSim) throw new Error("Mission completion requires the real simulator. Turn off VITE_USE_MOCK_SIM.");
            const attempt = evaluateMissionSet(missionId, pairs);
            const current = useApp.getState();
            current.set({ record: attempt.design, attempt, attempts: [...current.attempts, attempt].slice(-20), mode: "results", status: "done", stale: false, progress: 1, activeCondition: conditions[0]!, baselineRun: false });
          } catch (e) { useApp.getState().set({ status: "error", mode: "build", error: String(e) }); }
        });
      };
      const cached = baselines.current.get(condition);
      if (cached && JSON.stringify(cached.config) === JSON.stringify(config)) runDesign(cached);
      else {
        useApp.getState().set({ baselineRun: true });
        execute(preset("flat"), config, token, `Measuring the flat baseline${conditionLabel}`, flat => { baselines.current.set(condition, flat); runDesign(flat); });
      }
    };
    next(0);
  }, [execute]);

  const replay = useCallback((saved: ExperimentRecord) => {
    const s = useApp.getState();
    if (!s.setProfile(saved.profile)) return;
    const token = ++generation.current;
    s.set({ mode: "simulate", status: "running", record: null, attempt: null, stale: true, error: null, seed: saved.config.seed, baselineRun: false, activeCondition: saved.config.params.peakVelocityCmS === 3 ? "gentle" : "reference" });
    execute(structuredClone(saved.profile), structuredClone(saved.config), token, "Replaying saved parameters", record => {
      useApp.getState().set({ record, mode: "results", status: "done", stale: false, progress: 1 });
    });
  }, [execute]);
  return { runNow, cancel, replay };
}
