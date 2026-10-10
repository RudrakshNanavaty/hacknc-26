# PROGRESS

Update this file every time you merge. Add one line per change, newest first. Agents read it to avoid duplicate work.

## Gates
| Gate | Hour | Status | Notes |
|---|---|---|---|
| Contracts agreed | 0 | ✅ | v2 (D-011), solo self-review (D-007) |
| Calibration: flat vs ridge stable and frozen | 6 | ✅ | p = 0.2, v_max = 10 mm/s; flat 17.1%, ridge 30.4% (D-014); pre-registration commit `d8cf044` |
| Held-out recess result recorded | 10 | ☒ FAIL | recess 20.5% vs ridge 30.2%, Δ −9.6 pts, CI [−10.0, −9.3]; see docs/VERIFICATION.md |
| Real worker wired into the UI | 10 | ✅ | `src/sim/worker.ts` via `src/sim/client.ts`; mock behind `VITE_USE_MOCK_SIM=true` |
| Visual review | 16 | ◐ | Checked at 1291×565 desktop and in a 390 px-wide frame; 1920×1080 projector not yet checked |
| Feature freeze | 20 | ☐ | |

## In flight (who · branch · what)
| Who | Branch | Task |
|---|---|---|
| solo | build/phase-b | — |

## Done (newest first)
- Benchmark: held-out recess run → FAIL, reported with diagnosis in docs/VERIFICATION.md; regression snapshot written.
- Docs: SCIENCE.md modelling table and source statuses filled in; component catalog statuses updated.
- UI: Frutiger Aero shell (ChallengeBar, Shapes palette, SimView canvas, Metrics panel, Dock), onboarding, presets, save/compare/import/export of records, record view with re-run, benchmark view, decorative R3F backdrop + extrusion, mobile layout.
- Benchmark: calibration grid → frozen pre-registration → held-out runner that refuses to run unless the pre-registration is committed.
- Sim: TRT D2Q9 LBM (40 MLUPS), oscillatory flow cycle, larva model, scoring, generator pipeline shared by worker and benchmark.
- Geometry: profile ops, mask, exposed length, undo/redo, presets on a 136 × 64 tile.
- Phase A spec: `docs/PHASE_A.md`.

## Stretch board (only after H16, in this order)
1. "Beat the Recess" async leaderboard — not started
2. Gemini propose → simulate → revise loop (iteration-capped) — not started (critic itself also not built)

## Open risks
- Interactive run of a new geometry takes about 7 s, against the 3 s budget (D-013).
- The speed gate barely binds at the frozen value, so attachment is mostly a per-encounter probability (D-014).
- The recess hypothesis has no mm-scale empirical source (PHASE_A §1).
