---
name: coastal-clash
description: Work on the Coastal Clash codebase (HackNC 2026), a four-player coastal-planning card game on real Miami Beach GIS data. Use for any change to its rules engine, cards, crises, playable areas, room protocol, game UI, Planning Studio, data pipeline or server integrations (Gemini, ElevenLabs, Tiger Data), and for onboarding to the repo.
---

# Coastal Clash

A monorepo (npm workspaces): `shared/` (pure TS: content, engine, protocol, records), `server/` (Fastify + ws, authoritative
rooms), `app/` (Vite + React + MapLibre), `pipeline/` (real GIS -> data). Full guide: `docs/contributing.md`.
Product and rules: `docs/coastal-clash.md`. Hard rules: `AGENTS.md`.

## Start of every task

1. Read `AGENTS.md`. Read `docs/coastal-clash.md` §3-§4 if the task touches rules or geography.
2. `git status -sb`. Work on a `<name>/...` branch made from `aum/coastal-clash`, never on `main` or on someone else's branch.
3. `node -v`. It must be 20.19+ or 22.12+, or the WebSocket test fails for reasons unrelated to your change.
4. `npm install` if `node_modules/` is missing. Run `npm run typecheck && npm test` once to get a baseline before you change anything.

## Invariants (do not break)

- **The engine decides.** Outcomes come only from `shared/src/game/engine.ts` (`buildBoard`, `resolveRound`, `finalResult`),
  run on the server in `server/src/rooms.ts`. The UI renders `RoomState`; it may call the shared engine for previews only.
- **The engine is deterministic.** No `Math.random`, `Date.now` or I/O in `shared/`. Ordering uses fixed persona and area orders.
  Every effect logs a `RuleEvent` with a rule id.
- **LLM output is narration only.** Each Gemini call uses `GROUNDED` plus a `check` that rejects numbers not in the facts
  (`strayNumbers`). A template fallback always exists.
- **Real geography, labelled game numbers.** Constraints come from `shared/src/data/districts.json` (generated; never hand-edit).
  Effect sizes are illustrative and budgets hypothetical. Any number shown to users carries that label.
- **Keep data kinds apart:** in-role choices, personal preferences (`responses`), demo vs community sessions, and bot vs human.
- **Fail soft.** Missing keys, a slow API or a database outage must never break a match.
- **No side effects in `rooms.ts`.** Push an `Effect`; `roomSocket.ts` drains it.
- **No secrets.** Keys come only from `.env`.

## Where to change what

| Task | Files (in order) |
|---|---|
| Timings | `shared/src/config.ts` `PACES` |
| Card / cost / effect | `game/content.ts` `CARDS` (+ `rule` text), the `resolveRound` switch, `buildBoard` for compromises, `BOT_PREFS`, `engine.test.ts`; bump `RULES_VERSION` |
| Project kind | `ProjectKind`/`PROJECTS`, `projectEligibility`, `FEATURE_ICON` in `app/src/map/CityMap.tsx`, `finalResult` bonuses |
| Geography threshold | `GEO_RULES` in `game/districts.ts`; the table in `coastal-clash.md` §3 |
| Playable area | `AREAS` in `pipeline/miami-beach.ts`, then `npm run data`; commit the generated JSON/GeoJSON; update `CRISES` spotlights and tests |
| Crisis | `CRISES` in `content.ts` |
| Player action | `room.ts` `ClientMsg`, an exported function in `rooms.ts` (throw `RoomError`), the `roomSocket.ts` switch, the `useRoom.ts` sender, `panels.tsx`, `rooms.test.ts` |
| Phase UI | `app/src/game/panels.tsx`; shell `app/src/routes/Play.tsx` (breakpoint 1024 px) |
| Studio finding / export | `studioSummary`, `toCsv`, `toGeoJson` in `game/record.ts`; `server/src/studio.ts`; `app/src/routes/Studio.tsx` |
| DB | `server/src/db/schema.sql` (idempotent, `cc_` prefix), `db/tiger.ts`, `MemoryStore` in `db/store.ts` |

The contracts are `shared/src/room.ts`, the exported types in `engine.ts` and `record.ts`. Name any change to them in the commit message.

## Workflow

1. Find the code with the table above. Read the function you will change, all of it.
2. Write or extend the test first. Engine: `shared/src/game/engine.test.ts`, which builds a board from plays and resolves it.
   Rooms: `server/src/rooms.test.ts`, which drives the state machine with explicit `now` values.
3. Make the smallest change that matches the surrounding style. The code here uses short, explanatory comments and no abbreviations in user text.
4. Verify:
   - `npm run typecheck`
   - `npm test`
   - UI: run `npm run dev`, host a room, fill seats with bots, use the Demo pace and the host's skip button, and check at 1440 px and 390 px.
5. Update the docs when rules, areas, setup or rule ids change (`docs/coastal-clash.md`, `docs/contributing.md`, this skill).
6. Commit small on your branch. Do not push or merge unless asked.

## Gotchas

- Rooms are in server memory. `tsx watch` restarts on a server edit and drops every room, so re-host after you change server code.
- `publicState` hides the board during `select` and shows each player only their own `mine`. Never leak hidden selections.
- A round must resolve only once: `resolvedRound` guards it. Keep that guard if you touch phase transitions.
- Players who drop still count for `RECONNECT_GRACE_MS` (8 s). After that, phases stop waiting for them.
- A test asserts exactly three cards per persona, and engine tests name the four current areas.
- `pipeline/cache/` is git-ignored. `npm run data -- --refresh` hits live County and City services; use it sparingly.
