import type { Diagnostics, SimParams } from "../contracts";
import { createLbm } from "./lbm";

/** One converged oscillation period of the flow, stored as phase snapshots. */
export interface FlowCycle {
  nx: number;
  ny: number;
  phases: number;
  ux: Float32Array[]; // ux[p][y * nx + x], lattice units
  uy: Float32Array[];
  diagnostics: Diagnostics;
}

/** Above this lattice speed the LBM is no longer trustworthy (Ma ≈ 0.6). */
export const DIVERGENCE_SPEED = 0.35;

export interface FlowProgress {
  step: number;
  totalSteps: number;
  /** Latest velocity field, present only on snapshot steps. */
  ux?: Float32Array;
  uy?: Float32Array;
}

/**
 * Spin up the oscillatory boundary layer, then record `phaseSamples` snapshots over
 * one more period. Body force F(t) = U·ω·cos(ωt) gives a free stream U·sin(ωt).
 * Yields after every `chunk` steps so callers can stay responsive and cancel.
 */
export function* computeFlowCycle(
  mask: Uint8Array,
  nx: number,
  ny: number,
  params: SimParams,
  chunk = 250,
): Generator<FlowProgress, FlowCycle> {
  const lbm = createLbm(mask, nx, ny, params.tau);
  const { periodSteps, phaseSamples, spinupPeriods, peakVelocity } = params;
  if (periodSteps % phaseSamples !== 0) throw new Error("periodSteps must be a multiple of phaseSamples");
  const omega = (2 * Math.PI) / periodSteps;
  const force = (t: number) => peakVelocity * omega * Math.cos(omega * t);
  const spinup = spinupPeriods * periodSteps;
  const totalSteps = spinup + periodSteps;
  const every = periodSteps / phaseSamples;

  const mass0 = lbm.mass();
  const ux: Float32Array[] = [];
  const uy: Float32Array[] = [];
  let maxVelocity = 0;
  let diverged = false;
  const probeX = new Float32Array(nx * ny);
  const probeY = new Float32Array(nx * ny);

  for (let t = 0; t < totalSteps; t++) {
    lbm.step(force(t));
    const tNext = t + 1;
    const recording = tNext >= spinup && (tNext - spinup) % every === 0 && ux.length < phaseSamples;
    const probing = tNext % chunk === 0;
    if (recording || probing) {
      const sx = recording ? new Float32Array(nx * ny) : probeX;
      const sy = recording ? new Float32Array(nx * ny) : probeY;
      const m = lbm.velocity(sx, sy, force(tNext));
      if (!(m < DIVERGENCE_SPEED)) {
        diverged = true;
        maxVelocity = Number.isFinite(m) ? m : Infinity;
        break;
      }
      maxVelocity = Math.max(maxVelocity, m);
      if (recording) {
        ux.push(sx);
        uy.push(sy);
      }
      if (probing) yield { step: tNext, totalSteps, ux: sx, uy: sy };
    }
  }

  const massDriftPct = ((lbm.mass() - mass0) / mass0) * 100;
  return {
    nx,
    ny,
    phases: phaseSamples,
    ux,
    uy,
    diagnostics: { massDriftPct, maxVelocity, diverged },
  };
}
