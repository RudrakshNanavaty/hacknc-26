# Contracts

The types in `src/contracts/` are the **only** coupling between workstreams. If you code against these shapes, you never need to wait on another stream.

## Change process
1. Open a PR that touches only `src/contracts/*` and `fixtures/*`.
2. Get a review from someone in each stream that consumes the type.
3. If the change breaks a shape, bump `CONTRACT_VERSION`.
4. Announce it in the team chat. Consumers update in their own PRs.

---

## `src/contracts/geometry.ts`
```ts
export const CONTRACT_VERSION = 1;

/** Authoritative geometry. Units: cells of the simulation grid. */
export type SegmentKind = "flat" | "ridge" | "recess" | "step";

export interface Segment {
  id: string;
  kind: SegmentKind;
  x: number;        // left edge, in cells
  width: number;    // cells, >= 2
  height: number;   // cells; positive = up (ridge/step), negative = down (recess)
}

export interface Profile {
  id: string;
  name: string;
  baseHeight: number;   // seabed height in cells
  segments: Segment[];  // non-overlapping, sorted by x
  source: "preset" | "player";
}
```

## `src/contracts/sim.ts`
```ts
export interface GridConfig {
  nx: number;           // default 128
  ny: number;           // default 64
  cellSizeMm: number;   // physical mapping, set in SCIENCE.md
}

export interface SimParams {
  solver: "lbm-d2q9" | "potential-fallback";
  tau: number;              // LBM relaxation time
  inflowVelocity: number;   // lattice units
  larvaeCount: number;
  swimSpeed: number;
  cueAttachProb: number;
  steps: number;
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
  | { type: "progress"; runId: string; step: number; frame?: SimFrame }
  | { type: "done"; runId: string; record: ExperimentRecord }
  | { type: "error"; runId: string; message: string };

/** Sampled for visualization only, never used for scoring. */
export interface SimFrame {
  ux: Float32Array;              // downsampled flow field
  uy: Float32Array;
  larvae: Float32Array;          // [x0,y0,state0, x1,y1,state1, ...]
}
```

## `src/contracts/experiment.ts`
```ts
export interface Diagnostics {
  massDriftPct: number;  // mass drift over the run
  maxVelocity: number;
  diverged: boolean;
}

export interface ExperimentRecord {
  recordVersion: number;
  createdAt: string;               // ISO timestamp
  profile: Profile;
  config: SimConfig;
  assumptions: string[];           // shown in UI and fed to Gemini
  results: {
    released: number;
    settled: number;
    settlementPct: number;         // settled / released * 100
    normalizedScore?: number;      // per exposed surface length (see SCIENCE.md)
    exposedLength: number;
  };
  baselines?: { flat: number; ridge: number; recess: number }; // settlementPct
  diagnostics: Diagnostics;
}
```

---

## Fixtures
- `fixtures/sample-record.json`: a valid `ExperimentRecord` for UI work before the solver exists.
- `fixtures/presets.json`: the flat, ridge, recess and step profiles.
- `src/sim/mockWorker.ts`: emits fake `progress` and `done` messages from the fixtures.

Update the fixtures in the same PR as any contract change.
