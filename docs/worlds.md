# ReefForge worlds: what is measured, what is generated

The two explorable reefs are built from real surveys (`pipeline/README.md` has the exact commands). In the game, the **What’s real here** panel shows this same split for the reef you are on.

## Eastern Dry Rocks, Florida Keys

| Feature | Real or generated | Source |
|---|---|---|
| Seabed shape, every bump and spur | **Measured** | USGS SQUID-5 photogrammetry DEM, 1 cm, May 2021 (DOI 10.5066/P93RIIG9), public domain. Resampled to ~6 cm for the web (1025 × 1025 over 60 × 60 m) |
| Seabed colours | **Measured** | USGS SQUID-5 orthomosaic of the same survey, 5 mm, resampled to ~1.5 cm (4096 px) onto the same grid. The dark diagonal streaks and the colour band in one corner are seams and lighting changes between survey passes in the source imagery, left as they are |
| Depths and position | **Measured** | NAVD88 metres; NAD83(2011) / UTM 17N; window 414700–414760 E, 2705515–2705575 N |
| Gaps in the survey (0.5 % of the window) | Filled by interpolation, flagged | `measured.png`; devices cannot be placed there |
| Fish, sea fans, sponges, 3D corals | Generated artwork | Procedural models placed by rules on the real terrain |
| Water colour, fog, caustics, light rays, bubbles, sound | Generated artwork | |
| Tile water for the larvae test | Published, not site-measured | Levenstein et al. 2022 flume conditions, labelled as such |

## Heron Reef, Great Barrier Reef

| Feature | Real or generated | Source |
|---|---|---|
| Reef platform, crest and slope shape | **Measured** (30 m grid) | Geoscience Australia GBR 30 m depth model 2020 (Beaman), CC BY 4.0. 600 × 600 m window on Heron Reef's south-west edge (389470–390070 E, 7405670–7406270 N, UTM 56S), entirely on Heron Reef |
| Seabed colours | **Measured** (10 m) | Copernicus Sentinel-2 L2A true colour, 2025-08-04 (contains modified Copernicus Sentinel data 2025) |
| Deep-water seabed colour (below ~14 m, where the satellite sees no bottom) | Generated | Blended to a sand colour in the shader |
| Everything smaller than 30 m: bumps and ridges in the seabed, fine seabed texture, corals, seagrass, rocks | Generated artwork | Fine relief is added on top of the measured shape (seeded noise, stronger on the reef crest) and used for collisions too |
| Fish, water, light, sound | Generated artwork | |
| Measured currents (context only) | **Measured** | IMOS GBRHIS mooring, 1.41 m above the bed (`pipeline/heron_currents.py`) |
| Tile water for the larvae test | Published, not site-measured | Levenstein et al. 2022 flume conditions, labelled as such |

## Deployment checks

Placing a device checks: measured ground, slope ≤ 25°, unevenness under the 48 × 24 mm base ≤ 3 cm, and ≥ 30 cm from other devices. These are engineering and gameplay rules on the measured terrain, **not** predictions of where corals would settle or survive. On Heron Reef the measured grid (30 m) is far coarser than a device, so the checks are marked approximate.

## Not used

- No AIMS 3D reef models: publicly displayed models are not assumed to be downloadable or reusable.
- No other reef's scans are labelled as Heron Reef. The first candidate window (the Wistari Channel) was rejected because half of it was Wistari Reef.
