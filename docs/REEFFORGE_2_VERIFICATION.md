# ReefForge 2.0 verification

## Executed checks

| Check | Result / evidence |
|---|---|
| Unit + engineering suite | `npm test -- --maxWorkers=1`: 42 tests across 9 files passed after both missions, area constraints and record-import validation were added |
| Mission outcome depends on computation | Actual frozen one-ridge run beats its actual flat control; flat fails; divergent and mismatched records rejected |
| Current Clash | Actual runs under 4.5 and 3 cm/s complete the two-condition challenge; missing conditions or changed geometry rejected; synthetic failed second outcome prevents completion |
| Frozen parameters | Tests compare reference config against committed preregistration; changing a returned config cannot mutate future configs |
| Scenario mapping | Only `peakVelocity` and `peakVelocityCmS` differ; physical dt, viscosity and all biological rules remain fixed |
| Reproducibility | Two complete same-geometry/seed/parameter records match; existing frame-independence tests pass |
| Budget | Both cost functions use final geometry; repeated stamps, refund, rejection, presets, invalid geometry, and whole-bed exploit covered |
| Undo/redo | Exact geometry round-trip, branch invalidation, edits disabled during simulation |
| Mission 1 browser | Desktop loop passed: canvas placement → undo/redo → real worker → 29.60% versus flat 18.80% → save → load → exact replay → preset → budget rejection |
| Current Clash browser | Both real conditions passed: 29.60% at 4.5 cm/s and 29.05% at 3 cm/s, each versus 18.80% flat; condition switching, save, page reload, paired restore and truthful assumptions passed |
| Browser suite | All 3 scenarios passed with normal motion; final compact-layout run also passed all 3 with reduced motion (1.4 minutes). No simulator mocks |
| Desktop bounds | Primary controls passed bounding-box checks at 1366×768, 1440×900, 1920×1080; page has no horizontal overflow |
| Mobile | 390×844 preset → cancel → run → mission results → improve passed; no horizontal overflow |
| Record imports | Equivalent grid objects round-trip; incompatible grids, malformed records and over-budget geometry are rejected |
| Existing frozen regression | Executed after the metadata correction: unchanged 635 settled, exact positions and diagnostics |
| Typecheck / lint | Final TypeScript compilation and ESLint checks passed |
| Contrast spot checks | Executed token-based script: primary text on darkest glass 5.35:1; secondary research text on white 4.84:1. Not a complete accessibility audit |
| Production build | Final `npm run build` passed, including TypeScript; main JS 215.92 kB, lazy decorative R3F chunk 818.19 kB uncompressed. The latter retains Vite's large-chunk warning |

Screenshots were refreshed by the final browser run. Build, simulation, both mission results and mobile results were visually reviewed. These checks establish working interactions and viewport fit, not measured human enjoyment or usability.

## Failures found and fixed

- The legacy toggle's decoration intercepted checkbox clicks. The actual input now covers the labelled control, with decorative layers ignoring pointer events.
- Save was outside the visible result panel at 1366×768. Primary results actions now live in the footer and passed viewport bounds checks.
- A surface-only budget allowed lifting the entire periodic bed with no wall cost. The additional visible 30 mm² shaped-area limit closes this geometry exploit.
- Alternate flow records inherited a hardcoded 4.5 cm/s assumption. Metadata now uses the computed physical mapping; numerical output is untouched.
- Saved-record replay previously restored only profile and seed. Replay now supplies the complete recorded configuration.
- An initial concurrent test run exceeded two existing five-second test limits while browsers were computing. The final full unit run used one worker without competing browser runs and passed all 42 tests. A storage fixture with an obsolete simulator version was corrected before this final run.

## Scientific status

The pre-registered held-out benchmark remains **FAIL**. Its original 30-seed results and pass rule are unchanged. A mission win is an explicitly labelled one-seed game threshold, not a confidence interval, empirical validation, or evidence of restoration performance. Current Clash's additional flow condition is exploratory and is not part of the frozen benchmark.

## Screenshots

Captured from the actual local application and worker:

- [Build, 1366 × 768](screenshots/build-1366.png)
- [Simulate, 1366 × 768](screenshots/simulate-1366.png)
- [First Settlement results](screenshots/results-1366.png)
- [Current Clash results](screenshots/current-clash.png)
- [Build, 1440 × 900](screenshots/build-1440.png) and [1920 × 1080](screenshots/build-1920.png)
- [Mobile build](screenshots/build-mobile.png) and [mobile results](screenshots/results-mobile.png)

## Known limitations

- No fresh human usability study was run. The first-time browser test is a scripted onboarding proxy, not proof that a new person completes the mission unaided.
- Browser tests use local Chromium; no real phone, Safari, or physical projector test. Mobile is preset-based and may scroll vertically.
- No measured 60 fps guarantee. UI controls respond during the worker run; rendering rate depends on hardware and WebGL.
- Animation speed changes a bounded sampled-frame queue, not simulation time or numerical parameters. A slow animation may trail computation; the final map always uses the completed record.
- Saved results provide horizontal settlement coordinates only. Final marker heights and halos are illustrative; no survival or mature coral growth is simulated.
- Recent attempts are session-only unless saved. Saved bundles live in this browser's IndexedDB; individual JSON exports contain one scientific record.
- P2 deferred: reef preview, cloud leaderboard, AI design suggestions and elaborate 3D scenery. Existing local research leaderboard remains accessible; its five-seed path was tested in the prior handoff, not re-exercised in this overhaul.
