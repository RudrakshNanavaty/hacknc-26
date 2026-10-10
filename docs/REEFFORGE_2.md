# ReefForge 2.0: design and implementation

## Critical review before implementation

The existing app has a credible computational sandbox but little game structure.

1. **Why enjoy it?** Making a shape and discovering where larvae settle offers creative agency and surprising physical feedback. The current permanent dashboard obscures that pleasure.
2. **Meaningful decisions?** Feature type, position, width and height alter flow and surface encounters. Most of these choices currently lack explicit costs or goals.
3. **Can skill improve?** Yes: controlled geometry experiments can teach spacing and surface trade-offs. Automatic reruns and aggregate benchmark comparisons make cause and effect harder to isolate.
4. **Challenge diversity?** Low: one environment, no mission progression. Start with one baseline challenge, then test robustness across two environments.
5. **Surprises?** The held-out recess failure is itself evidence that this engine can contradict intuition. Let the spatial map reveal this without claiming a causal mechanism from final counts alone.
6. **What prevents spam?** Only the separate leaderboard has a surface limit. Apply a deterministic fabrication allowance to every build pathway.
7. **Feedback?** Numerically rich but emotionally flat: too many particles, too much permanent data, little distinction between running and reviewing.
8. **Does science differentiate play?** Yes: the same solver produces different geometry-dependent outcomes. Preserve it, and compare paired runs under identical conditions.
9. **Value of unsuccessful experiments?** Keep the attempt, show its delta and spatial distribution, and suggest a single controlled change. An unsuccessful attempt becomes a reference for the next one.
10. **Why retry?** A reachable objective, visible remaining gap, undoable edits, and an immediate comparison against the previous attempt.

### Five weaknesses and fixes

| Weakness | Concrete fix |
|---|---|
| No goal or commitment point | Mission objective and explicit Build → Simulate → Results state machine |
| Unbounded complexity | 54 mm fabricated surface allowance, charged from final authoritative geometry |
| Incomparable feedback | Compute flat and player records with identical seed, grid, parameters and version |
| Failure provides no direction | Observed trade-off, settlement map, previous attempt delta and one deterministic suggestion |
| Dashboard overwhelms environment | Conditional controls, compact results, research drawer, viewport-sized scene |

## Architecture audit

Vite / React 18 / TypeScript / Zustand. `geometry/profile.ts` stamps integer-cell profiles and absorbs slivers; immutable history supports undo/redo. `profileToMask` supplies the LBM worker. `pipeline.ts` computes flow, larval encounters and an `ExperimentRecord`. The worker and Node benchmark share this pipeline; canvas frames bypass React through subscribers. IndexedDB stores records and caches flow. R3F scenery and extrusion are decorative.

Working in source: four tools, drag height, presets, history, worker cancellation, progress, settlement density, reproducible records, import/export, local leaderboard. Browser verification must be recorded separately from source inspection. The Gemini live request remains unverified. The old “re-run record” used only geometry and seed rather than the complete saved configuration. The old canvas could retain frames from an earlier geometry. Automatic reruns undermined an explicit build phase. Modal focus was not trapped. The narrow layout allocated permanent space to results and a fixed rail.

Dependency map: profile edits → history → explicit mission runner → unchanged worker protocol → shared ExperimentRecord → mission evaluation + scientific record view + canvas. Mission metadata wraps records and never changes their numerical results. Scene rendering never writes geometry or scores.

## Game design

**First Settlement:** start on flat, fixed seed 1 and unchanged frozen flow/biology. Build within 54 mm of fabricated surface. Complete when computed settlement exceeds a same-seed flat run by at least 1 percentage point. This is a puzzle threshold, not scientific significance. A reference preset is available as a quick starting point; completion is never tied to a preset ID.

**Current Clash:** after the core loop passes, evaluate one geometry in the reference flow and a separately labelled gentler environmental scenario. Require at least +1 point over the matched flat in both. Use the minimum improvement, not the average, to prevent a strong result masking a weak one. Frozen benchmark configuration and calibration remain unchanged. Environmental variants are exploratory and must carry truthful assumptions and physical mappings.

**Budget:** substrate length plus absolute changes in surface height around the periodic tile, multiplied by cell size. Flat uses 34 mm; each isolated 2.5 mm tall/deep feature adds 5 mm. Both excavation and raised walls consume fabrication allowance. Also cap the total added/excavated cross-sectional area at 30 mm² (sum of absolute relief height × width × cell size squared). This closes the periodic whole-bed lift loophole, which otherwise costs no additional walls. Both limits are visible and deterministic. These are fabrication proxies, not physical mass. Adjacent stamps are charged by the final merged geometry. Flattening refunds both allowances. No edit, preset, import or redo can bypass them. Existing leaderboard retains its own published rules.

**Results:** raw simulated settlement, paired flat delta, allowance, settled larvae per fabricated mm, spatial density, observed trade-off, useful next step. One-seed puzzle outcomes are not validation. Research retains benchmark FAIL, assumptions, parameters, diagnostics and exportable records. No generated causal explanations enter the gameplay loop.

**Onboarding:** a small inline prompt progresses with actual edits, Run, and review: baby corals need a place to settle → place a ridge/shelter → test it → change one thing. No blocking slide deck.

**Visual honesty:** manageable deterministic sample of swimming larvae; all larvae still simulated. Settlement markers and horizontal density come from results. Saved records contain x coordinates only: the final map is a horizontal projection, not a claim of reconstructed attachment height. Decorative light and water are labelled scenery. No immediate mature coral growth.

## UI architecture

Build: mission header, large 2D scene, compact tools, budget, undo/redo/reset, shape dimensions and Run. Simulate: scene, progress, optional vectors and cancel; editing disabled. Results: scene with settlement map, compact score and feedback, improve/save/research. Navigation and controls remain in normal grid flow; no dock overlap. Mobile supports presets, runs, results and saved experiments, with scrolling where necessary.

## Smallest safe implementation plan

1. P0: independent mission/budget/evaluation module and tests; no solver changes.
2. P0: explicit runner sequencing paired baseline and design; cancellation and stale-result guards.
3. P0: enforce budget in state, validate geometry, preserve history; improve canvas previews and parameter controls.
4. P0: responsive three-mode shell, concise results and research/library access.
5. P0: execute unit tests, typecheck, lint, production build, frozen regression and real-worker browser loop; save screenshots.
6. P1 only after P0 verification: second environment, progressive onboarding and visual feedback.
7. P2 deferred: reef preview, asynchronous leaderboard, AI design suggestions, elaborate 3D scenery. Existing scientific/leaderboard functions remain accessible.

Future mission designs only: **Less Is More** (same outcome with a smaller surface allowance), **Shelter Distribution** (avoid concentrated settlement), **Uncertain Seas** (robustness across preregistered seeds). Each needs feasibility experiments before implementation.

## Verification

Implementation and executed checks are recorded in `docs/REEFFORGE_2_VERIFICATION.md`.

## Implemented architecture

`src/experiment/missions.ts` owns mission definitions, locked condition configs, both build constraints, paired comparisons and mission completion. `useRunner` sends sequential flat/design runs through the existing worker, caches each matched baseline for the session, and ignores cancelled generations. Zustand holds the explicit mode and immutable geometry history, plus up to 20 recent attempts. `MissionAttempt` wraps the unchanged shared `ExperimentRecord`; IndexedDB saves it alongside the selected record, including both conditions and controls. Loading a saved mission re-evaluates completion from its records. JSON exports remain individual scientific records; the Library retains the full mission bundle locally.

Mission 1 uses frozen parameters and seed 1. Mission 2 adds 3 cm/s as a declared forcing scenario by scaling both lattice and physical velocity, preserving dt, viscosity, period, and all biological parameters. Its minimum paired gain determines completion. The only numerical-pipeline edit corrects a metadata defect: a hardcoded flow-description string now describes the actual physical mapping. Solver arithmetic, geometry operations, contract version and benchmark files remain unchanged.

The canvas draws at most 240 swimming particles from a deterministic sample. All 2,000 contribute to results. The Animation control changes only sampled-frame playback; slow playback can trail computation and results appear as soon as computation finishes. Faster playback catches up to available frames. Final pink markers use x-coordinate bins, with a brief decorative glow and a smoothed horizontal density strip. Marker height/size is illustrative; no coral growth is predicted.

Research contains benchmark status, exact records, export, diagnostics and assumptions. Presets and saved records use dialogs with focus trapping. Undo/redo, width/height/position controls, keyboard placement, selection, deletion, drag-height preview and invalid-budget feedback use the same authoritative profile. Mobile supports presets and experiments; advanced touch building is intentionally absent.

## Deferred features

No P2 work was added: no reef-growth preview, remote leaderboard, AI suggestions or elaborate 3D scenery. The existing local research leaderboard remains accessible. Gemini is not part of the new results loop, so feedback cannot invent a causal explanation. Future mission designs above remain documentation only.
