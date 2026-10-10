import { describe, expect, it } from "vitest";
import type { SimConfig, SimParams } from "../src/contracts";
import { meanCI, pairedDiffCI } from "../src/experiment/stats";
import { preset, profileToMask } from "../src/geometry";
import { computeFlowCycle } from "../src/sim/flow";
import { createLbm } from "../src/sim/lbm";
import { BASE_PARAMS, DEFAULT_GRID, SIM_VERSION } from "../src/sim/params";
import { runExperiment, runExperimentSync } from "../src/sim/pipeline";
import { createRng } from "../src/sim/rng";

/** Reduced config so engineering checks run in seconds. Not used for any science. */
const FAST: SimParams = {
  ...BASE_PARAMS,
  periodSteps: 2400, // long enough that acoustic waves are faster than the forcing
  phaseSamples: 24,
  spinupPeriods: 1,
  larvaPeriods: 8, // ~11 s of larval time
  larvaeCount: 300,
  cueAttachProb: 0.3,
  attachMaxSpeedMmS: 20,
};
const cfg = (seed: number, params = FAST): SimConfig => ({ grid: DEFAULT_GRID, params, seed, simVersion: SIM_VERSION });

describe("rng", () => {
  it("is deterministic per seed and differs across seeds", () => {
    const a = createRng(5);
    const b = createRng(5);
    const c = createRng(6);
    const sa = Array.from({ length: 5 }, () => a.next());
    expect(sa).toEqual(Array.from({ length: 5 }, () => b.next()));
    expect(sa).not.toEqual(Array.from({ length: 5 }, () => c.next()));
    expect(sa.every((x) => x >= 0 && x < 1)).toBe(true);
  });
});

describe("lbm", () => {
  it("conserves mass and stays at rest without forcing", () => {
    const mask = profileToMask(preset("ridge"), DEFAULT_GRID);
    const lbm = createLbm(mask, DEFAULT_GRID.nx, DEFAULT_GRID.ny, BASE_PARAMS.tau);
    const m0 = lbm.mass();
    for (let i = 0; i < 50; i++) lbm.step(0);
    const ux = new Float32Array(mask.length);
    const uy = new Float32Array(mask.length);
    expect(lbm.velocity(ux, uy, 0)).toBeLessThan(1e-12);
    expect(Math.abs(lbm.mass() - m0) / m0).toBeLessThan(1e-12);
  });

  it("oscillatory forcing gives a bounded flow, zero inside solids, conserved mass", () => {
    const mask = profileToMask(preset("ridge"), DEFAULT_GRID);
    const gen = computeFlowCycle(mask, DEFAULT_GRID.nx, DEFAULT_GRID.ny, FAST);
    let r = gen.next();
    while (!r.done) r = gen.next();
    const flow = r.value;
    expect(flow.diagnostics.diverged).toBe(false);
    expect(Math.abs(flow.diagnostics.massDriftPct)).toBeLessThan(1e-6);
    // Test forcing is 4× faster than production, so acoustic overshoot is larger here;
    // the production config measures maxU ≈ 0.11 (benchmark/probe.ts).
    expect(flow.diagnostics.maxVelocity).toBeLessThan(0.25);
    expect(flow.ux).toHaveLength(FAST.phaseSamples);
    for (let i = 0; i < mask.length; i++) if (mask[i]) expect(flow.ux[3]![i]).toBe(0);
  });
});

describe("pipeline", () => {
  it("same seed, geometry and parameters give an identical record", () => {
    const now = () => "t";
    const a = runExperimentSync(preset("ridge"), cfg(3), { now });
    const b = runExperimentSync(preset("ridge"), cfg(3), { now });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.results.settled).toBeGreaterThan(0);
    expect(a.results.settled).toBeLessThanOrEqual(a.results.released);
    expect(a.results.settlementPct).toBeCloseTo((a.results.settled / a.results.released) * 100);
  });

  it("score does not depend on whether frames are emitted", () => {
    const gen = runExperiment(preset("ridge"), cfg(3), { frames: true, now: () => "t" });
    let r = gen.next();
    let frames = 0;
    while (!r.done) {
      if (r.value.frame) frames++;
      r = gen.next();
    }
    const plain = runExperimentSync(preset("ridge"), cfg(3), { now: () => "t" });
    expect(frames).toBeGreaterThan(0);
    expect(r.value.results).toEqual(plain.results);
  });

  it("settlers sit on the tile and never inside the release band", () => {
    const rec = runExperimentSync(preset("recess"), cfg(4));
    for (const x of rec.results.settledX) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(DEFAULT_GRID.nx);
    }
  });

  it("zero attachment probability gives zero settlement", () => {
    const rec = runExperimentSync(preset("ridge"), cfg(1, { ...FAST, cueAttachProb: 0 }));
    expect(rec.results.settled).toBe(0);
  });
});

describe("stats", () => {
  it("computes a paired 95% t-interval", () => {
    const d = pairedDiffCI([3, 4, 5, 6], [1, 1, 1, 1]);
    expect(d.mean).toBeCloseTo(3.5);
    expect(d.lo).toBeLessThan(3.5);
    expect(d.hi).toBeGreaterThan(3.5);
    expect(meanCI([2, 2, 2]).lo).toBe(2);
  });
});
