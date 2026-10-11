# Coastal Clash: developer guide

How to set up, find your way around, make the common changes, and verify them. Read this after
[`AGENTS.md`](../AGENTS.md) (the rules) and [`progress/map-board.md`](progress/map-board.md) (where the branch stands).
The product, the game rules and the demo are in [`coastal-clash.md`](coastal-clash.md).
Coding agents: the same material, as a checklist, is in [`skills/coastal-clash/SKILL.md`](skills/coastal-clash/SKILL.md).

## 1. Setup

| Need | Notes |
|---|---|
| [Bun](https://bun.sh) **1.4+** | The package manager and script runner (`packageManager: bun@1.4.2`, `bun.lock`). Workspaces: `shared`, `app`, `server`; one `bun install` at the root. Windows: `powershell -c "irm bun.sh/install.ps1 \| iex"`, then open a new terminal. Do not use `npm install`: there is no `package-lock.json`, and npm would write one. |
| Node **20.19+ or 22.12+** | `tsx` and `vitest` run on Node. Older 22.x (e.g. 22.11) typechecks fine but the WebSocket match test crashes with `require() of ES Module …/cookie/dist/index.js`, because Fastify's test helper `require`s an ESM-only package. `.node-version` says 22; with fnm, `fnm install 22 && fnm use 22`. |
| `.env` (optional) | `cp .env.example .env` in this folder. Every key is optional (table below). The server reads only `.env` (`tsx --env-file-if-exists=../.env`); Vite reads `VITE_*` from the same folder. |

```bash
bun install
bun run dev         # app http://localhost:5173 (Vite), server http://localhost:8787 (Fastify)
bun run typecheck   # shared, app, server in turn
bun run test        # vitest: shared engine/stories/atlas, server rooms (incl. a 4-client WebSocket match), card art, voice, db, Solana; app moves/intensity/spoken
bun run build       # the app into app/dist; `bun run start` then serves it from the server
```

### Environment

| Variable | Without it |
|---|---|
| `GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_IMAGE_MODEL` | Template headlines, bubbles, twists and hints; authored scenario; drawn card placeholders |
| `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_{BROADCAST,NARRATOR,MAYOR,ACTIVIST,RESORT,RESIDENT}`, `ELEVENLABS_MODEL` | No voice; captions and bubbles carry the words |
| `DATABASE_URL` (Tiger Data) | Matches in `server/.cache/matches.json` (`MATCH_STORE_FILE` overrides the path) |
| `SNOWFLAKE_ACCOUNT`, `SNOWFLAKE_TOKEN`, `SNOWFLAKE_WAREHOUSE`, `SNOWFLAKE_ROLE` | Stories from `server/.cache/stories.json` if a past run saved it; otherwise no stories, and the live-readings desk writes the crises |
| `SOLANA_PAYER_SECRET_KEY`, `SOLANA_RPC_URL`, `SOLANA_ENABLED=false` | Matches are fingerprinted locally only (`server/.cache/civic-record.json`, `CIVIC_STORE_FILE` overrides) |
| `PORT`, `PUBLIC_URL`, `VITE_SERVER_URL`, `VITE_FEATURE_VOICE`, `VITE_FEATURE_AI` | Port 8787, LAN address in the room QR, server at localhost:8787, voice and AI on |
| `LOG_LEVEL`, `NWS_USER_AGENT`, `TTS_CACHE_DIR` | `info`, a default user agent, `server/.cache/tts` |

`/api/health` shows what is on (`ai`, `director`, `voice`, `store`); `/api/db/status` shows the database; `/api/solana/status` the chain;
`/api/stories` where the stories came from (`snowflake`, `cache` or `none`).

**Playing it locally alone.** Open `http://localhost:5173`, host a room, and as host fill the empty seats with bots in the lobby.
Turn by turn there is no clock; with bots in the other seats, click through each step, and the host's "Move on without them" button skips a player who is away. Pick **Sprint** in the lobby to play on the clock (about 60 s a round, under four minutes a match).
To test real multiplayer, open the room in other browser profiles, or on other laptops on the same Wi-Fi (Vite listens on the LAN, and the
room QR uses the LAN address or `PUBLIC_URL`). The game is desktop only. Dev builds add `/fx-lab` (every crisis animation, any intensity,
and the character sheet) and `/glb-lab` (every 3D character portrait).

## 2. Map of the repo

```
pipeline/
  miami-beach.ts            ArcGIS REST -> pipeline/cache/ (git-ignored) -> app/public/data/miami-beach/*.geojson + shared/src/data/districts.json
  flood-by-area.ts          FEMA AE/VE polygons clipped to each playable area -> flood-by-area.geojson (offline)
                            (bun run data runs both; bun run data -- --refresh refetches the GIS layers)
  research/                 miami-beach-civic-corpus.json (38 stories, 62 sources), load.sql, pat-policy.sql
  snowflake-load.ts         the corpus -> Snowflake COASTAL_CLASH.CORPUS (ISSUES, SOURCES, APPROVED_ISSUES view); --sql writes load.sql
  cast-stories.ts           the casting agent (Gemini, offline): who each character stands in for, the story's deal, card names
shared/src/                 Pure TypeScript, no I/O. Imported as '@shared' by app and server.
  room.ts                   wire protocol: RoomState, ClientMsg, ServerMsg; Pace, SPRINT_MS, STEP_OF   [contract]
  cardArt.ts                the card-picture style version (part of every picture URL)
  game/content.ts           personas, 24 cards, HANDS, projects, COMBOS, indicators, RULES_VERSION
  game/districts.ts         playable areas (real data) and where each card may go
  game/engine.ts            buildBoard -> resolveRound -> finalResult, dealtHand, checkPlay, bots   [contract]
  game/story.ts             CivicStory, StoryCast, validateCast, pickStories, storyCrisis, cardName  [contract]
  game/beginner.ts          Beginner Mode (BEGINNER_RULES_VERSION): one conflict a round, 2-3 cards, Support / Oppose / Suggest a
                            Change (engine rules C5/O8), bot agendas, the end-of-match goals and the personal question
  game/simple.ts            every card in plain words (does, good, bad, city money) for first-time players; pinned to the rules by simple.test.ts
  game/scenario.ts          crisis kinds and their authored K1 bonus, live readings, the authored scenario, checkScenario
  game/narrate.ts           template headlines + the facts handed to Gemini
  game/living.ts            scenario roles, reaction vocabulary -> avatar moods, template speech bubbles
  game/economy.ts           previews (projectPreview) and what the city owes next round (upcomingCosts)
  game/director.ts          Director validators (dialogue, twists, hints, combos, explanations), twist catalogue, strayNumbers, checkSpoken
  game/record.ts            MatchRecord, replayMatch, studioSummary, CSV/GeoJSON       [contract]
  game/atlas.ts             Civic Atlas: one row per proposal, Wilson intervals, comparisons, alliances, rule friction, findings
  game/proof.ts             the match fingerprint (canonical JSON, SHA-256) and Merkle helpers
server/src/
  index.ts, app.ts          Fastify; /api/health, /api/rules, /api/join-base, /api/explain, /api/stories, /api/db/status
  rooms.ts                  authoritative room state machine (no sockets, no I/O)
  roomSocket.ts             /ws/rooms/:code: dispatches ClientMsg, broadcasts state, drains effects
  studio.ts                 /api/atlas, /api/atlas/{decisions,table/:name,brief}; /api/studio, /api/studio/{export.:format,brief,history}; /api/matches/:id
  stories.ts                approved, cast stories from Snowflake (SQL API), memo 10 min, disk cache
  ai/gemini.ts, ai/narrator.ts   Gemini client (GROUNDED rule, model fallback) and the news-line narrator
  ai/scenario.ts            storyScenarioWriter (story headlines) over geminiScenarioWriter (live readings) over authoredScenario
  ai/director.ts            the Gemini Game Director: public-state facts, structured prompts, 8 s timeouts (proposes only)
  cardArt.ts                GET /api/card-art/:id: the card's picture, painted by Gemini in HOUSE_STYLE, queued, cached, fail soft
  live.ts                   NOAA Virginia Key tide gauge + NWS forecast, cached 10 min, each part fails soft; GET /api/live
  voice.ts                  POST /api/tts: ElevenLabs voices per character, disk cache, 40 new clips a minute per address
  db/store.ts, db/tiger.ts, db/schema.sql   FileStore or Tiger Data (Postgres) behind failSoft (local copy, retry, backfill)
  db/events.ts, db/snapshots.ts, db/derive.ts, db/persist.ts   gameplay timeline, studio history, summary/city rows, the bundle
  solana/                   chain.ts (devnet memos), civic.ts (fingerprints, batches, Merkle), routes.ts (/api/solana/*), store.ts + tiger-store.ts
  net.ts, web.ts            LAN address for the QR; serving app/dist in production
server/scripts/simulate.ts  scripted four-player matches over the real protocol (sandbox only, see the end of this file)
app/src/
  App.tsx, router.tsx       routes: / Landing, /play/:code Play, /atlas (and /studio) Atlas, /verify/:matchId Verify; dev /fx-lab, /glb-lab
  routes/Play.tsx           the stage: the map is the whole board, with the HUD over it and your hand along the bottom
  room/useRoom.ts, Invite.tsx   the WebSocket client (state, clock offset, one function per ClientMsg, pings); the room QR
  game/NewsTV.tsx           the news: a crawl across the top edge and the anchor card in the top-right (headline, details drawer); CrisisBriefing
  game/HandDeck.tsx         Advanced: your hand, fanned along the bottom (select); one benefit and the cost on each face
  game/moves.ts             move words and moveBlocker on top of checkMove
  game/Beginner.tsx         Beginner Mode: the conflict card, the 2-3 card tray, the end screen (goals, storm, personal question)
  game/Steps.tsx            the round in three steps (Play a Card, Make a Deal, See What Happens), the sprint countdown, the storm goal
  game/Climax.tsx           step 3: outcomeSentence (one plain line per project) and the storm scene after round 3
  game/DistrictPopover.tsx  click an area: your dealt hand, illegal cards greyed with the reason, two-step deploy
  game/CaseFile.tsx         reveal + negotiation, pinned to the proposal's area (moves, deals, hints, reactions)
  game/ResultOverlay.tsx    the round's result (side) and the podium (center), with the story's evidence
  game/Turn.tsx             ReadyBar: who is ready, the host's "Move on without them"
  game/story.tsx            CrisisProvider and the story panel (who each character stands in for, sources)
  game/GameCard.tsx, CardArt.tsx   trading-card layout; the generated picture or a drawn placeholder
  game/insights.tsx         twist card, Why?, hints, previews, if-it-passes, combos, recap, card extras, the round's bill, tweened numbers
  game/Hud.tsx, ui.tsx      meters (gel tubes), round pill, player bubbles; Aero Lagoon pieces (Tube, Soap, Pips)
  game/Lobby.tsx, Players.tsx, Flights.tsx, format.ts   lobby (deck fan), seats, card flights + verdict stamps + bloom numbers
  map/CityMap.tsx, basemap.ts   tilted 3D street map (OpenFreeMap tiles), FEMA water, zoning and satellite toggles, areas, chips, pins, spotlight
  map/LivingLayer.tsx       avatars, speech bubbles, ghost proposals, map effects (all Markers)
  map/MapAnchor.tsx         cards pinned beside an area (follows the camera, stays clear of the HUD)
  map/CrisisFx.tsx, CrisisAlert.tsx, intensity.ts   the crisis on the map: FEMA-shaped water, sand, rain, cranes, coins; breaking pins; strength from live readings
  map/PingLayer.tsx         negotiation reactions over an area
  map/sprites.ts            drawn character sprites (fallback until a 3D portrait is ready)
  characters/render.ts, portraits.ts   the GLB figures in app/public/characters rendered once into transparent portraits (three.js, lazy)
  atlas/                    Civic Atlas sections, parts and the match timeline; routes/Atlas.tsx is the page
  routes/Verify.tsx         the public check of a match: fingerprint, Merkle proof, memos read from a devnet RPC node
  routes/Plan.tsx           /plan/:matchId: the shareable city plan, replayed from the record (Documented / Simulated / Decided)
  ui/                       sound (Web Audio), voice (one speech queue, calls /api/tts), spoken (what the anchor reads), Bubbles
  styles.css, tokens.ts     Frutiger Aero theme (Tailwind v4 tokens live in styles.css)
```

## 3. How a match flows through the code

```
client (useRoom.select)  --ClientMsg {t:'select'}-->  roomSocket.ts  --> rooms.select()
                                                                          | checkPlay() from the engine
                                                                          | maybeReveal() -> enterReveal() -> buildBoard()
                                                         drain(room.effects): save record, ask narrator, Director, civic record
client <--ServerMsg {t:'state'}-- publicState(room, viewer)  (one per connection: hidden choices only in `mine`)
```

- `rooms.ts` is the only place state changes. Actions (`join`, `select`, `move`, `accept`, `ping`, `done`, `skip`, `respond`, …) validate and
  record. Turn by turn (`room.pace === 'turns'`, the default): crisis, reveal and results end when every present player is ready (`done`), selection
  when every card is locked, negotiation when everyone is done. Bots are always ready, a player gone past the reconnect grace stops holding the
  table, and the host can `skip` someone who is away. In a sprint (`setPace`, lobby only) every phase also gets `room.endsAt` from `deadline()`
  (`SPRINT_MS` in `shared/src/room.ts`) and `tick(room, now)` advances when it passes; otherwise `tick` only applies the reconnect grace and the
  opening scenario wait (`SCENARIO_WAIT_MS`). The client shows the countdown from `endsAt` and the clock offset in `useRoom`.
  Phases: `lobby -> [crisis -> select -> reveal -> negotiate -> resolve] x3 -> final -> lobby`.
- The engine (`shared/src/game/engine.ts`) is pure and deterministic. `resolveRound` writes every effect to a `RuleEvent`
  with a rule id (P1, R1, C1, …, listed in `coastal-clash.md` §5). The same engine runs on the client only for the
  negotiation preview.
- Side effects never run inside `rooms.ts`. It pushes `Effect`s (`record`, `reveal`, `resolved`, `final`, …) and
  `roomSocket.ts` drains them: it saves the `MatchRecord`, asks Gemini for a headline, and hands a finished match to the civic record.
  The Gemini line replaces the template line only if `headline.key` is still current, and it is thrown out if it contains a number
  that is not in the facts.
- A match's crises: when a seat is taken in the lobby the server already picks the three stories (`pickMatchStories`) so card
  pictures can be painted early. `start` pushes a `scenario` effect; `roomSocket.ts` reads the live conditions and calls the writer:
  `storyScenarioWriter` (three stories, Gemini headlines, the story's own title and summary without Gemini), or with fewer than three
  stories `geminiScenarioWriter`, or without Gemini `authoredScenario`. `applyScenario` shows the crisis. Round 1 waits up to
  `SCENARIO_WAIT_MS` (10 s). Everything that belongs to a crisis being on screen happens in `showCrisis` (rooms.ts).
- A story's crisis carries its deal (`crisis.hands`) and card names (`crisis.skins`): `dealtHand` and `cardName` read them.
- Civic Atlas reads saved records: `shared/src/game/atlas.ts` for the aggregates, `studioSummary()` in `record.ts` for the findings,
  each with refs to the records behind it. Gemini only rewords them (`/api/atlas/brief`).

### The Game Director in one paragraph
Room transitions push effects (`crisis`, `reveal`, `negotiate`, `resolved`, `final`). `roomSocket.ts` drains them and asks the
Director (`server/src/ai/director.ts`) for dialogue, a twist, or hint wording. Each answer goes back through a room function
(`applyDialogue`, `proposeEvent` / `proposeEarlyEvent`, `applyHints`), which validates it with `shared/src/game/director.ts` against
the current moment and logs it. Nothing from the model changes the city except an accepted twist, and its numbers come from
`DIRECTOR_EVENTS`. Tests never call Gemini: pass `director: null` or a fake to `buildServer`, or a fake `GenerateClient` to `new Gemini`.

## 4. Recipes

Before each: write or adjust a test first where you can. After each: run §5.

### Change a number (cost, effect size, threshold)
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
   Stories deal their own hands from the same deck: recast the stories (`pipeline/cast-stories.ts --all`) if a deck changes.
3. Behaviour: a plain support or opposition card needs **no engine code**: give it `attach: { rule, support?, opposition?, cover?, ifBuilt? }`.
   A negotiation condition uses `offer` (rules C4/O7). A consequence next round uses `delayed` (L0/L1). Only a truly new mechanic
   needs a `case` in the attachment `switch` in `resolveRound`.
   Check that the card can meet its targets: a card that only acts on its own persona's projects can never be played in the
   same round as one (one card per player per round). `cards.test.ts` checks this for combos.
4. Tests: a clash test in `shared/src/game/engine.test.ts`. Document a new rule id in `coastal-clash.md` §5.
5. Bump `RULES_VERSION`. If the card's look changes, bump the style version in `shared/src/cardArt.ts` so pictures repaint.

### Add a project kind
`ProjectKind` + `PROJECTS` (content.ts, including `upkeep`), a `case` in `projectEligibility` (districts.ts), the marker in
`FEATURE_ICON` (`app/src/map/CityMap.tsx`), bubble lines in `living.ts`, and any persona bonus in `finalResult`.
TypeScript flags the exhaustive switches and records you miss.

### Add a combo
`ComboId` + `COMBOS` (content.ts), detection in the combo pass of `resolveRound` (after the outcomes loop), the combo on its
cards' `combos`, and a test in `cards.test.ts`. Combos are authored: Gemini may suggest or explain one, never invent one.

### Add or move a playable area
1. `pipeline/miami-beach.ts`: add to `AREAS` (id, name, blurb, focus box `[w, s, e, n]`, shore).
2. `bun run data` (the first run fetches from the live City and County GIS services; later runs use `pipeline/cache/`). It also
   rebuilds `flood-by-area.geojson`.
3. Commit the regenerated `shared/src/data/districts.json` and `app/public/data/miami-beach/*.geojson`.
4. Check the measured shares against the game rules (which cards are now allowed where), update the table in
   `coastal-clash.md` §3, and fix the engine tests that name four areas.
5. The authored scenario's spotlights (`authoredScenario` in `shared/src/game/scenario.ts`) refer to area ids, and so does
   the scenario desk's schema (`server/src/ai/scenario.ts` reads `DISTRICT_IDS`). Story casts name an area too: recast.

### Add or change a civic story
1. Edit `pipeline/research/miami-beach-civic-corpus.json` (facts, the real sides, tensions, concerns and source links).
2. Load it: `bunx tsx --env-file=.env pipeline/snowflake-load.ts` (or `--sql` to write `load.sql` for a Snowsight worksheet).
   Re-running is safe: issues merge by id and a human's `REVIEW_STATUS` is never overwritten.
3. A human sets `REVIEW_STATUS = 'approved'` in Snowflake. Nothing else reaches the game.
4. Cast it: `bunx tsx --env-file=.env pipeline/cast-stories.ts` (new stories) or `--all`. `validateCast` must pass; a story that
   fails twice stays uncast and unused. Then reload Snowflake (step 2).
5. The server picks it up within 10 minutes (`server/src/stories.ts`); `/api/stories` shows what it has.

### Add or change a crisis kind
To change what a kind of crisis DOES, edit `CRISIS_KIND_INFO` (its K1 bonus) in `shared/src/game/scenario.ts`. To add a kind:
`CrisisKind` + `CRISIS_KINDS` + `CRISIS_KIND_INFO`, the characters' lines in `CRISIS_LINES` (living.ts, TypeScript forces it), the
twists that fit it in `TWISTS_FOR` (director.ts), and the map effect in `app/src/map/CrisisFx.tsx` (check it in `/fx-lab`). The authored
fallback scenario is `authoredScenario`; what Gemini may write is checked by `checkScenario` and the number check in `server/src/ai/scenario.ts`.

### Add a player action (protocol change)
1. `shared/src/room.ts`: add to `ClientMsg` (and to `RoomState` if clients need to see it). This is a contract: say so in the commit.
2. `server/src/rooms.ts`: an exported function that checks the phase and throws `RoomError` with a readable message.
3. `server/src/roomSocket.ts`: a `case` in the dispatch `switch`.
4. `app/src/room/useRoom.ts`: a sender on the `Room` interface. Then the UI where that phase lives on the map
   (`HandDeck`, `DistrictPopover`, `CaseFile`, `ResultOverlay`, `NewsTV`, `Turn.tsx`).
5. A test in `server/src/rooms.test.ts`.

### UI work
- There is no side panel: `routes/Play.tsx` puts each phase on the map. Crisis: `CrisisBriefing` + `CrisisAlert` + `CrisisFx`, and `NewsTV`
  (crawl + anchor card) stays on all match. Select: `HandDeck` (point at a card to light its legal areas, click it to hold it, click a lit
  area) into `DistrictPopover`; clicking an area first still lists your cards. Reveal and negotiate: `CaseFile` for the table, `HandDeck`
  for your move, `PingLayer` for reactions. Resolve: `Climax` (verdict stamps, then the storm after round 3) and then `ResultOverlay`; final: `ResultOverlay`.
  `Steps` shows where the round is (and the sprint clock); `ReadyBar` (`Turn.tsx`) moves each step on.
  Rules/Director additions live in `game/insights.tsx`, story pieces in `game/story.tsx`. Pin anything that belongs to a place with
  `MapAnchor`. The camera is directed for crisis, reveal and result, free (with Recenter) while choosing and negotiating.
- The Aero Lagoon look: build with `wet` (glass panel), `frost` (light box), `gel` / `gel-sm` / `gel-lime` (buttons), `lchip`
  (chips), `Tube`, `Soap` and `Pips` from `game/ui.tsx`, `glow-title` for headings.
- The UI only shows what the server sends. Never compute an outcome in a component; call the shared engine (as the negotiation preview does) or show `state`.
- Show card names with `cardName(id, crisis)`, never `CARDS[id].name`: a story may rename a card.
- Indicator values are illustrative and budgets hypothetical: keep the label next to any number you add.
- Theme: reuse classes in `styles.css` (`glass`, `aero-btn`, `chip`, …) and colors from `tokens.ts`.

### Add a twist type
Add it to `EVENT_TYPES` and `DIRECTOR_EVENTS` in `shared/src/game/director.ts`: title, `perMagnitude` (small, illustrative), resilience,
`where` (a rule on the real district facts), a template narrative without numbers, and the map `fx`. Optionally add it to
`templateEventProposal`'s plan. Then add a valid and an ineligible case to `director.test.ts`.

### Change what the Director says
Prompts live in `server/src/ai/director.ts` (the persona notes are in `PERSONAS_TEXT`, voices in `PERSONA_INFO` and `SCENARIO_ROLES`).
Keep `GROUNDED` in every prompt that carries facts. Never relax a validator to fit a prompt: tighten the prompt instead.

### Change a voice or the card-picture style
Voices: the defaults and `ELEVENLABS_VOICE_<NAME>` overrides in `server/src/voice.ts`; what the anchor reads in `app/src/ui/spoken.ts`.
Pictures: `HOUSE_STYLE` in `server/src/cardArt.ts`, then bump the style version in `shared/src/cardArt.ts` so browsers and the cache repaint.

### Integrations (Gemini, ElevenLabs, Tiger Data, Snowflake, Solana)
Each one is optional and must fail soft. Follow the existing pattern: a `ready()` check, a timeout, and a template, cache or
local fallback. A new Gemini prompt must include `GROUNDED` and a `check` that rejects stray numbers (`strayNumbers`).
Schema changes go in `server/src/db/schema.sql`, written idempotently (`IF NOT EXISTS`), with tables prefixed `cc_`.

## 5. Before you call it done

- [ ] `bun run typecheck` passes.
- [ ] `bun run test` passes (on Node 20.19+/22.12+).
- [ ] UI changes: played through in the browser at **1440×900 and 1280×720** (a bot-filled room is fastest; desktop only).
- [ ] No outcome or number invented in the UI or an LLM prompt. New numbers are labelled illustrative/hypothetical.
- [ ] Role-play, personal preference, demo vs community sessions and bots are still kept apart in records and in Civic Atlas.
- [ ] Contract changes (`room.ts`, `engine.ts` types, `record.ts`, `story.ts`) are called out in the commit; `RULES_VERSION` bumped for rule changes.
- [ ] Docs updated if you changed rules, areas, stories or setup (`coastal-clash.md`, this file, the skill, `progress/map-board.md`).

## 6. Git workflow

- Work on **`rdx/map-board`** in the `map-board/` folder (a git worktree of the shared repo). Commit there.
- Do not pull, merge or push other branches (`main`, `pratham/*`, `aum/*`, `rdx/dev`, `rdx/ui-refresh`) unless asked. They have moved
  on separately: for example `pratham/coastal-clash` carries a money/agreements rules 3.0.0 that this branch does not.
- Commit small with a message that says what changed and why. `content.ts`, `engine.ts`, `rooms.ts`, `routes/Play.tsx` and `styles.css`
  are where people collide.
- Never commit `.env`, `.env.local`, `pipeline/cache/`, `server/.cache/` or `node_modules/`.

## 7. Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `bun: command not found` / "not recognized" | Install Bun (§1) and open a new terminal. |
| `require() of ES Module …cookie…` in `rooms.test.ts` | Node too old for `require(esm)`. Use Node 22.12+ (or 20.19+). |
| "Room not found" on a join link | Rooms live in server memory: a server restart (including `tsx watch` reloading after an edit) clears them. Open a new room. |
| Other laptops cannot join | They must be on the same network. Check `/api/join-base`; set `PUBLIC_URL` to a tunnel when the LAN is locked down. |
| No AI headline / no voice | Expected without `GEMINI_API_KEY` / `ELEVENLABS_API_KEY`. `/api/health` shows what is on (`ai`, `director`, `voice`). |
| `director: template kept ... timed out` in the server log | Gemini was slower than 8 s (big prompt, busy key). The template is already showing; nothing breaks. Raise `geminiDirector(gemini, ms)` only if it happens constantly. |
| `error 402 ... prepayment credits are depleted` in the server log | The Gemini key's AI Studio project is out of credit. Top it up at https://ai.studio/projects; until then every AI call falls back to templates and the game plays normally. |
| Cards show a drawn placeholder instead of a picture | No Gemini key, the image quota is used up, or the picture is still painting. Pictures are cached in `server/.cache/card-art`. |
| `stories: Snowflake unavailable, using the cache` | No `SNOWFLAKE_*` in `.env` or Snowflake is down. With no cache either, `/api/stories` says `none` and the crises come from the live readings. |
| `Solana civic record off: SOLANA_PAYER_SECRET_KEY is not set` | Expected without the devnet key: matches are fingerprinted locally and `/verify` has no memos to read. |
| Atlas says "Replay check skipped: Recorded under coastal-clash-rules/1.0.0" | Expected for matches played before the 2.0.0 rules: today's engine would not reproduce them, so they are not compared. |
| `scenario desk: authored scenario stands in` | Gemini or the live feeds (NOAA, NWS) failed or were slow: the authored scenario, with whatever live readings arrived, is used. |
| Avatars or effects pile up in one corner of the map | Something set `position` or animated `transform` on a MapLibre marker's root element. Animate a child instead. |
| Characters are flat drawings | The 3D portraits are still rendering, or WebGL is off. The sprites in `map/sprites.ts` are the fallback; check `/glb-lab`. |
| Atlas is empty after a restart | Without `DATABASE_URL` matches live in `server/.cache/matches.json`; check the file exists. Set `DATABASE_URL` for Tiger Data. |
| `/api/db/status` shows `error: Connection terminated due to connection timeout` | The database port is not reachable from this network (venue wifi often blocks high ports). The game keeps working on local files and writes to Tiger once it connects; try a hotspot, or check the service is running in the Tiger console. |
| `bun run data` fails | The GIS services are down or rate-limited. Run it without `--refresh` to use the cache; the committed data still works. |

## 8. Deploying

There is one Docker service (`Dockerfile`, on `oven/bun`): the server serves the built app, `/api` and `/ws`. `render.yaml` is a Render
Blueprint with a health check on `/api/health`. Keys are set in the host's environment, never in the image. The Blueprint asks for
`GEMINI_API_KEY`, `GEMINI_MODEL`, `ELEVENLABS_API_KEY`, `DATABASE_URL` and `PUBLIC_URL`; add `SNOWFLAKE_*` and `SOLANA_*` in the host
if the deployment should use them.

## 9. The Civic Atlas and the match simulator

`shared/src/game/atlas.ts` turns match records into one record per proposal (its area, crisis, support, opposition,
concessions offered and taken, rules cited, final status) and computes rates with Wilson intervals, scenario-conditioned
comparisons, concession effects, stakeholder alliances, rule friction and city outcomes. `server/src/studio.ts` serves it
at `/api/atlas` (`/api/atlas/decisions`, `/api/atlas/table/:name` as CSV, `/api/atlas/brief`); the page is
`app/src/routes/Atlas.tsx` with sections in `app/src/atlas/`. `/studio` still opens the same page.

To see it on more than a handful of tables, play simulated matches into a sandbox so real records are never touched.

bash (macOS, Linux, Git Bash):

```bash
# server with no Gemini, database, Solana or Snowflake, writing to its own files
cd server && PORT=8788 GEMINI_API_KEY= DATABASE_URL= SOLANA_ENABLED=false SNOWFLAKE_ACCOUNT= \
  MATCH_STORE_FILE=/tmp/sandbox-matches.json CIVIC_STORE_FILE=/tmp/sandbox-civic.json ../node_modules/.bin/tsx src/index.ts
# the app against it
cd app && VITE_SERVER_URL=http://localhost:8788 ./node_modules/.bin/vite --port 5174
# four scripted players per game (tendencies per persona, legal plays, real protocol)
cd server && ../node_modules/.bin/tsx scripts/simulate.ts --games 40 --parallel 5 --url http://localhost:8788
```

PowerShell (Windows), one terminal each:

```powershell
# 1. sandbox server
cd server; $env:PORT='8788'; $env:GEMINI_API_KEY=''; $env:DATABASE_URL=''; $env:SOLANA_ENABLED='false'; $env:SNOWFLAKE_ACCOUNT=''
$env:MATCH_STORE_FILE="$env:TEMP\sandbox-matches.json"; $env:CIVIC_STORE_FILE="$env:TEMP\sandbox-civic.json"; bunx tsx src/index.ts
# 2. the app against it
cd app; $env:VITE_SERVER_URL='http://localhost:8788'; bunx vite --port 5174
# 3. the simulator
cd server; bunx tsx scripts/simulate.ts --games 40 --parallel 5 --url http://localhost:8788
```

The sandbox server is started without `--env-file`, so `.env` keys do not leak into it. Simulated matches are labelled demo and are
scripted behaviour: the patterns they show come from the script, not from people. Never point the simulator at a server holding
community sessions.
