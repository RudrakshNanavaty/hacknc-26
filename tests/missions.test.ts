import { describe, expect, it, beforeEach } from "vitest";
import frozen from "../benchmark/preregistration.json";
import { applyTool, historyInit, preset } from "../src/geometry";
import { BUILD_LIMITS, buildError, evaluateMission, evaluateMissionSet, materialUsed, missionConfig, reliefArea } from "../src/experiment/missions";
import { physicalMapping } from "../src/sim/units";
import { runExperimentSync } from "../src/sim/pipeline";
import { useApp } from "../src/state/store";
import type { FlowCycle } from "../src/sim/flow";

describe("mission building constraints", () => {
  beforeEach(() => useApp.setState({ history: historyInit(preset("flat")), status: "idle", record: null, mode: "build", error: null }));
  it("charges the final surface, refunds flattening, and rejects spam through state", () => {
    const s = useApp.getState();
    expect(materialUsed(preset("flat"))).toBe(34);
    expect(materialUsed(preset("ridge"))).toBe(54);
    expect(materialUsed(preset("recess"))).toBe(54);
    let p = preset("flat");
    for (const x of [10,35,60,85]) p = applyTool(p, BUILD_LIMITS, "ridge", x);
    expect(s.setProfile(p)).toBe(true);
    const tooMuch = applyTool(p, BUILD_LIMITS, "ridge", 115);
    expect(buildError(tooMuch)).toContain("Needs");
    expect(s.setProfile(tooMuch)).toBe(false);
    expect(useApp.getState().history.present).toEqual(p);
    expect(materialUsed(applyTool(p, BUILD_LIMITS, "flat", 10))).toBe(49);
    expect(materialUsed(applyTool(p, BUILD_LIMITS, "ridge", 10))).toBe(54);
  });
  it("preserves exact geometry across undo/redo and branches safely", () => {
    const a = applyTool(preset("flat"), BUILD_LIMITS, "ridge", 20);
    const b = applyTool(a, BUILD_LIMITS, "recess", 70);
    const s = useApp.getState();
    s.setProfile(a); s.setProfile(b); s.undo();
    expect(useApp.getState().history.present).toEqual(a);
    s.redo(); expect(useApp.getState().history.present).toEqual(b);
    s.undo(); s.setProfile(preset("step")); s.redo();
    expect(useApp.getState().history.present).toEqual(preset("step"));
    expect(useApp.getState().history.future).toEqual([]);
  });
  it("blocks edits while running and rejects invalid imported geometry", () => {
    useApp.setState({ status: "running" });
    expect(useApp.getState().setProfile(preset("ridge"))).toBe(false);
    useApp.setState({ status: "idle" });
    expect(useApp.getState().setProfile({ ...preset("ridge"), baseHeight: 2 })).toBe(false);
    expect(buildError({ ...preset("ridge"), segments: [{ id:"bad",kind:"ridge",x:0,width:136,height:NaN }] })).toBeTruthy();
  });
  it("uses a clone of the frozen scientific parameters", () => {
    const config = missionConfig();
    expect(config.params).toEqual(frozen.params);
    config.params.cueAttachProb = 0;
    expect(missionConfig().params).toEqual(frozen.params);
    expect(missionConfig().seed).toBe(1);
  });
  it("closes the periodic whole-bed-lift loophole and charges excavation equally", () => {
    const lifted = applyTool(preset("flat"),BUILD_LIMITS,"step",68,{width:136,height:10});
    expect(materialUsed(lifted)).toBe(34);
    expect(reliefArea(lifted)).toBe(85);
    expect(buildError(lifted)).toContain("shaping area");
    expect(buildError(preset("step"))).toBeNull();
    expect(reliefArea(applyTool(preset("flat"),BUILD_LIMITS,"ridge",40,{width:10}))).toBe(reliefArea(applyTool(preset("flat"),BUILD_LIMITS,"recess",40)));
  });
});

describe("real frozen mission results", () => {
  it("is achievable, rejects flat, reproduces exactly and rejects mismatched baselines", () => {
    const flowCache = new Map<string, FlowCycle>();
    const opts = { now: () => "fixed", flowCache };
    const flat = runExperimentSync(preset("flat"), missionConfig(), opts);
    const p = applyTool(preset("flat"), BUILD_LIMITS, "ridge", 34);
    const first = runExperimentSync(p, missionConfig(), opts);
    const again = runExperimentSync(p, missionConfig(), opts);
    expect(first).toEqual(again);
    expect(evaluateMission(flat,flat).complete).toBe(false);
    const outcome = evaluateMission(first,flat);
    console.log("Mission 1 actual results", { flat:flat.results.settlementPct, oneRidge:first.results.settlementPct, gain:outcome.gain, complete:outcome.complete });
    expect(outcome.complete).toBe(true);
    expect(outcome.gain).toBeGreaterThanOrEqual(1);
    expect(outcome.material).toBe(39);
    const otherSeed = structuredClone(flat); otherSeed.config.seed = 2;
    expect(() => evaluateMission(first,otherSeed)).toThrow("conditions");
    const diverged = structuredClone(first); diverged.diagnostics.diverged = true;
    expect(() => evaluateMission(diverged,flat)).toThrow("diagnostics");
    const renamed = { ...first, profile: { ...first.profile, id: "not-a-preset", name: "Anything" } };
    expect(evaluateMission(renamed,flat).gain).toBe(outcome.gain);
  }, 120000);
});

describe("Current Clash", () => {
  it("changes only environmental forcing and preserves physical time, viscosity and biology", () => {
    const reference = missionConfig();
    const gentle = missionConfig("gentle");
    const changed = Object.keys(reference.params).filter(k => reference.params[k as keyof typeof reference.params] !== gentle.params[k as keyof typeof gentle.params]);
    expect(changed.sort()).toEqual(["peakVelocity", "peakVelocityCmS"].sort());
    expect(physicalMapping(reference.grid,reference.params).dtS).toBeCloseTo(physicalMapping(gentle.grid,gentle.params).dtS,14);
    expect(gentle.params.tau).toBe(frozen.params.tau);
    expect(missionConfig().params).toEqual(frozen.params);
  });
  it("uses real outcomes in both currents, preserves geometry, and gates on the weaker gain", () => {
    const opts = { now: () => "fixed", flowCache: new Map<string, FlowCycle>() };
    const p = applyTool(preset("flat"),BUILD_LIMITS,"ridge",34);
    const pairs = (["reference","gentle"] as const).map(condition => ({ condition, design:runExperimentSync(p,missionConfig(condition),opts), baseline:runExperimentSync(preset("flat"),missionConfig(condition),opts) }));
    const outcome = evaluateMissionSet("clash",pairs);
    console.log("Current Clash actual results",outcome.conditions.map(c=>({current:c.condition,flat:c.baseline.results.settlementPct,design:c.design.results.settlementPct,gain:c.gain})));
    expect(outcome.complete).toBe(true);
    expect(outcome.gain).toBe(Math.min(...outcome.conditions.map(c=>c.gain)));
    expect(pairs[1]!.design.assumptions[1]).toContain("3 cm/s");
    expect(() => evaluateMissionSet("clash",[pairs[0]!])).toThrow("All mission conditions");
    const different = structuredClone(pairs); different[1]!.design.profile = preset("recess");
    expect(() => evaluateMissionSet("clash",different)).toThrow("same geometry");
    // Synthetic failed second outcome tests aggregation, not physical feasibility.
    const weaker = structuredClone(pairs); weaker[1]!.design.results = { ...weaker[1]!.baseline.results };
    expect(evaluateMissionSet("clash",weaker).complete).toBe(false);
    expect(missionConfig().params).toEqual(frozen.params);
  },120000);
});
