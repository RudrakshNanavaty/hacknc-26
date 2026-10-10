# Science and benchmark protocol

**Owner:** Stream A. Everyone should read the sections on the claim and what we can say.

## The claim
> Shape changes flow, and flow changes where larvae settle. A simulator frozen after calibrating on flat vs. ridge makes a **pre-registered** prediction about a held-out recess. We report whether that prediction holds.

A failed prediction that we report honestly is an acceptable outcome. A ranking forced by tuning is not.

## Sources (background)
| Source | What we use it for | Status |
|---|---|---|
| Levenstein et al. 2022, PLOS ONE | Ridge vs. flat direction; mm-scale recirculation mechanism | ✅ verified (ridge width ❓) |
| Reichert et al. 2025, Biol. Conservation | Motivation only (3D helix, which can't be modeled in 2D) | ⚠️ conditions differ (cm-scale, field, 3D) |
| Baker et al. 2025, Ecol. Modelling 502 | Structure of the mechanistic settlement model | ✅ verified (structure only) |
| Ramsby et al. 2026, Restoration Ecology | Context on seeding devices | ✅ verified (context only) |

Mark each source ✅ verified, ⚠️ conditions differ, or ❓ unverified **before** using it in the UI or the pitch.

## Modeling decisions (fill these in at H1–H6)
| Decision | Value | Justification |
|---|---|---|
| Physical size of one cell | 0.25 mm | 10 cells per 2.5 mm ridge height (Levenstein 2022) |
| Domain represents | 34 mm × 16 mm tile, periodic in x | 4 ridge pitches of 8.5 mm; floor 3 mm, free-slip lid |
| Target Reynolds number | ≈ 112 | matched to 4.5 cm/s peak over 2.5 mm features in seawater (ν = 1e-6 m²/s) |
| Solver | LBM D2Q9, TRT (Λ = 3/16), Guo forcing | stable at τ = 0.5268, mass drift ~3e-10 % (`benchmark/probe.ts`) |
| Boundary conditions | oscillatory body force (5.49 s period), periodic x, lid free-slip, walls: halfway bounce-back | wave-driven boundary layer as in the flume |
| Larval behavior rules | advection + 3 mm/s swim + rotational diffusion + encounter-gated attachment in slow flow | details in `docs/PHASE_A.md` §3.2 |
| Score normalization | raw % for benchmark (ridge and recess have equal exposed length); per exposed length for player designs | `normalizedScore` |

## Protocol
1. **Calibrate** on flat vs. ridge only.
2. **Freeze** the parameters. Commit `benchmark/preregistration.json`, which contains the parameters, `simVersion`, the seed list, and the predicted recess outcome.
3. **Run the held-out recess** on 20 or more seeds, without retuning anything.
4. **Pass rule:** recess beats ridge in the predicted direction, **and** the 95% confidence interval of (recess − ridge) excludes zero.
5. **Report** the result to `benchmark/results.json` and the UI, whether it passes or fails.
6. **If it fails,** diagnose the cause as one of three: implementation bug, model limitation, or a benchmark assumption that doesn't hold. Never retune to make it pass.

## What we can and cannot say
| ✅ We can say | ❌ We cannot say |
|---|---|
| "Simulated settlement" | "This design will grow more coral" |
| "Our toy model reproduces the published direction" | "Validated" / "proven" |
| "Inspired by helix research" | "We reproduced the helix result" |
| "Candidate geometry worth testing" | "Restoration-ready design" |

## Known limitations (show these in the UI's assumptions list)
- The model is a 2D cross-section, while real structures are 3D.
- Larval behavior is reduced to simple rules. Real chemical cues are not modeled.
- The model covers settlement only. It doesn't model post-settlement survival, predation, or growth.
- Only one flow condition is tested per run.
