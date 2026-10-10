# ReefForge — Real Simulation Plan

How the prototype flow (`shared/src/sim/prototype.ts`) gets replaced by a real, validated simulation: what it computes, which data drives it, how we prove it works, and where it runs.

Written 2026-10-10. Every value marked ✅ was downloaded or read from the source during the work; 🟡 is reachable but not yet verified; ❌ is not available.

---

## 1. What the real simulation is

Three stages, the same pipeline Levenstein et al. (2022) used, so we can check ourselves against them:

```
Design voxels ──► 1. FLOW           lattice-Boltzmann solver, oscillating or steady water over the tile
                 2. LARVAE          thousands of swimming ellipses carried and rotated by that flow
                 3. SETTLEMENT      a larva settles if it touches a surface while moving slowly enough
              ──► settlement fraction (with confidence interval), where they settled, flow metrics
```

1. **Flow.** Lattice-Boltzmann method (LBM): TRT collision (two-relaxation-time, stable at the low viscosities we need), bounce-back walls on every solid voxel, periodic sides (as in Levenstein's simulations), a free-slip top. Oscillating forcing for reefs like Kāneʻohe, steady for currents. The output is the velocity field at many phases of one oscillation period, stored once per design.
2. **Larvae.** Each larva is a neutrally buoyant ellipse (semi-axes 0.25 × 0.15 mm) that swims at 3 mm/s along its long axis. The flow carries it, and rotates it through vorticity and strain (Jeffery's equation, which is what Levenstein used). Velocities are interpolated from the stored flow, at a 0.01 s time step.
3. **Settlement.** Levenstein's rule: **a larva settles when it touches a surface while its total speed is below its swimming speed plus one standard deviation (3 + 1 = 4 mm/s).** Larvae leaving through the top are lost. The Baker et al. (2025) per-step settlement probabilities by surface type stay available as an optional second rule family, for surface "attractiveness" later.

**What it will not claim:** survival, growth, field recruitment, or the helix study's 80× result. A design's output is "simulated settlement under these conditions, model version X".

---

## 2. Data inventory (verified for this plan)

| What | Source | Status | Value / content | Used for |
|---|---|---|---|---|
| Validation geometry | Levenstein 2022, Fig S7 (supplement) | ✅ read from the figure | Trapezoid ridges: **2.5 mm tall, 2.0 mm top, 4.5 mm base, 5.0 mm flat trough** (7.5 mm top-to-top gap, 9.5 mm period) | Reference tile + validation domain |
| Validation domain | Levenstein 2022, Fig S8 | ✅ read from the figure | 2D cross-section **63.5 mm × 20 mm**, three ridges | Domain size, boundary conditions |
| Flow conditions | Levenstein 2022, methods | ✅ | **4.5 cm/s peak, 5.5 s period**, oscillating; no-slip floor, periodic sides, symmetric top; converged after 50 periods | Forcing |
| Larval model | Levenstein 2022, methods | ✅ | Ellipse 0.5 × 0.3 mm; swim **3 ± 1 mm/s** (Table S1, 10 species); Jeffery rotation; dt 0.01 s; **19,200 larvae** (30 positions × 32 orientations × 20 phases) | Larval stage |
| Settlement rule | Levenstein 2022, methods | ✅ | Settles on contact when total speed < swim speed + 1 SD (≈ 4 mm/s); exits through the top are lost | Settlement stage |
| Validation targets | Levenstein 2022, results | ✅ | Simulated settlement **7.6 % flat, 14.2 % ridged (2.5 mm), 7.4 % ridged (0.25 mm)**. Lab: ~10× on ridges, 67–74 % of settlers in crevices | Gate G1 |
| Alternative rule | Baker et al. 2025, code | ✅ read | Settlement chance per 0.1 s step: 0 / 0.01 / 0.05 / 0.09 by surface; random walk 5 cm/s | Optional surface attractiveness |
| Helix study | Reichert et al. 2025, *Biol. Conserv.*, DOI 10.1016/j.biocon.2025.111407 | 🟡 | Open access (**CC BY-NC 4.0**). Data repo promised at `github.com/JessiReichert/Mesoscale_complexity`, which **does not exist yet**. **Designs are under patent application PCT/US2024/051295.** Follow-up: *Ecological Engineering* 2026, DOI 10.1016/j.ecoleng.2026.107912 | Exploratory comparison only; no fabrication claims |
| Related open code | `github.com/JessiReichert/surface_geometry` | ✅ exists, MIT | R analysis for a related surface-geometry study (Nature Ecol. Evol., provisionally accepted) | Reference for settlement analysis |
| Heron Island currents | IMOS ANMN GBRHIS AWAC, 8.7 m | ✅ `pipeline/heron_currents.py` | 179.7 days, 25,865 good samples, **1.41 m above the bed**: speed p10 **8.0**, p50 **23.8**, p90 **45.0**, p99 **58.3** cm/s; mean drift 2.4 cm/s | Heron condition presets (after scaling, §4) |
| Kāneʻohe currents | Lowe et al. 2009 | ✅ (paper values) | Wave-driven reef-flat currents, typically **< 20 cm/s** | Range check for Kāneʻohe |
| Kāneʻohe model currents | PacIOOS ERDDAP | ❌ | Server unreachable twice today | Retry |
| Seawater viscosity | Standard (TEOS-10 / Sharqawy 2010) | ✅ | ≈ 0.9 × 10⁻⁶ m²/s at 27.5 °C, salinity 35 | Unit conversion |
| Solver benchmarks | Stokes' second problem (exact solution); Ghia et al. 1982 cavity tables | ✅ / 🟡 | Exact formula for an oscillating boundary layer; Ghia tables to transcribe | Gate G0 |

**Not available anywhere we looked:** a field dataset linking structure geometry, measured near-bed flow and settlement together. So validation stops at reproducing a published simulation plus its lab trend. That is stated wherever results appear.

---

## 3. Validation ladder (the go/no-go gates)

Each gate's settings are written to `docs/physics-validation.md` **before** the first run, and the gates are run in order. A failed gate stops the claims above it, not the game.

| Gate | Test | Pass |
|---|---|---|
| **G0 Solver** | (a) Stokes' second problem: oscillating flow over a flat floor vs the exact solution, at Levenstein's period. (b) Steady channel flow vs the parabola. (c) Lid-driven cavity at Re 100 vs Ghia's tables | L2 error < 2 % (a, b), < 3 % (c) |
| **G1 Replicate Levenstein** | 2D, exact Fig S7 ridges, 4.5 cm/s / 5.5 s, 0.1 mm grid; their larval model and settlement rule; 19,200 larvae. Run the periodic cell and their full 63.5 mm domain | Ridged > flat and 0.25 mm ≈ flat (non-overlapping 95 % CIs); ridged/flat ratio within 1.4–2.4 (theirs: 1.87) |
| **G2 Game resolution** | Repeat G1 at the game's 0.5 mm voxels (ridges become 5-voxel staircases) | Same ordering; ratio within ±25 % of the 0.1 mm result. Otherwise use a finer grid, or label game results "exploratory resolution" |
| **G3 2D = 3D** | Extrude the G1 geometry in the 3D solver | Within 5 % of the 2D settlement fraction |
| **G4 Seeds** | 5 seeds per design | Report mean ± 95 % CI. With 2,000 larvae at ~14 %, the CI is about ±1.5 points, so smaller differences are "no clear difference" |

If G1 fails, the engine ships as "exploratory model", with the failure and its likely cause written into the validation doc. It never gets quietly tuned until it passes.

---

## 4. Site conditions: from reef measurements to tile water

The tile is millimetres tall; instruments measure metres above the bed. Each reef's tile conditions carry their provenance.

- **Kāneʻohe Bay (published):** Levenstein's flume conditions, 4.5 cm/s peak, 5.5 s period. Their study was designed to match reef boundary-layer flow, and it sits inside Lowe et al.'s < 20 cm/s reef-flat range. This is the only fully published condition, so it is the default and the validation case.
- **Heron Island (model-derived, after a scaling step):** the measured speeds above are 1.41 m off the bed. Scaling to tile height needs a near-bed model:
  - Plan A: a log-law profile, u(z) = (u*/κ) ln(z/z₀), fitted to the 1.41 m speed. It needs a published roughness length z₀ for the Heron reef flat, which is **still to find**.
  - Plan B: measured flow attenuation inside coral canopies from the literature, **still to find**.

  Until one of these is sourced, Heron runs are labelled "model-derived" and shown at the p10 / p50 / p90 speeds with the z₀ range used. Tides cycle over hours, so at the tile they act as **steady** flow. The seconds-scale oscillation comes from **waves**, and Heron wave data is **still to find**.
- **Florida Keys, Maldives:** stay "coming next" until each has a sourced condition.

---

## 5. How the runs execute

### Benchmark (measured today: Apple M5 Max, plain JavaScript, one core)

| Grid | Cells | Throughput | Steps per run | One run |
|---|---|---|---|---|
| Validation, 2D periodic cell, 0.1 mm | 19,000 | 18.6 M updates/s | ~500,000 (10 periods) | **~8 min** |
| Validation, 2D full 63.5 mm domain | 127,000 | 18.6 M updates/s | ~500,000 | ~57 min |
| Game tile, 3D, 0.5 mm (96 × 48 × 48) | 221,000 | 5.9 M updates/s | ~30,000 (3 periods) | **~19 min** |

Estimates from those numbers (to confirm in step S3): an optimised CPU solver is 5–10× faster, and a GPU compute solver typically runs at 1–2 billion updates/s. That would bring the 3D game tile to **3–7 s** on a GPU.

### Architecture

| Where | What runs | Why |
|---|---|---|
| **Offline (Node, CPU reference solver)** | Gates G0–G4, reference tiles | Minutes are fine. The reference code is plain TypeScript in `shared/sim/`, easy to read and test |
| **Player's browser (WebGPU compute)** | The flow and larvae for the design being tested | Seconds instead of minutes. The prototype animation plays instantly while the real run finishes, then is replaced |
| **Sim worker (Node, same engine)** | The authoritative result for stored experiments and room rounds | The client is never trusted for scores. The worker runs on a machine with a GPU (the team laptop during the demo, a GPU host later). Render's free tier (0.1 CPU) cannot run 3D flow |
| **Tiger Data** | `sim_jobs` queue and a result cache keyed by hash(design voxels, conditions, model version, seed) | Every design is evaluated once; repeats are instant |

- **One engine:** the WebGPU kernels and the CPU reference implement the same algorithm, and a test checks they agree within tolerance on the reference tiles. GPU float rounding can shift a few larvae between runs, so stored results always come from the worker.
- **Rooms:** after lock-in, a short "evaluating" step while the worker runs every design (target under 60 s). Results then show the simulated settlement with confidence intervals; the arcade ranking is only the fallback.
- **Fallback:** without WebGPU or a worker, the game keeps the labelled prototype flow, exactly as today.

### Counts

Validation uses 19,200 larvae (Levenstein's protocol). Game runs use 2,000 larvae and 5 seeds for stored results; the screen shows a 500-larva subset.

---

## 6. Build order

| Step | Work | Gate | Estimate |
|---|---|---|---|
| S1 | `shared/sim/lbm2d.ts`: TRT solver, bounce-back, periodic, oscillating forcing; `physics-validation.md` with frozen parameters | G0 | ½ day |
| S2 | `shared/sim/larvae.ts`: Jeffery-orbit ellipses, Levenstein settlement rule; exact Fig S7 ridge geometry | G1 | 1 day |
| S3 | `lbm3d.ts` CPU reference + WebGPU kernels; agreement test; benchmark | G2, G3 | 1–2 days |
| S4 | Sim worker + `sim_jobs` + cache; Workshop shows prototype → real result; rooms "evaluating" phase; Research Mode shows model version, CI and validation status | G4 | 1 day |
| S5 | Heron conditions (z₀ / canopy source, wave data); reef presets with provenance | — | ½ day + finding sources |

Also: update the "2.5 mm ridges" reference tile to the exact trapezoid profile. At 0.5 mm voxels it becomes a 5-voxel-tall staircase with a 4-voxel top, a 9-voxel base and 10-voxel troughs.

---

## 7. Data still to find

1. Roughness length z₀, or canopy flow attenuation, for the Heron Island reef flat (needed for Heron's tile conditions).
2. Wave data near Heron Island (the oscillating component).
3. Kāneʻohe near-bed currents or waves (PacIOOS, when it answers).
4. The helix study's data repository (watch `JessiReichert/Mesoscale_complexity`); otherwise contact the authors.
5. The AIMS larval competency data (`open-AIMS/larval_settlement_competency`): inspect the files and the license.
6. Ghia et al. (1982) cavity tables, transcribed for G0(c).
7. Whether Node can run the WebGPU kernels on the worker machine (Dawn bindings), or the worker runs headless Chrome instead.

## 8. Risks

| Risk | Mitigation |
|---|---|
| G1 does not reproduce Levenstein (their flow solver and ours differ; some details unstated: release heights, the exact 2D/3D setup) | Run both of their domain choices; report the gap honestly; ship as "exploratory" |
| 0.5 mm voxels too coarse (G2) | Finer grid for the flow only (voxels stay 0.5 mm for building), or local refinement around the design |
| WebGPU unavailable on a player's device | Prototype flow, labelled; stored results still come from the worker |
| Worker capacity during the demo | Cache reference tiles and demo designs in advance; queue with an ETA |
| Patent on helix designs | No helix template that copies the patented design; comparisons only from published numbers |
