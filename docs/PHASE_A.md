# Phase A — Review and specification

Written 2026-10-10, before any calibration run and before any recess run. Sources were checked against the papers (PMC, ScienceDirect, bioRxiv, Wiley), not abstracts alone.

---

## 1. Go / no-go

**Verdict: GO, with the claim narrowed.** The flat-vs-ridge calibration has a checked reference. Recess-vs-ridge has **no** direct empirical reference at our scale, so the held-out test checks the frozen model against a literature-motivated *hypothesis*. It does not validate the model against data. We say exactly that.

- The ridge reference is solid. Levenstein 2022 used 2.5 mm ridges spaced 7.5 mm apart in oscillatory flow (3–5 cm/s, 5–6 s), and ridges beat flat by >10× in the flume and 14.2% vs 7.6% in their own particle model.
- The recess reference is weak. Reichert 2025's recesses are **centimetre-scale** (1–4 cm deep, ~1.4 cm wide), in the field and 3D, with light and biofilm effects. Their own controls include no mm-scale ridge, so "recess > ridge" is never measured anywhere.
- Correction: the held-out recess is a **mm-scale square cavity** (2.5 × 2.5 mm) at the ridge pitch. Reichert is motivation for the direction only.
- Correction: ridge and recess have **identical exposed surface length** by construction (both add 2 × 2.5 mm of wall per feature). Raw settlement % is then free of the "more surface" confound for the benchmark comparison.
- Correction: the flow is **oscillatory and periodic in x**, a wave-driven boundary layer like the Levenstein flume. Steady through-flow would sweep larvae out of a 34 mm tile in under a second, and it would miss the mechanism the reference describes.
- Reynolds number is matched to the reference: Re ≈ 112 on the 2.5 mm feature height. The real flow was transitional and 3D (Re 3000–4400 on their length scale). Ours is laminar 2D, which is a known limitation.
- The pass rule (CI excludes zero) is easy to meet with 2,000 larvae × 30 seeds, because tiny differences become "significant". We keep the rule as written and also report the effect size and a minimum practical difference (§3).
- Biology is deliberately thin: swimming, rotational diffusion, and encounter-gated attachment in slow flow. Chemical cues and light are absent, as in the Levenstein flume, which had no CCA.
- What would change our mind: if the recess fails, it is reported as a FAIL, and the cause gets classified (§3.6). Parameters are not retuned.

## 2. Claims audit

| Claim | Status | Why |
|---|---|---|
| mm-scale ridges increase settlement vs flat (Levenstein 2022, PLOS ONE 17:e0274088) | ✅ verified | Flume: >10× settlement on ridged vs flat; "nearly zero" on flat in oscillatory flow (0.33 settlers/run). |
| Ridge geometry 2.5 mm tall, 7.5 mm edge-to-edge spacing | ✅ verified | Stated in the methods (spacing/height = 3). Ridge **width** not found → ❓ UNVERIFIED; we use 1.0 mm. |
| Flow 3–5 cm/s mean peak, 5–6 s period, oscillatory | ✅ verified | Their COMSOL model used 4.5 cm/s and 5.5 s; we use the same. |
| Re 3000–4400 "transitional" | ⚠️ conditions differ | Their length scale differs; on the 2.5 mm feature, Re ≈ 112. We simulate laminar 2D. |
| Larval swim speed 3 ± 1 mm/s | ✅ verified | Species-averaged value used in their particle model. |
| Settlement 14.2% (ridge) vs 7.6% (flat) | ⚠️ conditions differ | From *their simulation*, not the flume. Used only as the calibration ratio target (1.87). |
| Effect from flow recirculation and lower local speed, larvae then actively settle | ✅ verified | "recirculation … redirected larvae toward the substrate … decreased the local fluid speed". >87% settled between ridges, 90% within 1 mm of ridge bases. |
| No chemical cues present | ✅ verified | "absence of external biochemical settlement cues, such as CCA". |
| Helix recesses ~80× settlement, 20–50× survival (Reichert 2025, Biol. Conserv. 111407) | ⚠️ conditions differ | Field result, cm-scale 3D recesses, 1-year survival, light-dependent. **Motivation only**. |
| Recess settlement higher under flow (0 / 10 / 15 cm/s tank) | ⚠️ conditions differ | Higher flow than ours and 3D modules; supports the *direction* "flow + recess helps". |
| Baker et al. 2025 mechanistic model (Ecol. Model. 502:111037) | ✅ verified (structure only) | Settlement modelled as a per-time-step attachment probability over attractive substrate, on a 1 cm² grid. We borrow the *structure* (probabilistic attachment), not numbers. |
| Ramsby et al. 2026 seeding devices (Restor. Ecol. 34:e70206) | ✅ verified (context only) | Alumina devices with protective recesses (12 mm aperture); retention 62–89%, yield 24–60%. Device shape had minimal effect. Not a settlement-flow source. |
| Rotational diffusion 1 rad²/s | ❓ UNVERIFIED | Modelling assumption, stated in the record. |

## 3. Scientific test spec

### 3.1 Physical-scale mapping
| Quantity | Value |
|---|---|
| Cell size | 0.25 mm |
| Domain | 136 × 64 cells = 34 × 16 mm tile, periodic in x; floor 3 mm solid; free-slip lid at 16 mm |
| Flow | Oscillatory body force; free stream 4.5 cm/s peak, period 5.49 s (9,888 steps) |
| Lattice | u_peak = 0.1 (Ma ≈ 0.17), τ = 0.5268 (TRT, Λ = 3/16), dt = 0.556 ms |
| Reynolds | U·h/ν = 4.5 cm/s × 2.5 mm / 1e-6 m²/s ≈ 112 |
| Spin-up | 2 periods, then 48 snapshots over a 3rd period. Measured: 1-period spin-up differs by 2% |

### 3.2 Larval model
Point larvae are released uniformly in the top 5 mm with random headings. Each step: advect with the flow, swim 3 mm/s, heading random walk (D_r = 1 rad²/s). A step into solid is an **encounter**. It becomes **settlement** with probability `cueAttachProb`, and only if the local flow speed is below `attachMaxSpeedMmS`. Otherwise the larva turns away. Larvae are tracked for 3 periods (16.5 s). 2,000 larvae per run.

### 3.3 Scoring
- `settlementPct` = settled / released × 100. This is the benchmark metric.
- `normalizedScore` = settlementPct ÷ (exposed length / flat length), used for player designs, so adding wall area does not win by itself.
- Flat 34 mm; ridge = recess = 54 mm exposed length.

### 3.4 Calibration (flat vs ridge only)
- Calibrated parameters: `cueAttachProb` ∈ {0.05, 0.1, 0.2, 0.4} × `attachMaxSpeedMmS` ∈ {2, 5, 10, 20}. Everything else is fixed by §3.1–3.2.
- Calibration seeds 1001–1010, disjoint from the benchmark seeds.
- **Selection rule, fixed now:**
  1. ridge > flat, with the paired 95% CI excluding zero.
  2. Flat settlement between 1% and 50%.
  3. Among the survivors, pick the ratio ridge/flat closest in log space to **1.87**, the ratio from Levenstein's own particle model.
  4. Ties go to the lower `cueAttachProb`.
- If no combination passes 1–2, the H6 gate fails and the claim is rescoped. The full grid goes to `benchmark/calibration.json`.

### 3.5 Pre-registration and pass rule
- `benchmark/preregistration.json` contains the frozen params, `simVersion`, seeds 1–30, the geometry of all presets, and the prediction. It is committed before any recess run. `npm run benchmark` refuses to run the recess unless that file is committed and unmodified.
- **Prediction:** mean settlement(recess) > mean settlement(ridge).
- **Pass rule:** the paired per-seed difference (recess − ridge) has a 95% t-interval (df = 29) entirely above 0.
- Also reported, without gating: the effect size in percentage points, the ratio, and whether the difference exceeds 1 percentage point.

### 3.6 Interpreting a failure
| Cause | How we'd tell |
|---|---|
| Implementation bug | Engineering checks fail: drift, divergence, nondeterminism, or settlement outside the tile/surface |
| Model limitation | Larvae never enter the cavity (laminar 2D cavity vortex isolates it), or attachment is gated off by speed everywhere in it |
| Benchmark assumption | The hypothesis "recess > ridge at mm scale" is unsupported, since its source is cm-scale 3D |

## 4. Architecture decision record
| Decision | Choice | Rejected |
|---|---|---|
| App | Vite + React 18 + strict TS, npm | Next.js (no SSR need; D-008), Python backend (network failure point; D-005) |
| Solver | D2Q9 LBM, TRT collision, Guo forcing, halfway bounce-back, periodic x, free-slip lid | BGK (less stable near τ → 0.5), 3D voxel (D-002) |
| Fallback | Potential flow + wake heuristic, labelled "qualitative approximation". Built only if the LBM fails H6 | — |
| Execution | Pure generator pipeline (`src/sim/pipeline.ts`). The Web Worker drives it in time slices. Node drives it for the benchmark | Separate solver code paths for UI and benchmark |
| Performance | Flow cached per geometry. Measured 40 MLUPS: ~5 s per new geometry, ~2.4 s per seed | — |
| Rendering | 2D canvas for the authoritative sim view; R3F for the decorative backdrop and extrusion only | Drawing the sim in 3D (would imply 3D simulation) |
| Messages | `WorkerRequest` / `WorkerResponse` in `src/contracts/sim.ts` (v2) | — |

## 5. Risk register
| Risk | Sev | Prob | Early signal | Mitigation | Fallback |
|---|---|---|---|---|---|
| Circular validation | High | Med | Recess result consulted before freeze | Recess runner refuses until the pre-registration is committed; seeds disjoint | Report as invalid |
| LBM instability | High | Low | maxU > 0.35, NaN | TRT, Ma 0.17, measured stable on all presets | Lower Re (τ 0.55); potential fallback |
| Unjustified ranking | High | Med | "Recess wins" stated without CI | Pass rule + CI in UI | Show FAIL/PASS with CI |
| Oversimplified biology | Med | High | Judges ask about cues | Assumptions list shown and in the record | Answer from DEMO.md |
| 2D-vs-3D framing | Med | Med | "Helix" in UI copy | Copy rules; extrusion labelled decorative | — |
| Scoring confounds | Med | Med | Taller features always win | Equal exposed length for benchmark; normalized score for players | Material budget |
| Simulator exploits | Med | High | Weird geometry scores high | Height limits, release band headroom | Show as "exploit found" |
| Render performance | Med | Med | <30 fps with larvae | Canvas 2D, no React re-render per frame, ≤4 blur panels | Reduce larva draw count |
| Scope creep | High | Med | Stretch work before H16 | Gate order | Cut stretch |
| Pretty but nothing computes | High | Low | UI built on mock | Real worker wired first | — |
| Computes but confusing | Med | Med | 60-s cold test fails | Score label, baselines bar, badge | Onboarding overlay |

## 6. Task plan
| # | Task | Acceptance test | Gate |
|---|---|---|---|
| 1 | Contracts v2, presets, mask, exposed length | Unit tests pass | H1 ✅ |
| 2 | TRT LBM + flow cycle | Stable on all presets, drift < 1e-6 %, free stream within 2% of 4.5 cm/s | H4 ✅ |
| 3 | Larva model + scoring + pipeline | Same seed → identical record | H6 |
| 4 | Calibration grid + selection | `calibration.json` written by the rule | H6 |
| 5 | Pre-register + commit | File committed before any recess run | H6 |
| 6 | Held-out recess, 30 seeds | `results.json` with CI, PASS/FAIL | H10 |
| 7 | Worker + builder + UI wired to the real sim | Edit → re-run → score + baselines | H10–16 |
| 8 | Frutiger Aero shell, scene, extrusion, save/load | UI checklist at 1440×900 and 390×844 | H16 |
| 9 | Regression test, verification report, demo docs | `benchmark:regress` passes | H20 |
