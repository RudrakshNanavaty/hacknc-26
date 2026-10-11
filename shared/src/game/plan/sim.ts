// The planning simulator: small, transparent, deterministic. A city plan is one configuration (a project,
// maybe amended, or the status quo) per area. Areas do not interact, so a plan's outcome is the mean of its
// areas'. Every plan is enumerated under three defined futures; nothing is sampled, so results are identical
// on every run and the cached file (shared/src/data/plan-sim.json, written by pipeline/plan-sim.ts) can be
// checked against this code. See sim-assumptions.ts for what is real and what is assumed.
import { districtById } from '../districts';
import { PLAN_SCENARIOS } from './scenarios';
import { allConfigs, configCost, configKey, configProfile, describeConfig, isFeasible, STATUS_QUO } from './rules';
import { AREA_BASELINE, FUTURES, MODEL, type FutureId } from './sim-assumptions';
import { ROUND_BUDGET, type PlanConfig, type PlanScenario } from './types';

export interface AreaOutcome {
  /** 0 (dry) to 100 (flooded): a ranking proxy, not a depth. Lower is better. */
  flood: number;
  /** 0 to 100 community access index. Higher is better. */
  access: number;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const r1 = (n: number) => Math.round(n * 10) / 10;

/** One area's configuration under one future. */
export function areaOutcome(sc: PlanScenario, c: PlanConfig, future: FutureId): AreaOutcome {
  const f = FUTURES.find((x) => x.id === future)!;
  const d = districtById(sc.district);
  const base = AREA_BASELINE[sc.district]!;
  const p = configProfile(sc, c);
  const tidal = clamp((f.tideFt - (base.marginFt + p.raiseFt)) / MODEL.tideRangeFt, 0, 1);
  const unhandled = 1 - clamp(base.drainage + p.drainage, 0, 1);
  const rain = clamp((f.rainIn * unhandled) / MODEL.rainRangeIn, 0, 1);
  const wave = future === 'extreme' ? 1 + MODEL.veBoost * d.veBandShare : 1;
  const exposure = 100 * d.sfhaShare * (MODEL.weightTide * tidal + MODEL.weightRain * rain) * wave * (1 - MODEL.elevateRelief * p.elevate);
  return { flood: r1(clamp(exposure, 0, 100)), access: r1(clamp(MODEL.accessBase + MODEL.accessPerUnit * p.access, 0, 100)) };
}

/** A city plan: one configuration per scenario, in play order. */
export type CityPlan = PlanConfig[];
export const planKey = (p: CityPlan) => p.map(configKey).join(' | ');

export interface FutureOutcome {
  future: FutureId;
  /** Mean flood exposure over the three areas (0-100, lower is better). */
  flood: number;
  access: number;
  perArea: AreaOutcome[];
}
export interface PlanOutcome {
  key: string;
  plan: CityPlan;
  /** Game units over the three rounds. */
  cost: number;
  /** Every area went ahead and fits its round budget and constraints. */
  feasible: boolean;
  byFuture: FutureOutcome[];
  /** The worst (highest) mean exposure over the futures: the robustness measure. */
  worstFlood: number;
  /** Access index in ordinary conditions. */
  access: number;
}

const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;

export function planOutcome(plan: CityPlan, scenarios: readonly PlanScenario[] = PLAN_SCENARIOS): PlanOutcome {
  const byFuture = FUTURES.map<FutureOutcome>((f) => {
    const perArea = scenarios.map((sc, i) => areaOutcome(sc, plan[i] ?? STATUS_QUO, f.id));
    return { future: f.id, flood: r1(mean(perArea.map((a) => a.flood))), access: r1(mean(perArea.map((a) => a.access))), perArea };
  });
  return {
    key: planKey(plan),
    plan,
    cost: scenarios.reduce((s, sc, i) => s + configCost(sc, plan[i] ?? STATUS_QUO), 0),
    feasible: scenarios.every((sc, i) => isFeasible(sc, plan[i] ?? STATUS_QUO, ROUND_BUDGET)),
    byFuture,
    worstFlood: Math.max(...byFuture.map((x) => x.flood)),
    access: byFuture[0]!.access,
  };
}

let cache: PlanOutcome[] | null = null;

/** Every plan the scenarios allow (status quo included in each area), with its outcome. Computed once. */
export function enumeratePlans(): PlanOutcome[] {
  if (cache) return cache;
  const per = PLAN_SCENARIOS.map((sc) => allConfigs(sc));
  const out: PlanOutcome[] = [];
  for (const a of per[0]!) for (const b of per[1]!) for (const c of per[2]!) out.push(planOutcome([a, b, c]));
  cache = out;
  return out;
}

export const baseOptionPlans = (): PlanOutcome[] => enumeratePlans().filter((p) => p.plan.every((c) => c.option !== null && c.amendment === null));

// ---------- Comparing the plan the table made with others ----------

export interface Alternative {
  id: 'most-protective' | 'lowest-cost' | 'most-access';
  title: string;
  why: string;
  outcome: PlanOutcome;
}

/** Deterministic ordering: key text breaks every tie. */
const by = (f: (p: PlanOutcome) => number[]) => (a: PlanOutcome, b: PlanOutcome) => {
  const x = f(a);
  const y = f(b);
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i]! - y[i]!;
  return a.key.localeCompare(b.key);
};

/** Three contrasting feasible plans. None is "the right plan": each optimises something different. */
export function alternatives(): Alternative[] {
  const feasible = enumeratePlans().filter((p) => p.feasible);
  const holds = feasible.filter((p) => p.byFuture[1]!.flood <= MODEL.holdExposure);
  const protective = [...feasible].sort(by((p) => [p.worstFlood, p.cost]))[0]!;
  const cheap = [...(holds.length ? holds : feasible)].sort(by((p) => [p.cost, p.worstFlood]))[0]!;
  const access = [...feasible].sort(by((p) => [-p.access, p.worstFlood, p.cost]))[0]!;
  return [
    { id: 'most-protective', title: 'Most protective', why: 'The lowest modelled flood exposure in its worst future.', outcome: protective },
    { id: 'lowest-cost', title: 'Lowest cost that holds', why: `The cheapest plan that keeps high-tide exposure at or below ${MODEL.holdExposure}.`, outcome: cheap },
    { id: 'most-access', title: 'Most public access', why: 'The highest community-access index, then the least flood exposure.', outcome: access },
  ];
}

/** Share of all feasible plans that the given plan beats on worst-case flood exposure (strictly lower). */
export function beatsShare(o: PlanOutcome): number {
  const feasible = enumeratePlans().filter((p) => p.feasible);
  return feasible.length ? feasible.filter((p) => p.worstFlood > o.worstFlood).length / feasible.length : 0;
}

/** Does the storm scene hold? The plan's exposure in the extreme future against MODEL.stormHeldMax. */
export function stormResult(o: PlanOutcome): { exposure: number; held: boolean; limit: number } {
  const exposure = o.byFuture.find((x) => x.future === 'extreme')!.flood;
  return { exposure, held: exposure <= MODEL.stormHeldMax, limit: MODEL.stormHeldMax };
}

/** The feasible configuration for one area with the lowest modelled exposure in the extreme future (cheaper, then key, on ties). */
export function bestForArea(sc: PlanScenario): PlanConfig {
  const configs = allConfigs(sc).filter((c) => isFeasible(sc, c, ROUND_BUDGET));
  return configs.sort((a, b) => areaOutcome(sc, a, 'extreme').flood - areaOutcome(sc, b, 'extreme').flood || configCost(sc, a) - configCost(sc, b) || configKey(a).localeCompare(configKey(b)))[0]!;
}

export interface Divergence {
  scenarioId: string;
  district: string;
  adopted: string;
  modelBest: string;
  /** The table adopted the project the model rates best for flood in the extreme future. */
  agrees: boolean;
  /** What the players said they would pick themselves (voluntary, outside the role), most common first. */
  personal: { option: string; count: number }[];
  /** The most common personal pick is the model's best option. */
  personalAgrees: boolean | null;
}

/** Where what was built, what people personally prefer, and what the model rates best part ways. */
export function divergence(plan: CityPlan, personal: Record<string, string[]> = {}): Divergence[] {
  return PLAN_SCENARIOS.map((sc, i) => {
    const best = bestForArea(sc);
    const adopted = plan[i] ?? STATUS_QUO;
    const picks = personal[sc.id] ?? [];
    const tally = new Map<string, number>();
    for (const p of picks) tally.set(p, (tally.get(p) ?? 0) + 1);
    const ranked = [...tally.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([option, count]) => ({ option, count }));
    return {
      scenarioId: sc.id,
      district: sc.district,
      adopted: describeConfig(sc, adopted),
      modelBest: describeConfig(sc, best),
      agrees: adopted.option === best.option,
      personal: ranked,
      personalAgrees: ranked.length ? ranked[0]!.option === best.option : null,
    };
  });
}

/** The compact, cacheable form written to shared/src/data/plan-sim.json. */
export function cacheRows(): { k: string; c: number; f: boolean; fl: number[]; ac: number }[] {
  return enumeratePlans().map((p) => ({ k: p.key, c: p.cost, f: p.feasible, fl: p.byFuture.map((x) => x.flood), ac: p.access }));
}
