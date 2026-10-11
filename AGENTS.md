# Coastal Clash: agent instructions

Several people and coding agents work in this repo during HackNC 2026. Follow this file.

## Read first
1. `AGENTS.md` (this file).
2. `docs/coastal-clash.md`: the product, the code audit, the architecture, the rules and the demo script.
3. `docs/contributing.md`: setup, the code map, recipes for common changes, the done checklist, troubleshooting.
   Agents: `docs/skills/coastal-clash/SKILL.md` is the same as a skill (copy it to `.claude/skills/` to load it in Claude Code).

## Architecture
```
pipeline/ miami-beach.ts: fetches the real Miami Beach GIS layers and measures the playable areas.
shared/   Pure TypeScript, no I/O. Personas, cards, districts (real data), the rules engine, narration
          templates, match records, Planning Studio aggregation, the room protocol.
app/      Vite + React + TypeScript strict, MapLibre, motion, zustand, Tailwind (tokens in styles.css).
server/   Node + TypeScript (Fastify + ws). Authoritative rooms, live NOAA/NWS conditions, Gemini scenario desk,
          narrator and Game Director (proposals only, validated in shared/), ElevenLabs, Tiger Data.
```

Contracts live in `shared/src`: `room.ts` (wire protocol), `game/engine.ts` (Board, Resolution), `game/record.ts`
(MatchRecord, the export formats). Change them deliberately and say so in your commit.

## Rules
1. **Outcomes come from the engine, never from the UI or an LLM.** `resolveRound` is deterministic and runs on
   the server; Gemini only narrates resolved facts and any line with a number not in the facts is dropped.
2. **Real geography, labelled game numbers.** Where a card may go comes from the real zoning and FEMA layers
   (`shared/src/data/districts.json`). Effect sizes are illustrative scenario values and budgets are hypothetical:
   say so wherever they are shown.
3. **Role-play is not public opinion.** Keep persona choices, personal preferences, demo sessions, bots and
   community sessions apart in records and in Planning Studio.
4. **Fail soft.** Every server integration has a fallback (memory store, template narration, no voice).
5. **No secrets in code.** Keys come from `.env` only (see `.env.example`).
6. **Verify before done.** `bun run typecheck` and `bun run test`. For UI, check it at 1440 px and 390 px wide.
7. **Commit small**, on your own `<name>/dev` branch.
