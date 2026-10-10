import type { ExperimentRecord, Profile, SimConfig, SimFrame } from "../contracts";
import { exposedLengthMm, profileToMask } from "../geometry/mask";
import { computeFlowCycle, type FlowCycle } from "./flow";
import { runLarvae } from "./larvae";
import { RECORD_VERSION } from "./params";
import { physicalMapping } from "./units";

export const ASSUMPTIONS = [
  "2D cross-section of a periodic 34 × 16 mm tile; real structures are 3D",
  "Oscillatory wave-driven flow, 4.5 cm/s peak, 5.5 s period, Re ≈ 112 on 2.5 mm features",
  "Laminar 2D flow; the experiments were transitional and 3D",
  "Larvae are points: advection + 3 mm/s swimming with random heading changes",
  "Settlement = surface encounter in slow local flow, then a fixed attachment probability",
  "No chemical cues, light, competition or larval size effects",
  "Settlement only; no post-settlement survival or growth",
];

export interface PipelineProgress {
  stage: "flow" | "larvae";
  step: number;
  totalSteps: number;
  frame?: SimFrame;
}

/** Flow depends only on geometry and flow parameters, so it can be cached across seeds. */
export function flowCacheKey(profile: Profile, config: SimConfig): string {
  const { tau, peakVelocity, periodSteps, phaseSamples, spinupPeriods, solver } = config.params;
  const g = config.grid;
  const heights = profile.segments.map((s) => `${s.x}:${s.width}:${s.height}`).join(",");
  return [solver, tau, peakVelocity, periodSteps, phaseSamples, spinupPeriods, g.nx, g.ny, profile.baseHeight, heights].join("|");
}

const DOWNSAMPLE = 4;

function downsample(field: Float32Array, nx: number, ny: number): Float32Array {
  const fnx = Math.floor(nx / DOWNSAMPLE);
  const fny = Math.floor(ny / DOWNSAMPLE);
  const out = new Float32Array(fnx * fny);
  for (let j = 0; j < fny; j++)
    for (let i = 0; i < fnx; i++) {
      let s = 0;
      for (let dy = 0; dy < DOWNSAMPLE; dy++)
        for (let dx = 0; dx < DOWNSAMPLE; dx++) s += field[(j * DOWNSAMPLE + dy) * nx + i * DOWNSAMPLE + dx]!;
      out[j * fnx + i] = s / (DOWNSAMPLE * DOWNSAMPLE);
    }
  return out;
}

function frameFrom(stage: SimFrame["stage"], ux: Float32Array, uy: Float32Array, nx: number, ny: number, larvae: Float32Array): SimFrame {
  return {
    stage,
    fnx: Math.floor(nx / DOWNSAMPLE),
    fny: Math.floor(ny / DOWNSAMPLE),
    ux: downsample(ux, nx, ny),
    uy: downsample(uy, nx, ny),
    larvae,
  };
}

export interface PipelineOptions {
  /** Emit visualization frames (the benchmark turns this off). Never affects results. */
  frames?: boolean;
  flowCache?: Map<string, FlowCycle>;
  now?: () => string;
}

/**
 * profile → mask → flow cycle → larvae → settlement → record.
 * A generator so the worker can interleave cancellation; the benchmark just drains it.
 */
export function* runExperiment(
  profile: Profile,
  config: SimConfig,
  opts: PipelineOptions = {},
): Generator<PipelineProgress, ExperimentRecord> {
  const { grid, params, seed } = config;
  if (params.solver !== "lbm-d2q9") throw new Error(`solver ${params.solver} is not implemented`);
  const { nx, ny } = grid;
  const mask = profileToMask(profile, grid);
  const phys = physicalMapping(grid, params);
  const frames = opts.frames ?? false;
  const flowSteps = (params.spinupPeriods + 1) * params.periodSteps;

  const key = flowCacheKey(profile, config);
  let flow = opts.flowCache?.get(key);
  if (!flow) {
    const gen = computeFlowCycle(mask, nx, ny, params);
    for (;;) {
      const r = gen.next();
      if (r.done) {
        flow = r.value;
        break;
      }
      const p = r.value;
      yield {
        stage: "flow",
        step: p.step,
        totalSteps: p.totalSteps,
        frame: frames && p.ux && p.uy ? frameFrom("flow", p.ux, p.uy, nx, ny, new Float32Array(0)) : undefined,
      };
    }
    if (!flow.diagnostics.diverged) opts.flowCache?.set(key, flow);
  }

  let larvaResult = { released: params.larvaeCount, settled: 0, settledX: [] as number[] };
  if (!flow.diagnostics.diverged) {
    const gen = runLarvae(flow, mask, params, phys, seed);
    for (;;) {
      const r = gen.next();
      if (r.done) {
        larvaResult = r.value;
        break;
      }
      const p = r.value;
      let frame: SimFrame | undefined;
      if (frames) {
        const n = p.state.x.length;
        const larvae = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) {
          larvae[i * 3] = p.state.x[i]!;
          larvae[i * 3 + 1] = p.state.y[i]!;
          larvae[i * 3 + 2] = p.state.settled[i]!;
        }
        const ph = Math.floor(p.phase) % flow.phases;
        frame = frameFrom("larvae", flow.ux[ph]!, flow.uy[ph]!, nx, ny, larvae);
      }
      yield { stage: "larvae", step: flowSteps + p.step * 4, totalSteps: flowSteps + p.totalSteps * 4, frame };
    }
  }

  const exposedLength = exposedLengthMm(profile, grid);
  const flatLength = nx * grid.cellSizeMm;
  const settlementPct = (larvaResult.settled / larvaResult.released) * 100;
  return {
    recordVersion: RECORD_VERSION,
    createdAt: (opts.now ?? (() => new Date().toISOString()))(),
    profile,
    config,
    physical: phys,
    assumptions: ASSUMPTIONS,
    results: {
      released: larvaResult.released,
      settled: larvaResult.settled,
      settlementPct,
      normalizedScore: settlementPct / (exposedLength / flatLength),
      exposedLength,
      settledX: larvaResult.settledX.map((x) => Math.round(x * 100) / 100),
    },
    diagnostics: flow.diagnostics,
  };
}

/** Run to completion synchronously (benchmark, tests). */
export function runExperimentSync(profile: Profile, config: SimConfig, opts: PipelineOptions = {}): ExperimentRecord {
  const gen = runExperiment(profile, config, { ...opts, frames: false });
  for (;;) {
    const r = gen.next();
    if (r.done) return r.value;
  }
}
