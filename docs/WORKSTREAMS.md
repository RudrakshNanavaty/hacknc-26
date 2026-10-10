# Workstreams and ownership

The team splits into four streams. Each stream owns its folders, and the streams meet only at the **contracts** in `src/contracts/`. With 3 people, merge streams C and D.

```
          ┌──────────────── src/contracts/ (shared, reviewed) ────────────────┐
          │  Profile · SimConfig · WorkerRequest/Response · ExperimentRecord  │
          └───────▲───────────────▲────────────────▲───────────────▲──────────┘
                  │               │                │               │
   A  Sim/Science │  B Geometry   │  C UI/Design   │  D Scene/AI   │
   src/sim/       │  src/geometry/│  src/ui/       │  src/scene/   │
   benchmark/     │  builder      │  layout, panels│  src/ai/      │
```

---

## A — Simulation & Science
**Owns:** `src/sim/`, `benchmark/`, `docs/SCIENCE.md`

| Deliverable | Hour |
|---|---|
| Seeded RNG, D2Q9 LBM solver, solid mask → flow field | 4 |
| Larva model (advection, swimming, cue-gated attachment) and scoring | 6 |
| **Calibration gate.** Freeze the parameters and commit `preregistration.json`. | 6 |
| Held-out recess run with 20+ seeds and a confidence interval, written to `benchmark/results.json` | 10 |
| Stability diagnostics in the response, plus a regression test | 12 |

**Fallback:** potential flow plus a wake heuristic (`src/sim/fallbackFlow.ts`), labeled `solver: "potential-fallback"`.

## B — Geometry & Builder
**Owns:** `src/geometry/`, `src/ui/builder/`

| Deliverable | Hour |
|---|---|
| `Profile` operations: add/remove segments, snapping, validity checks, undo/redo | 3 |
| Presets: flat, ridge, recess, step | 3 |
| `profileToMask(profile, grid)`, with unit tests | 4 |
| 2D builder canvas with the shape palette, mouse and keyboard | 10 |
| Debounced re-sim on edit (the worker cancels the old run) | 11 |

## C — UI & Design System
**Owns:** `src/ui/` (except `builder/`), `src/ui/tokens.css`, `.claude/skills/reefforge-ui/`

| Deliverable | Hour |
|---|---|
| App shell: the 5 layout regions, collapsible panels | 2 |
| Component kit: GlassPanel, AquaButton, Dock, ScoreReadout, BaselineBars, ChallengeBar | 8 |
| Results view against the fixture data | 8 |
| Onboarding overlay ("what am I looking at") | 16 |
| Mobile minimum layout (presets → run → results) | 18 |

## D — Scene, Visualization & AI
**Owns:** `src/scene/`, `src/ai/`, `docs/DEMO.md`

| Deliverable | Hour |
|---|---|
| R3F reef backdrop: water, caustics, light rays, bubbles | 8 |
| Flow arrows and larva trails from `WorkerResponse` frames | 10 |
| Decorative 3D extrusion of the profile | 12 |
| Gemini critic (`src/ai/critic.ts`) reading the `ExperimentRecord` | 18 |
| Demo script, backup video, pitch | 20–24 |

---

## Handoffs that matter

| From → To | What | When |
|---|---|---|
| A → C, D | Real `WorkerResponse` replaces the mock | H10 |
| B → A | `profileToMask` agreed and tested | H4 |
| A → C | Benchmark result for the results panel | H10 |
| C → D | Token and z-layer rules for scene overlays | H2 |

## When you finish early
Pick from the **stretch board** in `PROGRESS.md`, in this order: leaderboard, then the agent loop. Don't start your own side feature.
