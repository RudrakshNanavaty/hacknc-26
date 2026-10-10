# Architecture

## Pipeline
```
 Builder (2D)                    Web Worker                         UI / Scene
┌───────────┐ Profile  ┌──────────────────────────────┐ Frames  ┌──────────────────┐
│ src/      │────────▶ │ mask → LBM flow → larvae →   │───────▶ │ flow arrows,     │
│ geometry/ │          │ settlement → score → record  │ Record  │ larva trails,    │
└───────────┘          │        (src/sim/)            │───────▶ │ score, baselines │
                       └──────────────────────────────┘         └──────────────────┘
                                                                        │ Record
                                                                        ▼
                                                                 src/ai/critic.ts
                                                                 (explains only)
```

## Folder layout
```
src/
  contracts/      shared types (reviewed changes only)
  geometry/       Profile ops, presets, profileToMask, undo stack
  sim/            rng.ts, lbm.ts, fallbackFlow.ts, larvae.ts, score.ts,
                  worker.ts, mockWorker.ts
  experiment/     record builder, IndexedDB save/load, export JSON
  state/          store.ts (Zustand): UI state only, never sim internals
  ui/
    tokens.css    the design tokens (owned by stream C)
    components/   GlassPanel, AquaButton, Dock, ScoreReadout, ...
    layout/       AppShell + the 5 regions
    builder/      2D profile editor (owned by stream B)
  scene/          R3F: ReefBackdrop, FlowArrows, LarvaTrails, Extrusion
  ai/             critic.ts (Gemini), prompt templates
benchmark/        run.ts, preregistration.json (frozen), results.json
fixtures/         sample-record.json, presets.json
tests/            unit, regression (same seed gives same output)
```

## Rules for each boundary

| Boundary | Rule |
|---|---|
| UI ↔ Sim | `postMessage` with `WorkerRequest`/`WorkerResponse` only. Transfer typed arrays, don't copy them. |
| Sim internals | Pure functions plus the seeded RNG. No DOM, no React, no `Math.random`. |
| Scene ↔ Sim | The scene reads `SimFrame`s and never touches solver arrays. |
| State | The store holds the current profile, the last record, UI toggles and the run status. Solver state stays in the worker. |
| AI | Takes an `ExperimentRecord` and returns text. It cannot write to the store or to records. |

## Re-running on edit
ReefForge 2.0 uses explicit Build → Simulate → Results modes (D-021). Edits never run the worker automatically. `src/experiment/missions.ts` enforces surface and shaped-area budgets and evaluates mission outcomes separately from numerical settlement. `useRunner` sequences matched flat/design experiments for each declared mission condition, using the existing worker protocol. Cancellation invalidates a generation as well as cancelling the active worker run.

`MissionAttempt` wraps full `ExperimentRecord` objects; it does not modify their scores. Saved records can include the full paired mission bundle in IndexedDB. Record replay uses the saved configuration, not just its seed. Frames still bypass React, with a bounded playback queue whose display speed never changes computation.

Research dialogs retain the scientific benchmark, diagnostics, assumptions and record exports. See `REEFFORGE_2.md` for the game design and UI architecture.

## Performance budget
| Item | Budget |
|---|---|
| A full benchmark run (one seed) | ≤ 3 s on a laptop |
| Interactive re-run | first frame ≤ 300 ms, done ≤ 3 s |
| Render | 60 fps desktop, 30 fps mobile |
| Larvae drawn | ≤ 2,000 points, instanced |
| `backdrop-filter` panels on screen | ≤ 4 (see UI skill) |

## Stack
Vite, React 18, TypeScript (strict), React Three Fiber, drei, Zustand, Vitest, idb-keyval, and `@google/generative-ai` (optional). Adding any other dependency requires an entry in `DECISIONS.md`.
