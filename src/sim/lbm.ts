/**
 * D2Q9 lattice-Boltzmann solver, two-relaxation-time (TRT) collision with Guo forcing.
 *
 * Domain: periodic in x; bounce-back on solid cells (no-slip); specular reflection at
 * the top row (free-slip lid). The flow is driven by a uniform body force F(t) along x,
 * which models the pressure gradient of a wave-driven oscillatory boundary layer.
 * Pure function of (mask, parameters): no randomness, no DOM.
 */

// Velocity set: 0 rest, 1 E, 2 N, 3 W, 4 S, 5 NE, 6 NW, 7 SW, 8 SE
const CX = [0, 1, 0, -1, 0, 1, -1, -1, 1];
const CY = [0, 0, 1, 0, -1, 1, 1, -1, -1];
const W = [4 / 9, 1 / 9, 1 / 9, 1 / 9, 1 / 9, 1 / 36, 1 / 36, 1 / 36, 1 / 36];
const OPP = [0, 3, 4, 1, 2, 7, 8, 5, 6];
const MIRROR_Y = [0, 1, 4, 3, 2, 8, 7, 6, 5];
/** TRT "magic" parameter; 3/16 places bounce-back walls exactly halfway between nodes. */
const MAGIC = 3 / 16;

export interface Lbm {
  nx: number;
  ny: number;
  step(fx: number): void;
  /** Writes macroscopic velocity into ux/uy (solid cells = 0); returns max |u|. */
  velocity(ux: Float32Array, uy: Float32Array, fx: number): number;
  mass(): number;
}

export function createLbm(mask: Uint8Array, nx: number, ny: number, tau: number): Lbm {
  const n = nx * ny;
  const fluid: number[] = [];
  for (let i = 0; i < n; i++) if (!mask[i]) fluid.push(i);
  const cells = Int32Array.from(fluid);
  const nf = cells.length;

  // Populations stored per fluid cell: f[c * 9 + k]
  let f = new Float64Array(nf * 9);
  let g = new Float64Array(nf * 9);
  const fluidIndex = new Int32Array(n).fill(-1);
  for (let c = 0; c < nf; c++) fluidIndex[cells[c]!] = c;

  // Precomputed streaming destination for each (cell, direction).
  const dst = new Int32Array(nf * 9);
  for (let c = 0; c < nf; c++) {
    const i = cells[c]!;
    const x = i % nx;
    const y = (i / nx) | 0;
    for (let k = 0; k < 9; k++) {
      const xn = (x + CX[k]! + nx) % nx;
      const yn = y + CY[k]!;
      if (yn >= ny) {
        // free-slip lid: reflect the vertical component
        const j = fluidIndex[(ny - 1) * nx + xn]!;
        dst[c * 9 + k] = j >= 0 ? j * 9 + MIRROR_Y[k]! : c * 9 + OPP[k]!;
      } else if (yn < 0 || mask[yn * nx + xn]) {
        dst[c * 9 + k] = c * 9 + OPP[k]!; // halfway bounce-back
      } else {
        dst[c * 9 + k] = fluidIndex[yn * nx + xn]! * 9 + k;
      }
    }
  }

  for (let c = 0; c < nf; c++) for (let k = 0; k < 9; k++) f[c * 9 + k] = W[k]!;

  const omP = 1 / tau;
  const omM = 1 / (MAGIC / (tau - 0.5) + 0.5);
  const sP = 1 - 0.5 * omP;
  const sM = 1 - 0.5 * omM;
  const W0 = 4 / 9;
  const W1 = 1 / 9;
  const W2 = 1 / 36;

  /**
   * TRT collision + Guo forcing (force along x only), unrolled, fused with streaming.
   * For a pair (a, o = opposite of a) with c·u = cu and c_x = cx:
   *   e+ = w ρ (1 + 4.5 cu² − 1.5 u²),  e− = 3 w ρ cu
   *   S+ = w F (9 cu cx − 3 ux),         S− = 3 w F cx
   */
  function step(fx: number) {
    const F = f;
    const G = g;
    for (let c = 0; c < nf; c++) {
      const b = c * 9;
      const f0 = F[b]!, f1 = F[b + 1]!, f2 = F[b + 2]!, f3 = F[b + 3]!, f4 = F[b + 4]!;
      const f5 = F[b + 5]!, f6 = F[b + 6]!, f7 = F[b + 7]!, f8 = F[b + 8]!;
      const rho = f0 + f1 + f2 + f3 + f4 + f5 + f6 + f7 + f8;
      const ux = (f1 - f3 + f5 - f6 - f7 + f8 + 0.5 * fx) / rho;
      const uy = (f2 - f4 + f5 + f6 - f7 - f8) / rho;
      const usq = 1.5 * (ux * ux + uy * uy);
      const base = 1 - usq;

      // rest population
      const e0 = W0 * rho * base;
      G[dst[b]!] = f0 - omP * (f0 - e0) + sP * (W0 * fx * -3 * ux);

      // pair (1 E, 3 W): cu = ux, cx = 1
      let cu = ux;
      let ep = W1 * rho * (base + 4.5 * cu * cu);
      let em = 3 * W1 * rho * cu;
      let rp = -omP * (0.5 * (f1 + f3) - ep) + sP * (W1 * fx * (9 * cu - 3 * ux));
      let rm = -omM * (0.5 * (f1 - f3) - em) + sM * (3 * W1 * fx);
      G[dst[b + 1]!] = f1 + rp + rm;
      G[dst[b + 3]!] = f3 + rp - rm;

      // pair (2 N, 4 S): cu = uy, cx = 0
      cu = uy;
      ep = W1 * rho * (base + 4.5 * cu * cu);
      em = 3 * W1 * rho * cu;
      rp = -omP * (0.5 * (f2 + f4) - ep) + sP * (W1 * fx * -3 * ux);
      rm = -omM * (0.5 * (f2 - f4) - em);
      G[dst[b + 2]!] = f2 + rp + rm;
      G[dst[b + 4]!] = f4 + rp - rm;

      // pair (5 NE, 7 SW): cu = ux + uy, cx = 1
      cu = ux + uy;
      ep = W2 * rho * (base + 4.5 * cu * cu);
      em = 3 * W2 * rho * cu;
      rp = -omP * (0.5 * (f5 + f7) - ep) + sP * (W2 * fx * (9 * cu - 3 * ux));
      rm = -omM * (0.5 * (f5 - f7) - em) + sM * (3 * W2 * fx);
      G[dst[b + 5]!] = f5 + rp + rm;
      G[dst[b + 7]!] = f7 + rp - rm;

      // pair (6 NW, 8 SE): cu = −ux + uy, cx = −1
      cu = -ux + uy;
      ep = W2 * rho * (base + 4.5 * cu * cu);
      em = 3 * W2 * rho * cu;
      rp = -omP * (0.5 * (f6 + f8) - ep) + sP * (W2 * fx * (-9 * cu - 3 * ux));
      rm = -omM * (0.5 * (f6 - f8) - em) + sM * (-3 * W2 * fx);
      G[dst[b + 6]!] = f6 + rp + rm;
      G[dst[b + 8]!] = f8 + rp - rm;
    }
    const t = f;
    f = g;
    g = t;
  }

  function velocity(uxOut: Float32Array, uyOut: Float32Array, fx: number): number {
    uxOut.fill(0);
    uyOut.fill(0);
    let max = 0;
    for (let c = 0; c < nf; c++) {
      const b = c * 9;
      let rho = 0;
      let jx = 0;
      let jy = 0;
      for (let k = 0; k < 9; k++) {
        const v = f[b + k]!;
        rho += v;
        jx += v * CX[k]!;
        jy += v * CY[k]!;
      }
      const ux = (jx + 0.5 * fx) / rho;
      const uy = jy / rho;
      const i = cells[c]!;
      uxOut[i] = ux;
      uyOut[i] = uy;
      const s = Math.hypot(ux, uy);
      if (!(s <= max)) max = s; // also propagates NaN
    }
    return max;
  }

  function mass(): number {
    let m = 0;
    for (let i = 0; i < f.length; i++) m += f[i]!;
    return m;
  }

  return { nx, ny, step, velocity, mass };
}
