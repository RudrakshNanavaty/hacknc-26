# Verification report

**Conclusion:** the simulator is stable, deterministic and mass-conserving. It reproduces the calibration reference direction (ridge > flat). The **pre-registered held-out prediction failed**: the recess settled *fewer* larvae than the ridge. This is reported as-is, and no parameter was changed after the freeze.

## Benchmark (pre-registration commit `d8cf044`, 30 seeds, frozen parameters)
| Profile | Simulated settlement | 95% CI |
|---|---|---|
| Flat | 17.77% | [17.48, 18.06] |
| Ridge | 30.15% | [29.83, 30.47] |
| Recess | 20.51% | [20.18, 20.84] |

- **Prediction:** recess > ridge. **Result:** recess − ridge = **−9.64 pts, 95% CI [−10.03, −9.26] → FAIL**. The ratio is 0.68.
- Calibration replicated on the held-out seeds: ridge − flat = +12.38 pts, CI [11.93, 12.84].
- Recess still beats flat, by +2.7 pts. That was not pre-registered, so it is a post-hoc observation only.

### Diagnosis (PHASE_A §3.6), seed 1, `benchmark/diagnose-heldout.ts`
| | Ridge | Recess |
|---|---|---|
| Settlers on/in feature columns | 14% | 41% (cavities are 29% of the bed) |
| Settlers on the base within 1 mm of a feature | 52% | 20% |

- **Not an implementation bug.** Every engineering check below passes.
- **Model limitation.** The cavities *do* concentrate settlement. In 2D laminar flow at Re ≈ 112, though, a cavity flush with the bed traps only larvae already at the bed. A ridge protrudes into the oscillating flow and its recirculation steers larvae from the water column down to the bed, which matches the Levenstein mechanism.
- **Benchmark assumption doesn't hold.** "Recess > ridge" was borrowed from cm-scale 3D helix recesses in the field (Reichert 2025). Those results also include light and 1-year survival. No mm-scale 2D evidence supports it.
- We can say: *"Our frozen toy model reproduces the ridge effect and predicts that a mm-scale 2D cavity helps less than a ridge, contrary to our pre-registered hypothesis."*

## Engineering checks
| Check | Result | Evidence |
|---|---|---|
| Same seed, geometry and params → identical record | ✅ | `tests/sim.test.ts`; `npm run benchmark:regress` → OK (settled 635) |
| Solver does not diverge | ✅ | maxU 0.112–0.113 (lattice) on all presets; divergence guard at 0.35 |
| Mass conservation | ✅ | drift ≈ −3e-10 % over 29,664 steps |
| Boundary conditions sensible | ✅ | free stream 4.45–4.48 cm/s vs 4.5 target; zero velocity in solids; rest state stays at rest |
| Scores independent of frame rate | ✅ | test: results identical with and without frame emission |
| Plausible probabilities and counts | ✅ | 0 ≤ settled ≤ released; p = 0 → 0 settled; settlers lie on the tile |
| Unit tests | ✅ 20/20 | `npm test`; `npm run typecheck` and `npm run lint` clean |

## Approximations and unsupported claims
- 2D laminar LBM. The reference flow was transitional and 3D.
- Larvae are points. Rotational diffusion (1 rad²/s) and ridge width (1 mm) are ❓ UNVERIFIED.
- The attachment speed gate barely binds at the frozen 10 mm/s (D-014).
- No claim of real-world settlement, survival or restoration value.

## Known defects and limits
- A new geometry takes about 7 s to simulate in the browser, against the 3 s budget (D-013).
- UI checked at 1291×565 and in a 390 px frame. Not yet checked on a 1920×1080 projector or a real phone.
- The canvas is not keyboard-operable for building (mouse only, as scoped). Shortcuts select tools and run.

## Not built
- Gemini critic and agent loop (stretch). "Beat the Recess" leaderboard (stretch). BottomSheet: mobile uses a modal instead. Potential-flow fallback: not needed, since the LBM passed H6.
- Out of scope per D-001: multiplayer, auth, social, native apps, touch building, 3D CFD.
