import type { ExperimentRecord, Profile, SimConfig } from "../contracts";
import { exposedLengthMm, validateProfile } from "../geometry";
import { DEFAULT_GRID, PROFILE_HEADROOM } from "../sim/params";
import { appConfig } from "./benchmark";

export const MATERIAL_LIMIT = 54;
export const RELIEF_AREA_LIMIT = 30;
export const TARGET_GAIN = 1;
export const BUILD_LIMITS = { ...DEFAULT_GRID, headroom: PROFILE_HEADROOM };
export type MissionId = "first" | "clash";
export type FlowCondition = "reference" | "gentle";
export const CONDITIONS: Record<FlowCondition, { name: string; speed: number }> = {
  reference: { name: "Reference waves", speed: 4.5 }, gentle: { name: "Gentle waves", speed: 3 },
};
export const MISSIONS: Record<MissionId, { name: string; subtitle: string; objective: string; number: string; place: string; conditions: FlowCondition[] }> = {
  first: { name: "First Settlement", subtitle: "Give baby corals a place to land.", objective: "Beat flat by 1 percentage point. Build within 54 mm of material.", number: "01", place: "SHELTER COVE", conditions: ["reference"] },
  clash: { name: "Current Clash", subtitle: "One habitat. Two changing currents.", objective: "Beat each flat control by 1 point in both currents. Same design, 54 mm budget.", number: "02", place: "TIDAL PASS", conditions: ["reference", "gentle"] },
};
export const materialUsed = (profile: Profile) => exposedLengthMm(profile, DEFAULT_GRID);
export const reliefArea = (profile: Profile) => profile.segments.reduce((sum,s) => sum + Math.abs(s.height)*s.width,0)*DEFAULT_GRID.cellSizeMm**2;

/** A surface-fabrication allowance (including excavated walls), not physical mass. */
export function buildError(profile: Profile): string | null {
  if (profile.baseHeight !== 12 || !Array.isArray(profile.segments) || profile.segments.some(s =>
    !Number.isInteger(s.x) || !Number.isInteger(s.width) || !Number.isInteger(s.height))) return "Use whole grid cells and the fixed 3 mm seabed.";
  const errors = validateProfile(profile, BUILD_LIMITS);
  if (errors.length) return errors[0]!;
  const area = reliefArea(profile);
  if (area > RELIEF_AREA_LIMIT) return `Needs ${area.toFixed(1)} / ${RELIEF_AREA_LIMIT} mm² of shaping area. Narrow or flatten a feature.`;
  const used = materialUsed(profile);
  return used > MATERIAL_LIMIT ? `Needs ${used.toFixed(1)} / ${MATERIAL_LIMIT} mm. Flatten or shorten a feature to free material.` : null;
}
export function missionConfig(condition: FlowCondition = "reference"): SimConfig {
  const config = structuredClone(appConfig(1));
  if (condition === "gentle") {
    // Environmental forcing only. Scaling both velocities preserves dt, viscosity,
    // physical wave period and biological rules. Never mutate frozen benchmark data.
    config.params.peakVelocity *= 3 / config.params.peakVelocityCmS;
    config.params.peakVelocityCmS = 3;
  }
  return config;
}
export interface ConditionResult {
  condition: FlowCondition;
  design: ExperimentRecord;
  baseline: ExperimentRecord;
  gain: number;
  material: number;
  efficiency: number;
  tradeoff: string;
  suggestion: string;
}
export interface MissionAttempt extends ConditionResult {
  missionId: MissionId;
  complete: boolean;
  conditions: ConditionResult[];
}
function evaluatePair(design: ExperimentRecord, baseline: ExperimentRecord, condition: FlowCondition): ConditionResult {
  if (JSON.stringify(design.config) !== JSON.stringify(baseline.config)) throw new Error("Baseline conditions do not match this experiment.");
  if (JSON.stringify(design.config) !== JSON.stringify(missionConfig(condition))) throw new Error("Mission requires the locked seed and declared environmental parameters.");
  if (baseline.profile.baseHeight !== 12 || baseline.profile.segments.some(s => s.height !== 0)) throw new Error("Mission baseline must be flat.");
  for (const record of [design, baseline]) {
    const r = record.results;
    if (record.diagnostics.diverged || !Number.isFinite(r.settlementPct) || r.released <= 0 || r.settled < 0 || r.settled > r.released || Math.abs(r.settlementPct - r.settled / r.released * 100) > 1e-8)
      throw new Error("Experiment diagnostics or settlement counts are invalid.");
  }
  const gain = design.results.settlementPct - baseline.results.settlementPct;
  const material = materialUsed(design.profile);
  const efficiency = design.results.settled / material;
  const baseEfficiency = baseline.results.settled / materialUsed(baseline.profile);
  const extra = material - 34;
  const tradeoff = extra === 0 ? "No extra walls: the full fabrication allowance is still available."
    : `${extra.toFixed(1)} mm of extra surface ${gain >= 0 ? "gained" : "lost"} ${Math.abs(gain).toFixed(2)} settlement points; settlers per mm ${efficiency >= baseEfficiency ? "rose" : "fell"} versus flat.`;
  const suggestion = gain < TARGET_GAIN
    ? design.profile.segments.every(s => s.height === 0)
      ? "Place one ridge, then run again. Compare where settlers gather."
      : material >= MATERIAL_LIMIT
        ? "Flatten one feature and move it to another part of the settlement map. Test that one change."
        : "Add one spaced ridge and compare this attempt. Treat improvement as a hypothesis to test."
    : "Try shortening or removing one feature. Can you keep the improvement with less material?";
  return { condition, design, baseline, gain, material, efficiency, tradeoff, suggestion };
}

export function evaluateMissionSet(missionId: MissionId, pairs: { condition: FlowCondition; design: ExperimentRecord; baseline: ExperimentRecord }[]): MissionAttempt {
  const required = MISSIONS[missionId].conditions;
  if (pairs.length !== required.length || pairs.some((p,i) => p.condition !== required[i])) throw new Error("All mission conditions must be tested in order.");
  const geometry = (p: Profile) => JSON.stringify([p.baseHeight, p.segments.map(s => [s.x,s.width,s.height])]);
  if (pairs.some(p => geometry(p.design.profile) !== geometry(pairs[0]!.design.profile))) throw new Error("Current Clash requires the same geometry in both conditions.");
  const conditions = pairs.map(p => evaluatePair(p.design,p.baseline,p.condition));
  const first = conditions[0]!;
  const gain = Math.min(...conditions.map(c => c.gain));
  const complete = !buildError(first.design.profile) && gain >= TARGET_GAIN - 1e-9;
  const worst = conditions.reduce((a,b) => a.gain <= b.gain ? a : b);
  const range = Math.max(...conditions.map(c => c.gain))-gain;
  return { ...first, missionId, conditions, gain, complete,
    tradeoff: conditions.length === 1 ? first.tradeoff : `Gain varies by ${range.toFixed(2)} points. Limiting current: ${CONDITIONS[worst.condition].name.toLowerCase()} (${gain >= 0 ? "+" : ""}${gain.toFixed(2)}).`,
    suggestion: conditions.length === 1 ? first.suggestion : complete ? "Shorten one feature. Can both currents still gain at least 1 point?" : `Move one feature. Test whether the weaker ${CONDITIONS[worst.condition].name.toLowerCase()} result improves.`,
  };
}
export const evaluateMission = (design: ExperimentRecord, baseline: ExperimentRecord) => evaluateMissionSet("first", [{ condition: "reference", design, baseline }]);
