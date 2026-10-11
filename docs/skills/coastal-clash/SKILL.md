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
2. `git status -sb`. Work on a `<name>/...` branch made from `pratham/coastal-clash` (which carries `aum/coastal-clash`), never on `main` or on someone else's branch.
3. `node -v`. It must be 20.19+ or 22.12+, or the WebSocket test fails for reasons unrelated to your change.
4. `npm install` if `node_modules/` is missing. Run `npm run typecheck && npm test` once to get a baseline before you change anything.

## Invariants (do not break)

- **The engine decides.** Outcomes come only from `shared/src/game/engine.ts` (`buildBoard`, `resolveRound`, `finalResult`),
  run on the server in `server/src/rooms.ts`. The UI renders `RoomState`; it may call the shared engine for previews only.
- **The engine is deterministic.** No `Math.random`, `Date.now` or I/O in `shared/`. Ordering uses fixed persona and area orders.
  Every effect logs a `RuleEvent` with a rule id.
- **LLM output is narration and proposals only.** Gemini proposes (dialogue, twists, hint wording, explanations); validators in
  `shared/src/game/director.ts` accept, clamp or reject; only room functions apply. Twist effects come from `DIRECTOR_EVENTS`,
  never from the model. Every prompt carries `GROUNDED`; numbers not in the facts are rejected (`strayNumbers`). A template always
  shows first. The model sees `publicState(room, null)` only, so it never sees hidden picks or player names.
- **Replays never call Gemini.** Accepted twists are stored with exact values in `RoundRecord.director`; `replayMatch` must match.
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
| Playable area | `AREAS` in `pipeline/miami-beach.ts`, then `npm run data`; commit the generated JSON/GeoJSON; update `authoredScenario` spotlights and tests |
| Crisis | per match: kinds and K1 bonuses in `shared/src/game/scenario.ts` (`CRISIS_KIND_INFO`), lines in `living.ts` `CRISIS_LINES`, twists in `director.ts` `TWISTS_FOR`; the desk prompt in `server/src/ai/scenario.ts` |
| Player action | `room.ts` `ClientMsg`, an exported function in `rooms.ts` (throw `RoomError`), the `roomSocket.ts` switch, the `useRoom.ts` sender, the phase's UI on the map (`DistrictPopover`, `CaseFile`, `ResultOverlay`), `rooms.test.ts` |
| Phase UI | On the map, no side panel: `NewsTV` (the anchor's TV, always on; `CrisisBriefing` while the crisis lands) + `map/CrisisAlert` + `map/CrisisFx` (crisis), `HandDeck` (your hand: select and negotiate moves) + `DistrictPopover` (select), `CaseFile` (reveal, negotiate), `ResultOverlay` (resolve, final), pinned with `map/MapAnchor`; `insights.tsx` (Director/economy pieces); shell `app/src/routes/Play.tsx`; desktop only; look: `wet`, `frost`, `gel`, `lchip`, `Tube`/`Soap` in `ui.tsx` |
| Studio finding / export | `studioSummary`, `toCsv`, `toGeoJson` in `game/record.ts`; `server/src/studio.ts`; `app/src/routes/Studio.tsx` |
| DB | `server/src/db/schema.sql` (idempotent, `cc_` prefix), `db/tiger.ts`, `MemoryStore` in `db/store.ts` |
| AI Director | prompts `server/src/ai/director.ts`; validators/catalogue `shared/src/game/director.ts`; apply `rooms.ts` (`applyDialogue`, `proposeEvent`, `applyHints`); wiring `roomSocket.ts` `drain` |
| Avatars, bubbles, map fx | `shared/src/game/living.ts` (roles, reactions, template lines); `app/src/map/{LivingLayer.tsx,sprites.ts}`; CSS "Living city" in `styles.css` |

The contracts are `shared/src/room.ts`, the exported types in `engine.ts` and `record.ts`. Name any change to them in the commit message.

## Workflow

1. Find the code with the table above. Read the function you will change, all of it.
2. Write or extend the test first. Engine: `shared/src/game/engine.test.ts`, which builds a board from plays and resolves it.
   Rooms: `server/src/rooms.test.ts`, which drives the state machine with explicit `now` values.
3. Make the smallest change that matches the surrounding style. The code here uses short, explanatory comments and no abbreviations in user text.
4. Verify:
   - `npm run typecheck`
   - `npm test`
   - UI: run `npm run dev`, host a room, fill seats with bots, use the Demo pace and the host's skip button, and check at 1440×900 and 1280×720 (desktop only).
5. Update the docs when rules, areas, setup or rule ids change (`docs/coastal-clash.md`, `docs/contributing.md`, this skill).
6. Commit small on your branch. Do not push or merge unless asked.

## Gotchas

- Rooms are in server memory. `tsx watch` restarts on a server edit and drops every room, so re-host after you change server code.
- `publicState` hides the board during `select` and shows each player only their own `mine`. Never leak hidden selections.
- A round must resolve only once: `resolvedRound` guards it. Keep that guard if you touch phase transitions.
- Players who drop still count for `RECONNECT_GRACE_MS` (8 s). After that, phases stop waiting for them.
- Decks are 6 cards, hands are 4 per round (`HANDS`), and `checkPlay` needs the round. Engine tests name the four current areas.
- MapLibre positions markers with a `transform` on the marker element: never set `position` or animate `transform` on a marker's
  root element (animate a child). Breaking this stacks or teleports avatars and effects.
- Plain cards need no engine code (`attach` / `offer` / `delayed`); a card that only targets its own persona's projects is unplayable.
- Tests must never reach the network: give `buildServer` a `narrator`, a `director` (null or a fake) and a `scenario`
  (`{ live: async () => null, write: ... }`), and give `new Gemini` a fake `client`. Room tests call `applyScenario(room, authoredScenario(null), now)` after `start`.
- A match's crisis can be null for up to 10 s at the start (the scenario desk is writing): code that reads `room.crisis` / `state.crisis` must handle null.
- `RoundRecord.crisis` is a Crisis object on new records and a crisis id string on rules 1.x records.
- Every AI text a player reads goes through `checkSpoken` (shared/src/game/director.ts): number words and comma-grouped
  figures count as numbers, and unsafe words are matched with their forms. Do not bypass it with a raw string check.
- Ids from the wire are checked with own-property tests (`isCardId`, `isComboId`, `Object.hasOwn`): never `id in CARDS`.
- `pipeline/cache/` is git-ignored. `npm run data -- --refresh` hits live County and City services; use it sparingly.
