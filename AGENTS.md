# ReefForge: agent instructions

Several people and coding agents work in this repo during HackNC 2026. Follow this file.

## Read first
1. `AGENTS.md` (this file).
2. `docs/reefforge-one-pager.md`: the product.
3. `docs/scientific-data-audit.md`: which data is real and verified, and the validation target.

## Architecture
```
shared/   Pure TypeScript, no I/O. Reef packs, Design, room protocol, reference tiles, engine.
app/      Vite + React + TypeScript strict, MapLibre, zustand, motion, Tailwind (tokens in styles.css).
server/   Node + TypeScript (Fastify + ws). Rooms, experiments, Tiger Data, NOAA, Gemini, ElevenLabs.
```

Contracts live in `shared/src`: `Design` (filled voxels on `BUILD_GRID`), `ExperimentResult`, `Reef`, `ClientMsg` / `ServerMsg`. Change them deliberately and say so in your commit.

## Rules
1. **Science comes from the engine, never from the UI or an LLM.** Scores are computed in `shared/` and re-run on the server. Gemini only puts stored numbers into words (`GROUNDED` in `server/src/ai/gemini.ts`).
2. **No made-up numbers.** Every environmental value carries a `Provenance`. If the engine cannot produce a value yet, show that, not a placeholder number.
3. **Fail soft.** Every server integration has a fallback (memory store, no voice, no AI). A failed API call must never break the game.
4. **No secrets in code.** Keys come from `.env` only (see `.env.example`).
5. **Verify before done.** Run `npm run typecheck` and `npm test`. For UI, check it in the browser at 1440 px and 390 px wide.
6. **Commit small**, on your own `<name>/dev` branch.
