# Coastal Clash: agent instructions

Several people and coding agents work in this repo during HackNC 2026. Follow this file.

## Read first
1. `AGENTS.md` (this file).
2. `docs/progress/map-board.md`: where this branch stands, what is verified, what is open. Read it before you change anything.
3. `docs/coastal-clash.md`: the product, the code audit, the architecture, the rules and the demo script.
4. `docs/contributing.md`: setup, the code map, recipes for common changes, the done checklist, troubleshooting.
   Agents: `docs/skills/coastal-clash/SKILL.md` is the same as a skill (copy it to `.claude/skills/` to load it in Claude Code).

## Where to work
- Branch **`rdx/map-board`**, checked out in the `map-board/` folder. Commit here.
- Do not pull from, merge into or push to any other branch (`main`, `pratham/*`, `aum/*`, `rdx/dev`, `rdx/ui-refresh`)
  unless the person you are working with asks for it in so many words.

## Architecture
```
pipeline/ miami-beach.ts + flood-by-area.ts: the real Miami Beach GIS layers and the playable areas.
          research/ + snowflake-load.ts + cast-stories.ts: the cited civic-story corpus, loaded into Snowflake
          and cast by Gemini offline.
shared/   Pure TypeScript, no I/O. Personas, cards, districts (real data), the rules engine, civic stories,
          narration templates, match records, Civic Atlas analytics, match fingerprints, the room protocol.
app/      Vite + React + TypeScript strict, MapLibre, three.js (character portraits), motion, zustand, Tailwind
          (tokens in styles.css). Desktop only: the map is the whole board.
server/   Fastify + ws. Authoritative rooms, live NOAA/NWS conditions, civic stories from Snowflake, Gemini scenario
          desk, narrator, Game Director (proposals only, validated in shared/) and card pictures, ElevenLabs voices,
          Tiger Data (with a local file copy), the Solana devnet civic record.
```

Contracts live in `shared/src`: `room.ts` (wire protocol), `game/engine.ts` (Board, Resolution), `game/record.ts`
(MatchRecord, the export formats), `game/story.ts` (CivicStory, StoryCast). Change them deliberately and say so in your commit.

## Rules
1. **Outcomes come from the engine, never from the UI or an LLM.** `resolveRound` is deterministic and runs on
   the server; Gemini only narrates resolved facts and any line with a number not in the facts is dropped.
2. **Real geography, labelled game numbers.** Where a card may go comes from the real zoning and FEMA layers
   (`shared/src/data/districts.json`). Effect sizes are illustrative scenario values and budgets are hypothetical:
   say so wherever they are shown.
3. **Role-play is not public opinion.** Keep persona choices, personal preferences, demo sessions, bots and
   community sessions apart in records and in Civic Atlas.
4. **Real stories stay real.** Only stories a human approved in Snowflake reach the game, every cast passes
   `validateCast`, and a story's sources are shown wherever the story is.
5. **Fail soft.** Every server integration has a fallback (local file store, template narration, no voice, no chain,
   no stories).
6. **No secrets in code.** Keys come from `.env` only (see `.env.example`).
7. **Verify before done.** `bun run typecheck` and `bun run test`. For UI, check it at 1440×900 and 1280×720: the game
   is desktop only (one laptop per player), so there is no phone layout to keep.
8. **Commit small**, on `rdx/map-board`.
