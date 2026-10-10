import type { GridConfig, SimParams } from "../contracts";

export const SIM_VERSION = "0.1.0";
export const RECORD_VERSION = 2;

/** 136 x 64 cells of 0.25 mm: a 34 x 16 mm tile, periodic in x (docs/SCIENCE.md). */
export const DEFAULT_GRID: GridConfig = { nx: 136, ny: 64, cellSizeMm: 0.25 };

/**
 * Parameters fixed from sources or by construction before calibration.
 * `cueAttachProb` and `attachMaxSpeedMmS` are the only calibrated parameters;
 * their frozen values live in benchmark/preregistration.json.
 */
export const BASE_PARAMS: Omit<SimParams, "cueAttachProb" | "attachMaxSpeedMmS"> = {
  solver: "lbm-d2q9",
  // Re = U·h/ν = 0.1 · 10 / ((tau − 0.5)/3) ≈ 112, matching 4.5 cm/s over 2.5 mm ridges in seawater
  tau: 0.5268,
  peakVelocity: 0.1,
  peakVelocityCmS: 4.5, // Levenstein 2022: 3–5 cm/s mean peak; their COMSOL model used 4.5
  periodSteps: 9888, // 48 × 206 steps ≈ 5.49 s (Levenstein 2022: 5–6 s period)
  phaseSamples: 48,
  spinupPeriods: 2,
  larvaPeriods: 3,
  larvaeCount: 2000,
  releaseBandCells: 20, // top 5 mm of the tile
  swimSpeedMmS: 3, // Levenstein 2022: species-averaged 3 ± 1 mm/s
  rotDiffusion: 1.0, // rad²/s — UNVERIFIED modelling assumption
};

/** Rows kept clear of geometry so the release band never overlaps a feature. */
export const PROFILE_HEADROOM = BASE_PARAMS.releaseBandCells + 2;
