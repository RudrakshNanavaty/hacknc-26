import type { PhysicalMapping, SimParams } from "../contracts";
import type { FlowCycle } from "./flow";
import { createRng } from "./rng";
import { latticeToMmS } from "./units";

/**
 * Larval model (docs/SCIENCE.md):
 * - advected by the flow (bilinear in space, linear between phase snapshots)
 * - swim at a constant speed along a heading that diffuses (rotational diffusion)
 * - a step that would enter a solid cell is a surface *encounter*, not settlement
 * - an encounter becomes settlement with probability `cueAttachProb`, and only where
 *   the local flow is slower than `attachMaxSpeedMmS`; otherwise the larva turns away
 * Points are massless and neutrally buoyant. Larvae never interact with each other.
 */

/** Lattice steps per larva step. Keeps per-step displacement below ~0.6 cells. */
export const LARVA_SUBSTEPS = 4;

export interface LarvaState {
  x: Float64Array;
  y: Float64Array;
  heading: Float64Array;
  settled: Uint8Array;
}

export interface LarvaProgress {
  step: number;
  totalSteps: number;
  phase: number; // continuous phase index in [0, phases)
  state: LarvaState;
}

export interface LarvaResult {
  released: number;
  settled: number;
  settledX: number[];
}

/**
 * Bilinear sample of (ux, uy) at (px, py), linearly blended between two phase snapshots.
 * Nodes sit at cell centres (x + 0.5, y + 0.5); x is periodic. Writes into `out`.
 */
function sampleFlow(
  ux0: Float32Array, ux1: Float32Array, uy0: Float32Array, uy1: Float32Array, w1: number,
  nx: number, ny: number, px: number, py: number, out: Float64Array,
) {
  const gx = px - 0.5;
  const gy = Math.min(ny - 1, Math.max(0, py - 0.5));
  const x0 = Math.floor(gx);
  const y0 = Math.min(ny - 2, Math.floor(gy));
  const tx = gx - x0;
  const ty = gy - y0;
  const xa = ((x0 % nx) + nx) % nx;
  const xb = xa + 1 === nx ? 0 : xa + 1;
  const i00 = y0 * nx + xa, i01 = y0 * nx + xb, i10 = i00 + nx, i11 = (y0 + 1) * nx + xb;
  const a00 = (1 - tx) * (1 - ty), a01 = tx * (1 - ty), a10 = (1 - tx) * ty, a11 = tx * ty;
  const w0 = 1 - w1;
  out[0] =
    w0 * (ux0[i00]! * a00 + ux0[i01]! * a01 + ux0[i10]! * a10 + ux0[i11]! * a11) +
    w1 * (ux1[i00]! * a00 + ux1[i01]! * a01 + ux1[i10]! * a10 + ux1[i11]! * a11);
  out[1] =
    w0 * (uy0[i00]! * a00 + uy0[i01]! * a01 + uy0[i10]! * a10 + uy0[i11]! * a11) +
    w1 * (uy1[i00]! * a00 + uy1[i01]! * a01 + uy1[i10]! * a10 + uy1[i11]! * a11);
}

export function* runLarvae(
  flow: FlowCycle,
  mask: Uint8Array,
  params: SimParams,
  phys: PhysicalMapping,
  seed: number,
  chunk = 60,
): Generator<LarvaProgress, LarvaResult> {
  const { nx, ny, phases } = flow;
  const rng = createRng(seed);
  const n = params.larvaeCount;
  const toMmS = latticeToMmS(phys);
  const swim = params.swimSpeedMmS / toMmS; // lattice units per lattice step
  const dtLarva = LARVA_SUBSTEPS * phys.dtS;
  const headingNoise = Math.sqrt(2 * params.rotDiffusion * dtLarva);
  const attachMax = params.attachMaxSpeedMmS / toMmS;
  const larvaStepsPerPeriod = params.periodSteps / LARVA_SUBSTEPS;
  const totalSteps = Math.round(params.larvaPeriods * larvaStepsPerPeriod);

  const state: LarvaState = {
    x: new Float64Array(n),
    y: new Float64Array(n),
    heading: new Float64Array(n),
    settled: new Uint8Array(n),
  };
  const bandLow = ny - params.releaseBandCells;
  for (let i = 0; i < n; i++) {
    state.x[i] = rng.next() * nx;
    state.y[i] = bandLow + rng.next() * (params.releaseBandCells - 1);
    state.heading[i] = rng.next() * 2 * Math.PI;
  }

  const solidAt = (px: number, py: number) => {
    if (py < 0) return true;
    if (py >= ny) return false;
    const cx = ((Math.floor(px) % nx) + nx) % nx;
    return mask[Math.floor(py) * nx + cx] === 1;
  };

  const u = new Float64Array(2);
  let settledCount = 0;
  const settledX: number[] = [];

  for (let s = 0; s < totalSteps; s++) {
    const phase = ((s % larvaStepsPerPeriod) / larvaStepsPerPeriod) * phases;
    const p0 = Math.floor(phase) % phases;
    const p1 = (p0 + 1) % phases;
    const w1 = phase - Math.floor(phase);
    const ux0 = flow.ux[p0]!;
    const ux1 = flow.ux[p1]!;
    const uy0 = flow.uy[p0]!;
    const uy1 = flow.uy[p1]!;

    for (let i = 0; i < n; i++) {
      if (state.settled[i]) continue;
      const px = state.x[i]!;
      const py = state.y[i]!;
      sampleFlow(ux0, ux1, uy0, uy1, w1, nx, ny, px, py, u);
      const fx = u[0]!;
      const fy = u[1]!;
      let h = state.heading[i]! + headingNoise * rng.normal();
      const nxp = px + LARVA_SUBSTEPS * (fx + swim * Math.cos(h));
      const nyp = py + LARVA_SUBSTEPS * (fy + swim * Math.sin(h));

      if (solidAt(nxp, nyp)) {
        // Encounter. Contact alone is not settlement.
        const localSpeed = Math.hypot(fx, fy);
        if (localSpeed < attachMax && rng.next() < params.cueAttachProb) {
          state.settled[i] = 1;
          settledCount++;
          settledX.push(px);
        } else {
          h = h + Math.PI + (rng.next() - 0.5) * Math.PI; // turn away from the surface
        }
      } else if (nyp >= ny - 0.5) {
        state.x[i] = ((nxp % nx) + nx) % nx;
        h = -h; // reflect off the free-slip lid
      } else {
        state.x[i] = ((nxp % nx) + nx) % nx;
        state.y[i] = nyp;
      }
      state.heading[i] = h;
    }

    if ((s + 1) % chunk === 0) yield { step: s + 1, totalSteps, phase, state };
  }

  return { released: n, settled: settledCount, settledX };
}
