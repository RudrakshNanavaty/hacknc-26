# Handoff — ReefForge

**State:** the core loop is done and verified (build → simulate → observe → compare → save), plus three stretch features (Gemini critic, local leaderboard, UI v2). The pre-registered benchmark **ran and FAILED** (reported honestly). Nothing is in flight. Branch `build/phase-b`; `main` is still the original scaffold commit.

## 60-second start
```bash
npm install
npm run dev            # http://localhost:5173
npm test               # 31 tests
npm run benchmark:regress
```
`.env.local` already exists (gitignored). It holds `VITE_USE_MOCK_SIM=false`, `VITE_GEMINI_API_KEY` (filled in by the owner) and `VITE_GEMINI_MODEL`. The app works with the key blank; the AI card just hides.

## The result to present
| Profile (30 pre-registered seeds) | Simulated settlement |
|---|---|
| Flat | 17.8% |
| Ridge (calibration) | 30.2% |
| Recess (held-out) | 20.5% |

The prediction was recess > ridge, and the result is **FAIL**: −9.6 pts, 95% CI [−10.0, −9.3]. Calibration replicated (ridge − flat = +12.4 pts). The diagnosis is a model limitation plus a benchmark assumption that doesn't hold. Details are in `docs/VERIFICATION.md`. **Never retune or edit `benchmark/preregistration.json`** (CLAUDE.md hard rule; `npm run benchmark -- freeze` refuses to overwrite it).

## Where things are
| Need | Go to |
|---|---|
| Rules for agents and the definition of done | `CLAUDE.md` |
| Science spec, sources checked, risks, ADR | `docs/PHASE_A.md`, `docs/SCIENCE.md` |
| What was verified, what wasn't, known defects | `docs/VERIFICATION.md` |
| Every non-obvious choice (D-001 … D-020) | `DECISIONS.md` |
| Demo script, setup, backup plan | `docs/DEMO.md` |
| UI rules, tokens, component catalog | `.claude/skills/reefforge-ui/` (load before any visual change) |
| Simulator | `src/sim/` (`lbm.ts`, `flow.ts`, `larvae.ts`, `pipeline.ts`, `worker.ts`) |
| Benchmark runner and frozen files | `benchmark/` (`run.ts`, `preregistration.json`, `results.json`, `regression.json`) |
| UI shell and regions | `src/ui/layout/AppShell.tsx`, `src/ui/builder/{Stage,SimView,ShapePalette}.tsx` |
| AI critic | `src/ai/critic.ts`, `src/ui/components/CriticCard/` |
| Leaderboard | `src/experiment/leaderboard.ts`, `src/ui/views/LeaderboardView.tsx` |

## Before the demo (open items, in priority order)
1. **Time a new-shape run on the demo laptop with the tab focused.** It takes about 7 s in Node. An unfocused Chrome tab measured about 3× slower (D-013, D-018). Pre-warm by opening Flat, Ridge and Recess from Presets before going on stage.
2. **Click "Explain this result" once** to confirm the Gemini key and model work live. Only the stubbed request path is tested. If it fails, blank the key and the card disappears.
3. **Check at 1920×1080 on the projector and on a real phone.** The mobile fixes (safe areas, tap delay, input zoom) are verified from code only.
4. Record the backup video following `docs/DEMO.md`.
5. Optional: merge `build/phase-b` into `main` (not done; nobody asked).

## Not built (by choice)
- Gemini propose → simulate → revise agent loop (stretch).
- `BottomSheet`: mobile uses dialogs instead.
- Potential-flow fallback: not needed, since the LBM passed the H6 gate.
- Out of scope per D-001: multiplayer, auth, social/NFC, native apps, touch building, 3D CFD. Don't add stubs for these.

## Gotchas
- `VITE_*` variables are bundled into the page, so the Gemini key is visible to anyone who can load it. Use it on the local demo machine only (D-016).
- The frozen simulator must stay bit-identical. Any change under `src/sim/` or `src/geometry/` needs `npm run benchmark:regress` to pass. A failing regress means the baselines no longer match the app.
- The leaderboard and saved designs live in this browser's IndexedDB. Clearing site data wipes them.
- Git warns about LF → CRLF on Windows. That's harmless.
