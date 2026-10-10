/**
 * The UI's view of the pre-registered benchmark. The app always simulates with the
 * frozen parameters, so a player's score is comparable with the baselines.
 * Files are loaded with an eager glob so the app still builds before they exist.
 */
import type { SimConfig, SimParams } from "../contracts";
import { BASE_PARAMS, DEFAULT_GRID, SIM_VERSION } from "../sim/params";

interface CI {
  n: number;
  mean: number;
  lo: number;
  hi: number;
}

export interface BenchmarkResults {
  status: "PASS" | "FAIL";
  seeds: number[];
  settlementPct: { flat: CI; ridge: CI; recess: CI };
  recessMinusRidge: CI;
  ratioRecessToRidge: number;
  preregistrationCommit: string;
}

interface Preregistration {
  params: SimParams;
  seeds: number[];
  prediction: string;
  passRule: string;
  frozenAt: string;
}

const files = import.meta.glob<{ default: unknown }>("../../benchmark/{preregistration,results}.json", { eager: true });
const find = (name: string) => Object.entries(files).find(([k]) => k.endsWith(name))?.[1]?.default;

export const PREREGISTRATION = (find("preregistration.json") as Preregistration | undefined) ?? null;
export const BENCHMARK = (find("results.json") as BenchmarkResults | undefined) ?? null;

/** Before the freeze, the app runs with provisional attachment parameters and says so. */
export const FROZEN = PREREGISTRATION !== null;

const params: SimParams = PREREGISTRATION?.params ?? { ...BASE_PARAMS, cueAttachProb: 0.1, attachMaxSpeedMmS: 5 };

export function appConfig(seed: number): SimConfig {
  return { grid: DEFAULT_GRID, params, seed, simVersion: SIM_VERSION };
}

export const baselines = BENCHMARK
  ? {
      flat: BENCHMARK.settlementPct.flat.mean,
      ridge: BENCHMARK.settlementPct.ridge.mean,
      recess: BENCHMARK.settlementPct.recess.mean,
    }
  : null;

export function ciText(): string {
  if (!BENCHMARK) return "Held-out recess test not run yet";
  const d = BENCHMARK.recessMinusRidge;
  const sign = (x: number) => (x >= 0 ? "+" : "−") + Math.abs(x).toFixed(2);
  return `Recess − ridge: ${sign(d.mean)} pts, 95% CI [${sign(d.lo)}, ${sign(d.hi)}], ${d.n} seeds`;
}
