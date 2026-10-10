# CLAUDE.md — context for AI coding agents

Read this file before making any change. Several people and several agents edit this repo at the same time, so these rules keep the work from colliding.

## What this project is
ReefForge is a browser sandbox. A player edits a 2D seabed profile, a lattice-Boltzmann (LBM) flow solver runs in a Web Worker, and simulated coral larvae settle on the profile. The project's single claim and its benchmark protocol are in `docs/SCIENCE.md`.

## Before you change anything
1. Check `docs/WORKSTREAMS.md` and find which workstream owns the folder you're touching. Stay inside that folder unless the task says otherwise.
2. If your change touches a type in `src/contracts/`, follow the contract-change process in `docs/CONTRACTS.md`. **Never change a contract silently.**
3. For **any** visual change, load the `reefforge-ui` skill (`.claude/skills/reefforge-ui/SKILL.md`) first and follow it.
4. Read `PROGRESS.md` to see what's in flight, so you don't duplicate work.

## Hard rules
- **Never edit `benchmark/preregistration.json`** after it is committed. Never tune simulation parameters to change the benchmark result.
- **Never special-case** the flat, ridge or recess presets in simulation or scoring code.
- **The 2D profile is the authoritative geometry.** The 3D extrusion is decoration and is never what gets simulated.
- **Gemini explains results. It never computes them.** No AI output may affect a score.
- **Rendering never mutates simulation state.** The UI sends `WorkerRequest`s and receives `WorkerResponse`s, nothing else.
- **Simulation code must be deterministic.** Use the seeded RNG from `src/sim/rng.ts`. Don't use `Math.random()` anywhere under `src/sim/`.
- **No new dependencies** without a `DECISIONS.md` entry.
- Out-of-scope features (see `README.md`) get no code, no stubs and no TODOs.

## Definition of done
- `npm test` passes, and `npm run typecheck` is clean.
- If you touched `src/sim/` or `src/geometry/`: `npm run benchmark:regress` passes. This checks that the same seed still produces the same output.
- If you touched UI: you've run the `reefforge-ui` review checklist and looked at the result at 1440×900 and at 390×844.
- `PROGRESS.md` is updated with one line describing the change. Add a `DECISIONS.md` entry if you made a non-obvious choice.
- Claim a feature works only after you have actually run it.

## Commands
```bash
npm run dev | test | typecheck | lint | benchmark | benchmark:regress
```
