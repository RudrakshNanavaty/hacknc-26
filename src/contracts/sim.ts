import type { Profile } from "./geometry";
import type { ExperimentRecord } from "./experiment";

export interface GridConfig {
  nx: number;           // default 136 (4 feature pitches of 34 cells)
  ny: number;           // default 64
  cellSizeMm: number;   // physical mapping, set in SCIENCE.md (0.25 mm)
}

/**
 * v2: the flow is an oscillatory, wave-driven boundary layer over a
 * streamwise-periodic tile (see docs/PHASE_A.md §3). Larval parameters are
 * in physical units; the simulator converts them to lattice units.
 */
export interface SimParams {
  solver: "lbm-d2q9" | "potential-fallback";
  tau: number;                 // LBM relaxation time (TRT, symmetric part)
  peakVelocity: number;        // free-stream peak velocity, lattice units
  peakVelocityCmS: number;     // the same velocity in cm/s; fixes the time step
  periodSteps: number;         // oscillation period, LBM steps (multiple of phaseSamples)
  phaseSamples: number;        // stored flow snapshots per period
  spinupPeriods: number;       // periods run before the flow is recorded
  larvaPeriods: number;        // how long larvae are tracked, in periods
  larvaeCount: number;
  releaseBandCells: number;    // larvae released uniformly in the top N rows
  swimSpeedMmS: number;        // larval swimming speed
  rotDiffusion: number;        // larval heading diffusion, rad^2/s
  cueAttachProb: number;       // probability a surface encounter becomes settlement
  attachMaxSpeedMmS: number;   // attachment only possible where local flow is slower than this
}

export interface SimConfig {
  grid: GridConfig;
  params: SimParams;
  seed: number;
  simVersion: string;       // semver of src/sim
}

export type WorkerRequest =
  | { type: "run"; runId: string; profile: Profile; config: SimConfig }
  | { type: "cancel"; runId: string };

export type WorkerResponse =
  | { type: "progress"; runId: string; step: number; totalSteps: number; frame?: SimFrame }
  | { type: "done"; runId: string; record: ExperimentRecord }
  | { type: "error"; runId: string; message: string };

/** Sampled for visualization only, never used for scoring. */
export interface SimFrame {
  stage: "flow" | "larvae";
  fnx: number;                   // downsampled flow grid width
  fny: number;                   // downsampled flow grid height
  ux: Float32Array;              // downsampled flow field, lattice units, row-major from the bottom
  uy: Float32Array;
  larvae: Float32Array;          // [x0,y0,state0, ...] in cell units; state 0 swimming, 1 settled
}
