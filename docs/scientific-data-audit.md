# ReefForge — Scientific Data Feasibility Audit

Checked on 2026-10-10. Every status below comes from an actual request made during the check, not from search results.

✅ **Verified**: downloaded and inspected real values · 🟡 **Exists, not fully verified**: reachable but restricted, paywalled, unlicensed, or too large to pull in this check · ❌ **Not found / unavailable**

---

## Bottom line

**Feasible, but no single dataset says "this structure shape → this many larvae settle".** The data has to come in four layers, and we found real data for every layer:

| Layer | What the game uses it for | Best verified source |
|---|---|---|
| 1. **Site** (geography) | The real place a challenge is set: depth, seafloor, temperature | Kāneʻohe Bay, Oʻahu (NOAA elevation model ✅ + NOAA heat stress ✅). Heron Island, Great Barrier Reef (GBR) (current meters ✅) |
| 2. **Water movement at the site** (ocean physics) | Current speed and direction that drive the simulation | Heron Island current-meter records at 8.7 m depth ✅. eReefs model (GBR, daily) 🟡 |
| 3. **Flow around the structure** (tile-scale physics) | Our lattice-Boltzmann flow solver | Verified against standard textbook flow benchmarks + the Levenstein ridge flow conditions ✅ |
| 4. **Larvae** (biology) | Swimming speed, settlement rules, check against real results | Levenstein 2022 numbers + swim-speed table ✅. Baker 2025 parameters ✅ |

**The biggest finding:** **Levenstein et al. (2022)** is the only source with all of the following at once:
- the exact ridge shape, fully dimensioned
- the exact flow conditions
- a published simulation result
- a lab experiment result

That makes it our **validation target**. It also forces two changes to the plan:
1. **The solver must support oscillating flow.** Their experiment uses a back-and-forth current (4.5 cm/s peak, 5.5 s period), not a steady one.
2. **The build grid must work at millimetre scale.** Their ridges are 2.5 mm tall, so roughly 0.5–1 mm per voxel on the test tile, or a separate "zoom" level for the tile.

Reynolds number check (it tells you what kind of flow to expect): ridge height × flow speed / viscosity = 0.0025 m × 0.045 m/s / 0.9×10⁻⁶ m²/s ≈ **125**. That's laminar-to-transitional, well within what lattice-Boltzmann handles.

---

## 1. Site / geography

| Source | Status | What we got | Access | License | Use |
|---|---|---|---|---|---|
| **NCEI Oʻahu coastal elevation model**, 1/3 arc-sec (~10 m), `oahu_13_mhw_2011.nc` | ✅ | Pulled a Kāneʻohe Bay subset (lat 21.40–21.52, lon −157.86 to −157.74) as a **1.7 MB GeoTIFF** | WCS: `https://www.ngdc.noaa.gov/thredds/wcs/regional/oahu_13_mhw_2011.nc?service=WCS&version=1.0.0&request=GetCoverage&coverage=Band1&format=GeoTIFF&bbox=-157.86,21.40,-157.74,21.52` (full file 485 MB) | NOAA, public domain | Seafloor depth for the Kāneʻohe "level" (the helix study site) |
| **ETOPO 2022** via ERDDAP `etopo180` | ✅ | CSV subset works, but ~1.8 km cells, so **too coarse** for a reef | `coastwatch.pfeg.noaa.gov/erddap/griddap/etopo180.csv?...` | Public domain | Globe/overview map only |
| **Allen Coral Atlas** (geomorphic + benthic habitat maps) | 🟡 | Site is up. Download **needs a free account**. Also on Google Earth Engine as `ACA/reef_habitat/v2_0` | allencoralatlas.org | CC BY 4.0 (check each download) | Reef habitat zones (reef flat, slope, lagoon) for level layout |
| **NOAA Florida Keys topobathy lidar DEMs** (2016–17) | 🟡 | Exist, bulk S3 + Digital Coast viewer, high resolution | NOAA InPort items 48373, 48374, 49423, 51529 | Public domain | Optional Caribbean level |
| **UNEP-WCMC global coral reef distribution** | ❌ | `data.unep-wcmc.org` timed out | — | — | Not needed; the Allen Coral Atlas covers this |

## 2. Water movement at the site (ocean physics)

| Source | Status | What we got | Access | License | Use |
|---|---|---|---|---|---|
| **IMOS / AODN Queensland moorings: Heron Island South (GBRHIS)** | ✅ | **41 current-meter files** (ADCP and AWAC instruments). Opened one: eastward/northward velocity in **m/s**, 60 s samples, **8.7 m depth**, lat −23.51 lon 151.96, 2007–08 | OPeNDAP: `thredds.aodn.org.au/thredds/dodsC/IMOS/ANMN/QLD/GBRHIS/Velocity/<file>.nc` | IMOS: CC BY 4.0 | **Real near-reef current speed/direction distributions → challenge presets** ("Heron Island calm / tidal / storm") |
| Other Queensland moorings at the same server | ✅ listed | GBRHIN, GBROTE, GBRLSH (Lizard Island), GBRMYR (Myrmidon), GBRPPS, GBRELR, GBRCCH, … | same catalog | CC BY 4.0 | More sites |
| **eReefs GBR1** (1 km hydrodynamic model) | 🟡 | AIMS server is up. AIMS copy is **daily averages only**; hourly is on CSIRO's server. Near-real-time runs stopped Jan 2024 | `thredds.ereefs.aims.gov.au` → `gbr1_2-0` | CC BY | Regional current maps (nice visual, not needed for scoring) |
| **NOAA Coral Reef Watch** heat stress (5 km, daily) | ✅ | Pulled CSV for Kāneʻohe Bay (21.475, −157.825), Sept 2025 | `coastwatch.noaa.gov/erddap/griddap/noaacrwdhwDaily.csv?degree_heating_week[(START):1:(END)][(LAT)][(LON)]` (same server has sea-surface temperature) | Public domain | Site context ("this reef had X heat stress this year"), live data on the site card |
| **Kāneʻohe Bay currents 2005–07** (NCEI accession 0040251) | 🟡 | Catalog lists access as **non-public** | NCEI | — | Use the published numbers below instead |
| **Lowe et al. 2009** (J. Phys. Oceanogr. + J. Geophys. Res.), Kāneʻohe Bay | ✅ (paper values) | Reef-flat currents **typically < 20 cm/s**, wave-driven, rising with wave height | PDFs open (ifremer mirror) | Citation | Sanity range for Kāneʻohe current presets |
| **PacIOOS** (Hawaiʻi ocean models, Oʻahu ROMS, waves) | ❌ right now | Server returned 503 (maintenance) | `pae-paha.pacioos.hawaii.edu/erddap` | — | Retry later; would give Kāneʻohe currents/waves |
| **Wave buoy 51207 (Mokapu Point)** | ❌ | Realtime file returns 404 | NDBC / CDIP | — | Optional; skip |

## 3. Flow around the structure (tile scale) and solver verification

| Source | Status | Values | Use |
|---|---|---|---|
| **Levenstein 2022, flow setup** | ✅ | Oscillating flow; experiment **3–5 cm/s peak, 5–6 s period**; simulation **4.5 cm/s peak, 5.5 s period**; flume 10 × 10 cm cross-section, 36 cm test section; water 27.5 ± 1 °C; flume Re 3000–4400; their solver used no-slip at the bottom, periodic sides, symmetric top, 0.01 s time step, converged after 50 periods | The exact conditions our solver must reproduce |
| **Seawater properties** | ✅ (standard) | Kinematic viscosity ≈ 0.9×10⁻⁶ m²/s at 27.5 °C, salinity 35. Compute exactly with TEOS-10 (`gsw`) or Sharqawy et al. 2010 | Solver units conversion |
| **Standard flow benchmarks** for checking the solver itself | 🟡 (published tables, transcribe from the originals) | Ghia et al. 1982 lid-driven cavity centreline velocities. Armaly et al. 1983 backward-facing step reattachment length (≈ 5 step heights at Re 200). Schäfer & Turek 1996 cylinder drag (≈ 5.58 at Re 20, per a secondary source; check against the original) | Unit tests proving the solver is correct *before* we trust it on reefs. **The backward-facing step is directly relevant**: it's the same "eddy behind a ledge" that makes ridges work |

## 4. Larval biology and validation targets

| Source | Status | Values / content | License | Use |
|---|---|---|---|---|
| **Levenstein et al. 2022, PLOS ONE** | ✅ | Ridges **2.5 mm tall, 7.5 mm apart (spacing/height = 3)**, plus a 0.25 mm variant. Full dimensioned profile in Fig S7. **Simulation: 14.2% settle on ridged vs 7.6% flat vs 7.4% on 0.25 mm ridges.** Experiment: about 10× more settlers on ridged; flat oscillating-flow mean 0.33 settlers/run (n = 3); 67–74% of settlers in crevices. Species *D. labyrinthiformis* (~300 µm), *C. natans*. 750–1000 larvae per run, 50–70 per litre. Raw counts are only shown as a bar chart (Fig S1), not a table | CC BY 4.0 | **Primary validation target.** Pass condition: our model reproduces ridged > flat and ridged ≈ 2× flat in the simulation, under the same conditions |
| **Levenstein Table S1** (larval swimming speeds, from Hata et al. 2017) | ✅ | 10 species, horizontal/up/down speeds 1.57–4.79 mm/s; **mean 2.98 ± 0.96 mm/s** | CC BY 4.0 | Larval swimming term in our larvae model |
| **Baker et al. 2025** (Ecological Modelling) code | ✅ read / 🟡 not run | 500 larvae, time step 0.1 s, 3000 steps, flow 10 cm/s, random motion 5 cm/s, settlement chance per step 0 / 0.01 / 0.05 / 0.09 by surface; 4 current types (steady, oscillating, eddy, still). **R isn't installed here**, so we haven't run it. **No license**, so cite the paper and re-implement | none (cite) | Larval settlement rules + a cross-check (our engine set to Baker's settings should give Baker-like patterns) |
| **AIMS larval competency data** (25 Indo-Pacific species), `open-AIMS/larval_settlement_competency` | 🟡 | Repo is up with a `data/primary` folder. Data files not yet inspected. License not specified | ask/cite | How long larvae need before they *can* settle (competency window) → "larvae age" challenge setting |
| **Indo-Pacific coral spawning database** (Baird et al. 2021, Sci Data) | 🟡 | 6,178 records, 300+ species, 101 sites. On figshare (DOI prefix 10.6084/m9.figshare.13100552…), not downloaded | CC BY 4.0 | Flavour: "spawning season at this site" |
| **Coral Trait Database** | 🟡 | Site is up, data download path not confirmed | CC BY | Optional species traits |
| **Helix recesses study** (Reichert et al., Biological Conservation 2025) | 🟡 | Journal page **403 (paywall)**. Preprint `10.1101/2024.11.14.623685` exists, but bioRxiv rate-limited us, so **data statement and 3D files are unconfirmed**. Press release: ~80× settlement, up to 50× survival vs flat, 7 ceramic modules, Kāneʻohe Bay. **Two newer preprints**: "Cylindrical, pylon-like structures with helix recesses…" (`10.1101/2025.10.06.680805`) and "Coral settlement module designs for scalable reef restoration" (`10.64898/2026.06.24.733534`) | check | Second validation target **only if** the geometry is published. Otherwise approximate the shape from the paper's figures and label it "approximate" |
| **"Ramsby et al. 2026, Restoration Ecology"** (cited in one-pager) | ❌ | **Couldn't find this paper.** Check the citation before it goes on a slide. Related real sources: AIMS fish-exclusion seeding device dataset (data.gov.au `c37de7bf-…`), Montalvo-Proano et al. 2025 Frontiers (ceramic device coatings, spat survival 68% vs 59% at 46 weeks) | — | Replace the citation in `one-pager.md` |

---

## What this means for the build

1. **Game levels = real sites.** Start with **Kāneʻohe Bay** (real seafloor depth + heat stress, and it's where the helix study was done) and **Heron Island** (real current-meter data). Each level's current presets come from the real velocity distribution (median / 90th percentile), not made-up numbers.
2. **Two zoom levels.**
   - **Reef view**: real seafloor from elevation data, where you choose where to place the tile.
   - **Tile view**: mm-scale voxel build, where the flow solver runs. The site's current speed sets the flow conditions for the tile.
3. **The solver must support oscillating flow** (Levenstein: 4.5 cm/s, 5.5 s period) and steady flow. Add the cavity / backward-step tests as unit tests.
4. **Validation gate, concrete version:** build Levenstein's flat and 2.5 mm ridge tiles, run under their conditions with 10 seeds, and compare against their **14.2% vs 7.6%**. Settings are fixed in `physics-validation.md` before the run.
5. **Remove or fix the unverified "Ramsby 2026" citation** in the one-pager.

## Still to do

| Task | Effort |
|---|---|
| Pull one Heron Island velocity file and compute speed percentiles for challenge presets (Python + `xarray`) | 30 min |
| Turn the Kāneʻohe GeoTIFF into a heightmap for the reef view | 30 min |
| Transcribe the Fig S7 ridge profile into reference tile JSON | 20 min |
| Retry the bioRxiv helix data statement; check for STL / geometry | 15 min |
| Inspect the AIMS competency `data/primary` files and license | 15 min |
| Install R and run Baker's model once to get reference outputs (optional) | 45 min |
| Retry PacIOOS for Kāneʻohe currents/waves | 10 min |
| Transcribe the Ghia / Armaly benchmark values from the original papers | 30 min |
