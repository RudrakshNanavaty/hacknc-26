---
name: coastal-clash
description: Work on the Coastal Clash codebase (HackNC 2026), a four-player coastal-planning card game on real Miami Beach GIS data and real civic stories. Use for any change to its rules engine, cards, crises and stories, playable areas, room protocol, map-board game UI, Civic Atlas, data pipeline or server integrations (Gemini, ElevenLabs, Tiger Data, Snowflake, Solana), and for onboarding to the repo.
---

# Coastal Clash

A Bun workspace monorepo: `shared/` (pure TS: content, engine, stories, protocol, records, atlas), `server/` (Fastify + ws,
authoritative rooms), `app/` (Vite + React + MapLibre, desktop only), `pipeline/` (real GIS and the civic-story corpus -> data).
Full guide: `docs/contributing.md`. Product and rules: `docs/coastal-clash.md`. Hard rules: `AGENTS.md`.
Where the branch stands: `docs/progress/map-board.md`.

## Start of every task

1. Read `AGENTS.md` and `docs/progress/map-board.md`. Read `docs/coastal-clash.md` §3 for geography and §5 for rules (§4 is live crises and stories).
2. `git status -sb`. Work on **`rdx/map-board`** in the `map-board/` folder. Never pull, merge or push another branch unless asked.
3. `bun --version` (1.4+) and `node -v` (20.19+ or 22.12+: the tests run on Node, and older 22.x crashes the WebSocket test).
4. `bun install` if `node_modules/` is missing. Run `bun run typecheck` and `bun run test` once for a baseline before you change anything.

## Invariants (do not break)

- **The engine decides.** Outcomes come only from `shared/src/game/engine.ts` (`buildBoard`, `resolveRound`, `finalResult`),
  run on the server in `server/src/rooms.ts`. The UI renders `RoomState`; it may call the shared engine for previews only.
- **The engine is deterministic.** No `Math.random`, `Date.now` or I/O in `shared/`. Ordering uses fixed persona and area orders.
  Every effect logs a `RuleEvent` with a rule id. (Story picking takes its seed from the server.)
- **LLM output is narration and proposals only.** Gemini proposes (dialogue, twists, hint wording, explanations, story headlines,
  casts, card pictures); validators in `shared/` accept, clamp or reject; only room functions apply. Twist effects come from
  `DIRECTOR_EVENTS`, never from the model. Every prompt carries `GROUNDED`; numbers not in the facts are rejected (`strayNumbers`).
  A template always shows first. The model sees `publicState(room, null)` only, so it never sees hidden picks or player names.
- **Real stories stay real.** Only `APPROVED_ISSUES` with a cast reach the game; `validateCast` (`shared/src/game/story.ts`) rejects
  invented people or numbers, cards outside a deck and hands with nothing buildable. A story's deal changes which cards are dealt
  and what they are called, never what a card does.
- **Replays never call Gemini.** Accepted twists are stored with exact values in `RoundRecord.director`; `replayMatch` must match.
- **Real geography, labelled game numbers.** Constraints come from `shared/src/data/districts.json` (generated; never hand-edit).
  Effect sizes are illustrative and budgets hypothetical. Any number shown to users carries that label.
- **Keep data kinds apart:** in-role choices, personal preferences (`responses`), demo vs community sessions, and bot vs human.
  Simulated matches are demo sessions and never go to a store with community sessions.
- **Fail soft.** Missing keys, a slow API, a database outage, no Snowflake or no Solana must never break a match.
- **No side effects in `rooms.ts`.** Push an `Effect`; `roomSocket.ts` drains it.
- **No secrets.** Keys come only from `.env`.

## Where to change what

| Task | Files (in order) |
|---|---|
| Turn flow | `server/src/rooms.ts` (`done`, `skip`, `maybeProceed`; turn by turn has no clock; Sprint: `setPace`, `deadline`, `SPRINT_MS` in `shared/src/room.ts`) |
| Beginner Mode | rules `shared/src/game/beginner.ts` (+ `beginner.test.ts`; version `BEGINNER_RULES_VERSION`; engine rules C5/O8; bot `AGENDA`); room `setMode` in `server/src/rooms.ts`; UI `app/src/game/Beginner.tsx`; plan `app/src/routes/Plan.tsx` |
| Plain wording | cards in plain words `shared/src/game/simple.ts` (+ `simple.test.ts`); the three round steps and one instruction `app/src/game/Steps.tsx`; move words `app/src/game/moves.ts`; result sentences and the storm `app/src/game/Climax.tsx` |
| Card / cost / effect | `game/content.ts` `CARDS` (+ `rule` text), the `resolveRound` switch, `buildBoard` for compromises, `BOT_PREFS`, `engine.test.ts`; bump `RULES_VERSION` |
| Project kind | `ProjectKind`/`PROJECTS`, `projectEligibility`, `FEATURE_ICON` in `app/src/map/CityMap.tsx`, `finalResult` bonuses |
| Geography threshold | `GEO_RULES` in `game/districts.ts`; the table in `coastal-clash.md` §3 |
| Playable area | `AREAS` in `pipeline/miami-beach.ts`, then `bun run data`; commit the generated JSON/GeoJSON; update `authoredScenario` spotlights and tests |
| Crisis kind | `CRISIS_KIND_INFO` (K1 bonus) in `shared/src/game/scenario.ts`, lines in `living.ts` `CRISIS_LINES`, twists in `director.ts` `TWISTS_FOR`, desk prompts in `server/src/ai/scenario.ts`, map effect in `app/src/map/CrisisFx.tsx` |
| Civic story | `pipeline/research/miami-beach-civic-corpus.json`, then `pipeline/snowflake-load.ts`, a human approves, `pipeline/cast-stories.ts`; game side `shared/src/game/story.ts`, `server/src/stories.ts`, `storyScenarioWriter` |
| Player action | `room.ts` `ClientMsg`, an exported function in `rooms.ts` (throw `RoomError`), the `roomSocket.ts` switch, the `useRoom.ts` sender, the phase's UI on the map, `rooms.test.ts` |
| Phase UI | On the map, no side panel: `NewsTV` (crawl + anchor card; `CrisisBriefing` while the crisis lands) + `map/CrisisAlert` + `map/CrisisFx` (crisis), `Steps` (the three round steps and the sprint clock, every phase), `HandDeck` + `DistrictPopover` (Advanced select) or `Beginner` (`ConflictCard`, `BeginnerHand`), `CaseFile` + `map/PingLayer` (reveal, negotiate), `Climax` (the storm) + `ResultOverlay` (resolve, final; `BeginnerFinal` in Beginner), `Turn.tsx` `ReadyBar`, pinned with `map/MapAnchor`; `insights.tsx`, `story.tsx`; shell `app/src/routes/Play.tsx`; look: `wet`, `frost`, `gel`, `lchip`, `Tube`/`Soap` in `ui.tsx` |
| Card picture | `server/src/cardArt.ts` (`HOUSE_STYLE`, queue, cache), `shared/src/cardArt.ts` (style version), `app/src/game/CardArt.tsx` |
| Characters | `app/public/characters/*.glb`, `app/src/characters/{render,portraits}.ts`; fallback sprites `app/src/map/sprites.ts`; `/glb-lab` |
| Voice | `server/src/voice.ts` (`POST /api/tts`, voices, cache); `app/src/ui/voice.ts` (one queue), `spoken.ts` |
| Civic Atlas | analytics `shared/src/game/atlas.ts`; routes `server/src/studio.ts` (`/api/atlas*`, `/api/studio*`); page `app/src/routes/Atlas.tsx` + `app/src/atlas/` |
| Records / export | `MatchRecord`, `replayMatch`, `studioSummary`, `toCsv`, `toGeoJson` in `game/record.ts` |
| Solana record | `shared/src/game/proof.ts` (fingerprint); `server/src/solana/` (chain, civic, routes, stores); page `app/src/routes/Verify.tsx` |
| DB | `server/src/db/schema.sql` (idempotent, `cc_` prefix), `db/tiger.ts`, `FileStore`/`MemoryStore` in `db/store.ts`, `db/{events,snapshots,derive,persist}.ts` |
| AI Director | prompts `server/src/ai/director.ts`; validators/catalogue `shared/src/game/director.ts`; apply `rooms.ts` (`applyDialogue`, `proposeEvent`, `applyHints`); wiring `roomSocket.ts` `drain` |
| Avatars, bubbles, map fx | `shared/src/game/living.ts` (roles, reactions, template lines); `app/src/map/LivingLayer.tsx`; CSS "Living city" in `styles.css` |

The contracts are `shared/src/room.ts`, the exported types in `engine.ts`, `record.ts` and `story.ts`. Name any change to them in the commit message.

## Workflow

1. Find the code with the table above. Read the function you will change, all of it.
2. Write or extend the test first. Engine: `shared/src/game/engine.test.ts`, which builds a board from plays and resolves it.
   Rooms: `server/src/rooms.test.ts`, which drives the state machine with explicit `now` values.
3. Make the smallest change that matches the surrounding style. The code here uses short, explanatory comments and no abbreviations in user text.
4. Verify:
   - `bun run typecheck`
   - `bun run test`
   - UI: `bun run dev`, host a room, fill seats with bots, click through each step (turn by turn has no clock and the host can move on without absent players; also try Sprint), and check at 1440×900 and 1280×720 (desktop only).
5. Update the docs when rules, areas, stories, setup or rule ids change (`docs/coastal-clash.md`, `docs/contributing.md`, this skill, `docs/progress/map-board.md`).
6. Commit small on `rdx/map-board`. Do not push or merge unless asked.

## Gotchas

- Rooms are in server memory. `tsx watch` restarts on a server edit and drops every room, so re-host after you change server code.
- `publicState` hides the board during `select` and shows each player only their own `mine`. Never leak hidden selections.
- A round must resolve only once: `resolvedRound` guards it. Keep that guard if you touch phase transitions.
- Players who drop still count for `RECONNECT_GRACE_MS` (8 s). After that, phases stop waiting for them.
- Decks are 6 cards and hands 4 per round. Use `dealtHand(persona, round, crisis)`: a story's deal wins over `HANDS`. Engine tests name the four current areas.
- Show card names with `cardName(id, crisis)`: a story may rename a card ("Plays as …").
- The Fisherman stays in `living.ts` and the cast schema (stored casts remain valid) but is not on the map, not a speaker and not in the story panel.
- MapLibre positions markers with a `transform` on the marker element: never set `position` or animate `transform` on a marker's
  root element (animate a child). Breaking this stacks or teleports avatars and effects.
- Plain cards need no engine code (`attach` / `offer` / `delayed`); a card that only targets its own persona's projects is unplayable.
- Tests must never reach the network: give `buildServer` a `narrator`, a `director` (null or a fake), a `scenario`
  (`{ live: async () => null, write: ... }`) and `civic` (null or a fake), and give `new Gemini` a fake `client`. Room tests call
  `applyScenario(room, authoredScenario(null), now)` after `start`. Card art and the story loader are off under `VITEST`.
- A match's crisis can be null for up to 10 s at the start (the scenario desk is writing): code that reads `room.crisis` / `state.crisis` must handle null.
- `RoundRecord.crisis` is a Crisis object on new records and a crisis id string on rules 1.x records.
- Every AI text a player reads goes through `checkSpoken` (shared/src/game/director.ts): number words and comma-grouped
  figures count as numbers, and unsafe words are matched with their forms. Do not bypass it with a raw string check.
- Ids from the wire are checked with own-property tests (`isCardId`, `isComboId`, `Object.hasOwn`): never `id in CARDS`.
- `pipeline/cache/` and `server/.cache/` (matches, stories, card art, voice clips, civic record) are git-ignored.
  `bun run data -- --refresh` hits live County and City services; use it sparingly.
