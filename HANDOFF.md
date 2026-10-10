# Handoff — ReefForge 2.0

The existing application has been upgraded in place. Start with `docs/REEFFORGE_2.md` for the critical audit, revised design, architecture and priority plan. Executed checks, screenshots and limitations are in `docs/REEFFORGE_2_VERIFICATION.md`.

## Start

```sh
npm install
npm run dev
npm test
npm run typecheck
npm run lint
npm run benchmark:regress
```

For the browser tests, install Chromium with `npx playwright install chromium`, serve the app at `http://127.0.0.1:5174` (or adjust `playwright.config.ts`), then run `npx playwright test`. Playwright is development-only. `.env.local` is gitignored; its secrets must not be printed or committed. Gameplay does not use Gemini.

## Current loop

Choose mission → Build → Run → Results → Improve. No automatic run on load or edit. First Settlement compares with an actual same-seed flat control. Current Clash repeats the same geometry under reference 4.5 cm/s and exploratory 3 cm/s waves, each with a matched control; both gains must reach 1 percentage point. No outcomes are hardcoded.

Construction constraints are final exposed surface ≤54 mm plus total added/excavated cross-sectional area ≤30 mm². They are fabrication proxies, not mass. The area limit closes a periodic whole-bed lift exploit. Presets, imports, edits and history use the same checks. Width, height, snapped position, drag preview, selection/delete, undo/redo and reset are available. Mobile uses presets.

Recent attempts are held in session state. Save persists the selected experiment and complete mission bundle (both conditions and controls) in IndexedDB. Library load recomputes mission completion from the saved records. Replay supplies the full saved configuration. JSON export remains an individual scientific record.

## Important boundaries

- `src/experiment/missions.ts`: mission configs, constraints and scoring, separate from numerical settlement.
- `src/ui/layout/useRunner.ts`: explicit sequencing, baseline caching and cancellation generations.
- `src/state/store.ts`: UI mode, bounded history and budget enforcement.
- `src/ui/layout/AppShell.tsx`: mode-specific interface, mission selection, results, Library and Research.
- `src/ui/builder/BuildControls.tsx`, `Stage.tsx`, `SimView.tsx`: interaction and visualization.
- `src/sim/`: unchanged solver arithmetic. Client adds explicit cancellation. Pipeline corrects the hardcoded condition description using its existing physical mapping.
- `src/experiment/storage.ts`: saved records may include a mission bundle; no shared numerical contract changed.

Animation renders a deterministic sample of at most 240 swimming larvae; all 2,000 still count. Animation speed affects only the bounded frame queue and may trail the computation. Final markers use actual x bins; marker heights are illustrative because the saved scientific record has no y attachment coordinate. No biological growth preview is implemented.

## Science

The frozen held-out benchmark remains **FAIL**: original recess 20.5% versus ridge 30.2%, −9.64 points with 95% CI [−10.03, −9.26]. Benchmark files, calibration, pass rule and numerical settlement scoring are untouched. Research retains the result. A mission win is independent and is not empirical validation.

The exploratory 3 cm/s configuration scales lattice and physical velocity together, preserving dt, viscosity, period and biology. It is not an additional held-out validation condition. Never retune `benchmark/preregistration.json`.

## Verification and remaining limits

The final suite passed 42 unit/engineering tests and all three real-worker browser scenarios, covering both missions, save/load/replay, cancellation and desktop/mobile layouts. Detailed results and screenshots are recorded in `docs/REEFFORGE_2_VERIFICATION.md`. No human cold-user study, real phone/projector test or 60 fps measurement was performed. The existing local leaderboard was preserved but not re-exercised end-to-end here. P2 remains deferred: AI suggestions, remote leaderboard, reef preview and elaborate 3D scenery.

No commit, merge, push or deployment was requested or performed. The pre-existing untracked `reefforge-opus-prompt.md` is the user's old prompt and was left intact.
