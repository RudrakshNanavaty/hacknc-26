# DECISIONS

Log every non-obvious choice. Use this format: **ID · decision · why · alternatives rejected · owner**.

---

**D-001 · Scope is the core loop only.** Cut real-time multiplayer, social/NFC, auth, native apps and mobile touch-building. *Why:* a 24h budget, and the judges see a laptop demo. *Rejected:* building "interfaces for the future" now. · team

**D-002 · The 2D profile is the authoritative geometry, and 3D is decoration.** *Why:* LBM runs in real time in 2D, and an honest 2D model beats a fake 3D one. *Rejected:* a 3D voxel builder with a cross-section slice. · team

**D-003 · Use a recess, not a helix, as the held-out geometry.** *Why:* a 2D slice can't represent a helix. *Rejected:* claiming to reproduce Reichert 2025. · A

**D-004 · Pre-register before running the held-out test.** *Why:* this prevents circular validation. · A

**D-005 · Simulation runs client-side in a Web Worker, with no Python backend.** *Why:* it removes a network failure point from the live demo. · team

**D-006 · Gemini is a critic only.** *Why:* scores must be deterministic and model-driven. · D

---
<!-- add new decisions below -->

**D-007 · Solo build: one person owns all four streams.** Stream folder boundaries are kept for code organization. Every review step (contracts, `benchmark/`, tokens) becomes a self-review against the written checklists, and the result gets logged in `PROGRESS.md`. *Why:* the team is one person. *Rejected:* rewriting the team-process docs, which stay valid if others join. · solo

**D-008 · The Next.js 16 / Tailwind / shadcn / bun scaffold was replaced with the stack in `docs/ARCHITECTURE.md`** (Vite, React 18, strict TS, npm). *Why:* the team docs are the source of truth, and a client-only sim app gets nothing from SSR. *Rejected:* keeping Next.js with a client-only page. · solo

**D-009 · `tsx` is a dev dependency.** It runs `benchmark/run.ts` headless under Node for `npm run benchmark` and `benchmark:regress`. *Why:* the benchmark has to run with no browser. *Rejected:* running the benchmark through Vitest, which mixes the scientific runs in with the unit tests. · solo

**D-010 · `eslint` + `typescript-eslint` + `eslint-plugin-react-hooks` are dev dependencies.** *Why:* `npm run lint` is part of the definition of done in `CLAUDE.md`. · solo

**D-011 · Contracts v2 (`CONTRACT_VERSION = 2`).** `SimParams` now carries oscillatory-flow and larval parameters in physical units. `SimFrame` adds its stage and the downsampled dimensions. `ExperimentRecord` adds `physical` (the scale mapping) and `results.settledX`. *Why:* the source check showed the reference effect comes from wave-driven oscillatory flow (Levenstein 2022), and the v1 shape could not record it. Self-reviewed under D-007. · solo

**D-012 · Oscillatory flow on a periodic tile, TRT collision, Re ≈ 112.** The geometry, physical mapping and calibration rule were fixed in `docs/PHASE_A.md` before any calibration run. *Why:* this matches the Levenstein 2022 flume mechanism. *Rejected:* steady inflow/outflow, which flushes larvae out of a 34 mm tile in under 1 s, and BGK. · solo

**D-013 · Performance budget deviation.** A new geometry takes about 5 s for the flow (40 MLUPS, 2 spin-up periods) plus about 2.4 s for larvae. That is over the 3 s budget in `ARCHITECTURE.md`. Flow is cached per geometry, so re-running a seed costs only the larva stage. *Why:* a 1-period spin-up differs by about 2% in the flow field, and the frozen benchmark config must match the interactive one. · solo

**D-014 · Calibration result (H6 gate passed).** The rule chose `cueAttachProb = 0.2` and `attachMaxSpeedMmS = 10`: flat 17.1%, ridge 30.4%, ratio 1.78 against the 1.87 target. Every grid point had ridge > flat. Observation: above 5 mm/s the speed gate barely changes results, so attachment probability carries the calibration. The full grid is in `benchmark/calibration.json`. · solo

**D-015 · Held-out result: FAIL, reported, and not retuned.** Recess 20.5% vs ridge 30.2% (Δ −9.6 pts, 95% CI [−10.0, −9.3]). Diagnosis: a model limitation plus a benchmark assumption that doesn't hold (`docs/VERIFICATION.md`). The UI shows `Benchmark: FAIL`. *Rejected:* changing the frozen parameters, the recess geometry or the metric after seeing the result. · solo

**D-016 · Gemini critic is client-side and gated on a key.** It calls `generateContent` with `gemini-3.8-flash` (overridable via `VITE_GEMINI_MODEL`), sends derived facts from the record, and asks for schema-bound JSON. Every number in the reply is checked against those facts, and unmatched numbers are flagged in the UI. With no key the card is hidden. *Why:* the demo must not depend on the AI, and the AI must never touch a score. *Caveat:* `VITE_` variables are bundled into the page, so the key is visible to anyone who can load it; use it on the local demo machine only. *Rejected:* `@google/generative-ai` (unneeded dependency) and a proxy server (no backend, per D-005). · solo

**D-017 · "Beat the Recess" leaderboard is local-only (IndexedDB).** Each entry is evaluated on seeds 201–205 (disjoint from calibration and benchmark) with the frozen parameters, in a separate worker. The ranking is by mean simulated settlement. Entries are only eligible within a 54 mm exposed-surface budget, the same as ridge and recess, and exact preset copies are rejected. "Beats" means the 95% CI is entirely above the baseline. *Why:* fairness without a backend, and adding wall area cannot win by itself. · solo (user chose local-only)

**D-018 · Worker scheduling: `MessageChannel` yields, IndexedDB flow cache, idle preset pre-warm.** Results stay bit-identical (`benchmark:regress` OK). *Finding:* the same LBM kernel ran about 3× slower in an unfocused Chrome tab than in Node (1,070 vs 345 ms per 2,000 steps), probably Windows efficiency mode for background tabs. This needs re-measuring with the tab focused on the demo laptop. · solo

**D-019 · Frontend follows Emil Kowalski's skills** (`emil-design-eng`, `review-animations`, `mobile-native`), as requested by the user. Tokens changed: `--ease-aero` is now a strong ease-out, durations are ≤ 280 ms, `--press-scale`/`--enter-scale`/`--enter-shift` were added, and reduced motion keeps fades. Toast and modal use `@starting-style` transitions instead of keyframes. Hover is gated on capable pointers. The mobile baseline adds `viewport-fit=cover`, safe areas, no tap highlight, `overscroll-behavior: none`, and 16 px inputs on touch. · solo

**D-020 · UI v2: refined Frutiger Aero, full redesign** (the user disliked the clutter, the rough sim view and the typography, and chose to keep the Aero identity). Guided by Emil Kowalski's `emil-design-eng` and `apple-design` skills.
- Layout: rail (tools + undo/redo) · stage card (name, conditions, legend, canvas, settlement strip, progress line) · Results (score → baselines → pre-registered test → AI → collapsible Run details).
- The dock went from 9 items to Run + 5. Record and Compare merged into Library. Reset is Presets → Flat.
- Sim view: speed-weighted sparse flow arrows, haloed larvae, a sand edge highlight, and the settlement histogram moved out of the sand into an aligned density strip.
- Tokens v2: layered shadows, a type scale with size-specific tracking, surfaces and hairlines, solid surfaces under reduced transparency.
- Backdrop: coral capsules removed and fewer bubbles.

*Rejected:* a modern-minimal or instrument look, which would override the prompt's identity. · solo (user-directed)
