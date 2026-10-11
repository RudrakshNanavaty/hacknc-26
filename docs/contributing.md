# Coastal Clash: developer guide

How to set up, find your way around, make the common changes, and verify them. Read this after
[`AGENTS.md`](../AGENTS.md) (the rules) and [`coastal-clash.md`](coastal-clash.md) (the product, the game rules and the demo).
Coding agents: the same material, as a checklist, is in [`skills/coastal-clash/SKILL.md`](skills/coastal-clash/SKILL.md).

## 1. Setup

| Need | Notes |
|---|---|
| Node **20.19+ or 22.12+** | Older 22.x (e.g. 22.11) typechecks fine but the WebSocket match test crashes with `require() of ES Module …/cookie/dist/index.js`: Fastify's test helper `require`s an ESM-only package, which needs a Node with `require(esm)` on by default. `node -v` first. |
| npm 10+ | npm workspaces: `shared`, `app`, `server`. One `npm install` at the root. |
| `.env` (optional) | `cp .env.example .env`. Every key is optional; without them the game uses template narration, no voice and an in-memory store. |

```bash
npm install
npm run dev         # app http://localhost:5173 (Vite), server http://localhost:8787 (Fastify)
npm run typecheck   # all three workspaces
npm test            # vitest: shared engine tests + server room tests (incl. a 4-client WebSocket match)
```

Windows: the commands work in Git Bash and PowerShell. If `npm install` rewrites `package-lock.json`, commit that on its own.

**Playing it locally alone.** Open `http://localhost:5173`, host a room, and as host fill the empty seats with bots in the lobby.
There is no clock; with bots filling the other seats, click through each step, and the host's "Move on without them" button skips a player who is away. To test real multiplayer, open the room in other browser profiles,
or on other laptops on the same Wi-Fi (Vite listens on the LAN, and the room QR uses the LAN address or `PUBLIC_URL`).
The game is desktop only; `/fx-lab` (dev builds) plays every crisis animation on demand.

## 2. Map of the repo

```
pipeline/miami-beach.ts   ArcGIS REST -> pipeline/cache/ (git-ignored) -> app/public/data/miami-beach/*.geojson
                          + shared/src/data/districts.json          (npm run data; npm run data -- --refresh to refetch)
shared/src/               Pure TypeScript, no I/O. Imported as '@shared' by app and server.
  room.ts                   wire protocol: RoomState, ClientMsg, ServerMsg              [contract]
  game/content.ts           personas, cards, projects, indicators, crises, RULES_VERSION
  game/districts.ts         playable areas (real data) and where each card may go
  game/engine.ts            buildBoard -> resolveRound -> finalResult, bots             [contract]
  game/narrate.ts           template headlines + the facts handed to Gemini
  game/living.ts            scenario roles (Fisherman), reaction vocabulary -> avatar moods, template speech bubbles
  game/economy.ts           previews (projectPreview) and what the city owes next round (upcomingCosts)
  game/scenario.ts          crisis kinds and their authored K1 bonus, live readings, the authored scenario, checkScenario
  game/director.ts          Director validators (dialogue, twists, hints, combos, explanations), twist catalogue, strayNumbers
  game/record.ts            MatchRecord, Civic Atlas aggregation, CSV/GeoJSON      [contract]
server/src/
  index.ts, app.ts          Fastify; /api/health, /api/rules, /api/join-base, /api/tts
  rooms.ts                  authoritative room state machine (no sockets, no I/O)
  roomSocket.ts             /ws/rooms/:code: dispatches ClientMsg, broadcasts state, drains effects
  studio.ts                 /api/studio, /api/matches/:id, /api/studio/export.{json,csv,geojson}, /api/studio/brief
  ai/gemini.ts, ai/narrator.ts   Gemini client (GROUNDED rule) and the news-line narrator
  ai/director.ts            the Gemini Game Director: public-state facts, structured prompts, 8 s timeouts (proposes only)
  ai/scenario.ts            the scenario desk: Gemini writes each match's three crises and card quips (number-checked)
  live.ts                   NOAA Virginia Key tide gauge + NWS forecast, cached 10 min, each part fails soft; GET /api/live
  voice.ts                  ElevenLabs TTS with a disk cache
  db/store.ts, db/tiger.ts, db/schema.sql   FileStore or Tiger Data (Postgres) behind failSoft (local copy, retry, backfill)
  db/events.ts, db/snapshots.ts, db/derive.ts, db/persist.ts   gameplay timeline, studio history, summary/city rows, the bundle
  solana/tiger-store.ts     the civic record in Tiger Data (file fallback)
  cardArt.ts                GET /api/card-art/:id, the picture at the top of each card, painted live by Gemini (cached, fail soft)
app/src/
  routes/Landing.tsx, Play.tsx, Studio.tsx    the three pages (tiny router in router.tsx); Play is the stage: the map
                            is the whole board, with the HUD (meters, clock, player bubbles, the news crawl and anchor card) over it and your hand along the bottom
  routes/FxLab.tsx          dev-only /fx-lab: every crisis animation, any intensity
  room/useRoom.ts           the WebSocket client: state, clock offset, one function per ClientMsg, pings
  game/NewsTV.tsx           the news: a crawl across the top edge, a card with the pulsing anchor in the top-right (latest
                            headline, details drawer: facts, K1, agenda, twist), and the crisis briefing while it lands
  game/HandDeck.tsx         your hand, fanned along the bottom: the dealt cards (select) or Back / Oppose / Fund / Pass
                            (negotiate); moves.ts = move availability on top of the engine's checkMove
  game/DistrictPopover.tsx  click an area: your dealt hand (handFor: 4 of 6), illegal cards greyed with the reason,
                            two-step deploy (opens on the held card when you pick one from the hand first); GameCard.tsx (character card + mini card)
  game/CaseFile.tsx         reveal + negotiation, pinned to the proposal's area (moves, deals, hints, reactions)
  game/ResultOverlay.tsx    the round's result (side) and the podium (center)
  game/insights.tsx         what the rules and the Director add: twist card, Why?, hints, previews,
                            if-it-passes, combos, recap, card extras, the round's bill, tweened numbers
  game/Hud.tsx, ui.tsx      meters (gel tubes), timer orb, player bubbles; Aero Lagoon pieces (Tube, Soap, Pips)
  game/Lobby.tsx, Players.tsx, Flights.tsx (card flights + verdict stamps + bloom numbers)
  map/CityMap.tsx, basemap.ts   tilted 3D street map (OpenFreeMap tiles), FEMA water, zoning and satellite toggles,
                            areas, chips, pins, spotlight
  map/LivingLayer.tsx       avatars (sprites.ts), speech bubbles, ghost proposals, map effects (all Markers)
  map/MapAnchor.tsx         cards pinned beside an area (follows the camera, stays clear of the HUD)
  map/CrisisFx.tsx, CrisisAlert.tsx, intensity.ts   the crisis on the map: FEMA-shaped water (flood-by-area.geojson),
                            sand, rain, cranes, coins; breaking pins; strength from the live readings (presentation only)
  map/PingLayer.tsx         negotiation reactions over an area
  styles.css, tokens.ts     Frutiger Aero theme (Tailwind v4 tokens live in styles.css)
  ui/                       sound (Web Audio), voice (calls /api/tts), Bubbles
```

## 3. How a match flows through the code

```
client (useRoom.select)  --ClientMsg {t:'select'}-->  roomSocket.ts  --> rooms.select()
                                                                          | checkPlay() from the engine
                                                                          | maybeReveal() -> enterReveal() -> buildBoard()
                                                         drain(room.effects): save record, ask narrator
client <--ServerMsg {t:'state'}-- publicState(room, viewer)  (one per connection: hidden choices only in `mine`)
```

- `rooms.ts` is the only place state changes. Actions (`join`, `select`, `move`, `accept`, `done`, `respond`, …) validate and
  record. Play is turn-based: crisis, reveal and results end when every present player is ready (`done`), selection when every card is locked, negotiation when everyone is done. Bots are always ready, and a player gone past the reconnect grace stops holding the table. `tick(room, now)` only applies that grace and the opening live-desk wait (`SCENARIO_WAIT_MS`).
  Phases: `lobby -> [crisis -> select -> reveal -> negotiate -> resolve] x3 -> final -> lobby`.
- The engine (`shared/src/game/engine.ts`) is pure and deterministic. `resolveRound` writes every effect to a `RuleEvent`
  with a rule id (P1, R1, C1, …, listed in `coastal-clash.md` §4). The same engine runs on the client only for the
  negotiation preview.
- Side effects never run inside `rooms.ts`. It pushes `Effect`s (`record`, `reveal`, `resolved`, `final`) and
  `roomSocket.ts` drains them: it saves the `MatchRecord` and asks Gemini for a headline. The Gemini line replaces the
  template line only if `headline.key` is still current, and it is thrown out if it contains a number that is not in the facts.
- A match's crises come from the scenario desk: `start` pushes a `scenario` effect, `roomSocket.ts` reads the live
  conditions and asks Gemini (or uses `authoredScenario`), then `applyScenario` shows the crisis. Round 1 waits up to
  `SCENARIO_WAIT_MS` (10 s). Everything that belongs to a crisis being on screen happens in `showCrisis` (rooms.ts).
- Civic Atlas reads saved records. `studioSummary()` in `record.ts` computes every finding, each with refs to the
  records behind it. Gemini only rewords the findings (`/api/studio/brief`).

### The Game Director in one paragraph
Room transitions push effects (`crisis`, `reveal`, `negotiate`, `resolved`, `final`). `roomSocket.ts` drains them and asks the
Director (`server/src/ai/director.ts`) for dialogue, a twist, or hint wording. Each answer goes back through a room function
(`applyDialogue`, `proposeEvent` / `proposeEarlyEvent`, `applyHints`), which validates it with `shared/src/game/director.ts` against
the current moment and logs it. Nothing from the model changes the city except an accepted twist, and its numbers come from
`DIRECTOR_EVENTS`. Tests never call Gemini: pass `director: null` or a fake to `buildServer`, or a fake `GenerateClient` to `new Gemini`.

## 4. Recipes

Before each: write or adjust a test first where you can. After each: run §5.

### Change a number (timing, cost, effect size, threshold)
- There are no phase lengths: steps wait for players (see `done`, `maybeProceed` in `rooms.ts`).
- Influence, start indicators, viability floor, storm test: top and bottom of `game/content.ts`.
- Card cost and project effects: `CARDS` / `PROJECTS` in `content.ts`. **Also update the card's `rule` text**, which is what players read.
- Geography thresholds: `GEO_RULES` in `districts.ts`. Update the thresholds in `coastal-clash.md` §3 too.
- Bump `RULES_VERSION` in `content.ts` for any rules change, so saved records stay comparable.

### Add or change a card
1. `content.ts`: add the id to the `CardId` union and an entry in `CARDS`: persona (deck), category (what it does in the
   rules), family (what it is about), cost, art, `anim` (map effect), text, rule, tradeoff, `project` or `acts` + `fallback`,
   `counters`, `combos`, `refs`. Tests expect **6 cards per deck** and every card dealt in some round's hand.
2. Deal it: put it in `HANDS` (4 per round per persona) and in `BOT_PREFS` (same cards, in the bot's order) in `engine.ts`.
3. Behaviour: a plain support or opposition card needs **no engine code**: give it `attach: { rule, support?, opposition?, cover?, ifBuilt? }`.
   A negotiation condition uses `offer` (rules C4/O7). A consequence next round uses `delayed` (L0/L1). Only a truly new mechanic
   needs a `case` in the attachment `switch` in `resolveRound`.
   Check that the card can meet its targets: a card that only acts on its own persona's projects can never be played in the
   same round as one (one card per player per round). `cards.test.ts` checks this for combos.
4. Tests: a clash test in `shared/src/game/engine.test.ts`. Document a new rule id in `coastal-clash.md` §4.
5. Bump `RULES_VERSION`.

### Add a project kind
`ProjectKind` + `PROJECTS` (content.ts, including `upkeep`), a `case` in `projectEligibility` (districts.ts), the marker in
`FEATURE_ICON` (`app/src/map/CityMap.tsx`), fisherman and bubble lines in `living.ts`, and any persona bonus in `finalResult`.
TypeScript flags the exhaustive switches and records you miss.

### Add a combo
`ComboId` + `COMBOS` (content.ts), detection in the combo pass of `resolveRound` (after the outcomes loop), the combo on its
cards' `combos`, and a test in `cards.test.ts`. Combos are authored: Gemini may suggest or explain one, never invent one.

### Add or move a playable area
1. `pipeline/miami-beach.ts`: add to `AREAS` (id, name, blurb, focus box `[w, s, e, n]`, shore).
2. `npm run data` (the first run fetches from the live City and County GIS services; later runs use `pipeline/cache/`).
3. Commit the regenerated `shared/src/data/districts.json` and `app/public/data/miami-beach/*.geojson`.
4. Check the measured shares against the game rules (which cards are now allowed where), update the table in
   `coastal-clash.md` §3, and fix the engine tests that name four areas.
5. The authored scenario's spotlights (`authoredScenario` in `shared/src/game/scenario.ts`) refer to area ids, and so does
   the scenario desk's schema (`server/src/ai/scenario.ts` reads `DISTRICT_IDS`).

### Add or change a crisis
Crises are written per match. To change what a kind of crisis DOES, edit `CRISIS_KIND_INFO` (its K1 bonus) in
`shared/src/game/scenario.ts`. To add a kind: `CrisisKind` + `CRISIS_KINDS` + `CRISIS_KIND_INFO`, the characters' lines in
`CRISIS_LINES` (living.ts, TypeScript forces it), the twists that fit it in `TWISTS_FOR` (director.ts), and the map effect in
`LivingLayer.tsx`. The authored fallback scenario is `authoredScenario`; what Gemini may write is checked by `checkScenario`
and the number check in `server/src/ai/scenario.ts`.

### Add a player action (protocol change)
1. `shared/src/room.ts`: add to `ClientMsg` (and to `RoomState` if clients need to see it). This is a contract: say so in the commit.
2. `server/src/rooms.ts`: an exported function that checks the phase and throws `RoomError` with a readable message.
3. `server/src/roomSocket.ts`: a `case` in the dispatch `switch`.
4. `app/src/room/useRoom.ts`: a sender on the `Room` interface. Then the UI where that phase lives on the map
   (`HandDeck`, `DistrictPopover`, `CaseFile`, `ResultOverlay`, `NewsTV`).
5. A test in `server/src/rooms.test.ts`.

### UI work
- There is no side panel: `routes/Play.tsx` puts each phase on the map. Crisis: `CrisisBriefing` + `CrisisAlert` + `CrisisFx`, and `NewsTV` (crawl + anchor card) stays on all match.
  Select: `HandDeck` (point at a card to light its legal areas, click it to hold it, click a lit area) into `DistrictPopover`;
  clicking an area first still lists your cards. Reveal and negotiate: `CaseFile` for the table, `HandDeck` for your move.
  Resolve and final: `ResultOverlay`. Rules/Director additions live in `game/insights.tsx`. Pin anything that belongs to a
  place with `MapAnchor`. The camera is directed for crisis, reveal and result, free (with Recenter) while choosing and negotiating.
- The Aero Lagoon look: build with `wet` (glass panel), `frost` (light box), `gel` / `gel-sm` / `gel-lime` (buttons), `lchip`
  (chips), `Tube`, `Soap` and `Pips` from `game/ui.tsx`, `glow-title` for headings.
- The UI only shows what the server sends. Never compute an outcome in a component; call the shared engine (as the negotiation preview does) or show `state`.
- Indicator values are illustrative and budgets hypothetical: keep the label next to any number you add.
- Theme: reuse classes in `styles.css` (`glass`, `aero-btn`, `chip`, …) and colors from `tokens.ts`.

### Add a twist type
Add it to `EVENT_TYPES` and `DIRECTOR_EVENTS` in `shared/src/game/director.ts`: title, `perMagnitude` (small, illustrative), resilience,
`where` (a rule on the real district facts), a template narrative without numbers, and the map `fx`. Optionally add it to
`templateEventProposal`'s plan. Then add a valid and an ineligible case to `director.test.ts`.

### Change what the Director says
Prompts live in `server/src/ai/director.ts` (the persona notes are in `PERSONAS_TEXT`, voices in `PERSONA_INFO` and `SCENARIO_ROLES`).
Keep `GROUNDED` in every prompt that carries facts. Never relax a validator to fit a prompt: tighten the prompt instead.

### Integrations (Gemini, ElevenLabs, Tiger Data)
Each one is optional and must fail soft. Follow the existing pattern: a `ready()` check, a timeout, and a template or
memory fallback. A new Gemini prompt must include `GROUNDED` and a `check` that rejects stray numbers (`strayNumbers`).
Schema changes go in `server/src/db/schema.sql`, written idempotently (`IF NOT EXISTS`), with tables prefixed `cc_`.

## 5. Before you call it done

- [ ] `npm run typecheck` passes.
- [ ] `npm test` passes (on Node 20.19+/22.12+).
- [ ] UI changes: played through in the browser at **1440×900 and 1280×720** (a bot-filled Demo room is fastest; desktop only).
- [ ] No outcome or number invented in the UI or an LLM prompt. New numbers are labelled illustrative/hypothetical.
- [ ] Role-play, personal preference, demo vs community sessions and bots are still kept apart in records.
- [ ] Contract changes (`room.ts`, `engine.ts` types, `record.ts`) are called out in the commit; `RULES_VERSION` bumped for rule changes.
- [ ] Docs updated if you changed rules, areas or setup (`coastal-clash.md`, this file, the skill).

## 6. Git workflow

- Branch from `pratham/coastal-clash` (it carries `aum/coastal-clash` plus the living map, the Director, the 24 cards and the review fixes; merge `aum/coastal-clash` in again as Aum pushes) as `<name>/dev` or `<name>/<topic>`.
  `aum/dev` holds the older ReefForge project; do not merge between them.
- Commit small with a message that says what changed and why. Pull and merge often: `content.ts`, `engine.ts`, `rooms.ts`, `routes/Play.tsx` and `styles.css` are where people collide.
- Never commit `.env`, `pipeline/cache/` or `node_modules/`.

## 7. Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `require() of ES Module …cookie…` in `rooms.test.ts` | Node too old for `require(esm)`. Use Node 22.12+ (or 20.19+). |
| "Room not found" on a join link | Rooms live in server memory: a server restart (including `tsx watch` reloading after an edit) clears them. Open a new room. |
| Other laptops cannot join | They must be on the same network. Check `/api/join-base`; set `PUBLIC_URL` to a tunnel when the LAN is locked down. |
| No AI headline / no voice | Expected without `GEMINI_API_KEY` / `ELEVENLABS_API_KEY`. `/api/health` shows what is on (`ai`, `director`, `voice`). |
| `director: template kept ... timed out` in the server log | Gemini was slower than 8 s (big prompt, busy key). The template is already showing; nothing breaks. Raise `geminiDirector(gemini, ms)` only if it happens constantly. |
| `error 402 ... prepayment credits are depleted` in the server log | The Gemini key's AI Studio project is out of credit. Top it up at https://ai.studio/projects; until then every AI call falls back to templates and the game plays normally. |
| Studio says "Replay check skipped: Recorded under coastal-clash-rules/1.0.0" | Expected for matches played before the 2.0.0 rules: today's engine would not reproduce them, so they are not compared. |
| `scenario desk: authored scenario stands in` | Gemini or the live feeds (NOAA, NWS) failed or were slow: the authored scenario, with whatever live readings arrived, is used. |
| Avatars or effects pile up in one corner of the map | Something set `position` or animated `transform` on a MapLibre marker's root element. Animate a child instead. |
| Studio is empty after a restart | Without `DATABASE_URL` matches live in `server/.cache/matches.json`. Set `DATABASE_URL` for Tiger Data. |
| `/api/db/status` shows `error: Connection terminated due to connection timeout` | The database port is not reachable from this network (venue wifi often blocks high ports). The game keeps working on local files and writes to Tiger once it connects; try a hotspot, or check the service is running in the Tiger console. |
| `npm run data` fails | The GIS services are down or rate-limited. Run it without `--refresh` to use the cache; the committed data still works. |

## 8. Deploying

There is one Docker service (`Dockerfile`): the server serves the built app, `/api` and `/ws`. `render.yaml` is a Render Blueprint
with a health check on `/api/health`. Keys are set in the host's environment, never in the image.

## The Civic Atlas and the match simulator

`shared/src/game/atlas.ts` turns match records into one record per proposal (its area, crisis, support, opposition,
concessions offered and taken, rules cited, final status) and computes rates with Wilson intervals, scenario-conditioned
comparisons, concession effects, stakeholder alliances, rule friction and city outcomes. `server/src/studio.ts` serves it
at `/api/atlas` (`/api/atlas/decisions`, `/api/atlas/table/:name` as CSV, `/api/atlas/brief`); the page is
`app/src/routes/Atlas.tsx` with sections in `app/src/atlas/`. `/studio` still opens the same page.

To see it on more than a handful of tables, play simulated matches into a sandbox so real records are never touched:

```bash
# server with no Gemini, database, Solana or Snowflake, writing to its own files
cd server && PORT=8788 GEMINI_API_KEY= DATABASE_URL= SOLANA_ENABLED=false SNOWFLAKE_ACCOUNT= \
  MATCH_STORE_FILE=/tmp/sandbox-matches.json CIVIC_STORE_FILE=/tmp/sandbox-civic.json ../node_modules/.bin/tsx src/index.ts
# the app against it
cd app && VITE_SERVER_URL=http://localhost:8788 ./node_modules/.bin/vite --port 5174
# four scripted players per game (tendencies per persona, legal plays, real protocol)
cd server && ../node_modules/.bin/tsx scripts/simulate.ts --games 40 --parallel 5 --url http://localhost:8788
```

Simulated matches are labelled demo and are scripted behaviour: the patterns they show come from the script, not from
people. Never point the simulator at a server holding community sessions.
