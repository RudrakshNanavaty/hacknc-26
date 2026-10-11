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
Pick the Demo pace; the host's skip button ends any phase. To test real multiplayer, open the room in other browser profiles,
or on phones on the same Wi-Fi (Vite listens on the LAN, and the room QR uses the LAN address or `PUBLIC_URL`).

## 2. Map of the repo

```
pipeline/miami-beach.ts   ArcGIS REST -> pipeline/cache/ (git-ignored) -> app/public/data/miami-beach/*.geojson
                          + shared/src/data/districts.json          (npm run data; npm run data -- --refresh to refetch)
shared/src/               Pure TypeScript, no I/O. Imported as '@shared' by app and server.
  config.ts                 phase timings (PACES: standard, demo)
  room.ts                   wire protocol: RoomState, ClientMsg, ServerMsg              [contract]
  game/content.ts           personas, cards, projects, indicators, crises, RULES_VERSION
  game/districts.ts         playable areas (real data) and where each card may go
  game/engine.ts            buildBoard -> resolveRound -> finalResult, bots             [contract]
  game/narrate.ts           template headlines + the facts handed to Gemini
  game/record.ts            MatchRecord, Planning Studio aggregation, CSV/GeoJSON      [contract]
server/src/
  index.ts, app.ts          Fastify; /api/health, /api/rules, /api/join-base, /api/tts
  rooms.ts                  authoritative room state machine (no sockets, no I/O)
  roomSocket.ts             /ws/rooms/:code: dispatches ClientMsg, broadcasts state, drains effects
  studio.ts                 /api/studio, /api/matches/:id, /api/studio/export.{json,csv,geojson}, /api/studio/brief
  ai/gemini.ts, ai/narrator.ts   Gemini client (GROUNDED rule) and the news-line narrator
  voice.ts                  ElevenLabs TTS with a disk cache
  db/store.ts, db/tiger.ts, db/schema.sql   MemoryStore or Tiger Data (Postgres) behind failSoft
app/src/
  routes/Landing.tsx, Play.tsx, Studio.tsx    the three pages (tiny router in router.tsx)
  room/useRoom.ts           the WebSocket client: state, clock offset, one function per ClientMsg
  game/panels.tsx           one panel per phase: Crisis, Hand, Reveal, Negotiation, Resolve, Final
  game/Hud.tsx, Players.tsx, Lobby.tsx, Flights.tsx (card flights + verdict stamps), GameCard.tsx
  map/CityMap.tsx           MapLibre: satellite, FEMA/zoning overlays, areas, markers, spotlight
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
  record. `tick(room, now)` moves time: each phase ends at `endsAt`, or early when every present player is ready.
  Phases: `lobby -> [crisis -> select -> reveal -> negotiate -> resolve] x3 -> final -> lobby`.
- The engine (`shared/src/game/engine.ts`) is pure and deterministic. `resolveRound` writes every effect to a `RuleEvent`
  with a rule id (P1, R1, C1, …, listed in `coastal-clash.md` §4). The same engine runs on the client only for the
  negotiation preview.
- Side effects never run inside `rooms.ts`. It pushes `Effect`s (`record`, `reveal`, `resolved`, `final`) and
  `roomSocket.ts` drains them: it saves the `MatchRecord` and asks Gemini for a headline. The Gemini line replaces the
  template line only if `headline.key` is still current, and it is thrown out if it contains a number that is not in the facts.
- Planning Studio reads saved records. `studioSummary()` in `record.ts` computes every finding, each with refs to the
  records behind it. Gemini only rewords the findings (`/api/studio/brief`).

## 4. Recipes

Before each: write or adjust a test first where you can. After each: run §5.

### Change a number (timing, cost, effect size, threshold)
- Phase lengths: `shared/src/config.ts` `PACES`.
- Influence, start indicators, viability floor, storm test: top and bottom of `game/content.ts`.
- Card cost and project effects: `CARDS` / `PROJECTS` in `content.ts`. **Also update the card's `rule` text**, which is what players read.
- Geography thresholds: `GEO_RULES` in `districts.ts`. Update the thresholds in `coastal-clash.md` §3 too.
- Bump `RULES_VERSION` in `content.ts` for any rules change, so saved records stay comparable.

### Add or change a card
1. `content.ts`: add the id to the `CardId` union and an entry in `CARDS` (persona, category, cost, art emoji, text,
   rule, tradeoff, `project` or `acts` + `fallback`, `refs`). A test expects **exactly three cards per persona**: swap a
   card, or change that test on purpose.
2. Non-project cards: add a `case` to the attachment `switch` in `resolveRound`, and log a `RuleEvent` with a new or existing rule id.
   If it offers a compromise, add it in `buildBoard` (see `public-access-guarantee`).
3. Bots: add it to `BOT_PREFS` at the bottom of `engine.ts`.
4. Tests: a clash test in `shared/src/game/engine.test.ts`. Document a new rule id in `coastal-clash.md` §4.
5. Bump `RULES_VERSION`.

### Add a project kind
`ProjectKind` + `PROJECTS` (content.ts), a `case` in `projectEligibility` (districts.ts), the marker in `FEATURE_ICON`
(`app/src/map/CityMap.tsx`), and any persona bonus in `finalResult`. TypeScript flags the exhaustive switches/records you miss.

### Add or move a playable area
1. `pipeline/miami-beach.ts`: add to `AREAS` (id, name, blurb, focus box `[w, s, e, n]`, shore).
2. `npm run data` (the first run fetches from the live City and County GIS services; later runs use `pipeline/cache/`).
3. Commit the regenerated `shared/src/data/districts.json` and `app/public/data/miami-beach/*.geojson`.
4. Check the measured shares against the game rules (which cards are now allowed where), update the table in
   `coastal-clash.md` §3, and fix the engine tests that name four areas.
5. Crisis spotlights (`CRISES` in content.ts) refer to area ids.

### Add or change a crisis
`CRISES` in `content.ts` (one per round, `round` 1..`TOTAL_ROUNDS`). `spotlight` = area ids, `bonus` = rule K1.

### Add a player action (protocol change)
1. `shared/src/room.ts`: add to `ClientMsg` (and to `RoomState` if clients need to see it). This is a contract: say so in the commit.
2. `server/src/rooms.ts`: an exported function that checks the phase and throws `RoomError` with a readable message.
3. `server/src/roomSocket.ts`: a `case` in the dispatch `switch`.
4. `app/src/room/useRoom.ts`: a sender on the `Room` interface. Then the UI in `game/panels.tsx`.
5. A test in `server/src/rooms.test.ts`.

### UI work
- Each phase's panel is in `game/panels.tsx`. The page shell is `routes/Play.tsx` (it switches at 1024 px: `useWide`).
- The UI only shows what the server sends. Never compute an outcome in a component; call the shared engine (as the negotiation preview does) or show `state`.
- Indicator values are illustrative and budgets hypothetical: keep the label next to any number you add.
- Theme: reuse classes in `styles.css` (`glass`, `aero-btn`, `chip`, …) and colors from `tokens.ts`.

### Integrations (Gemini, ElevenLabs, Tiger Data)
Each one is optional and must fail soft. Follow the existing pattern: a `ready()` check, a timeout, and a template or
memory fallback. A new Gemini prompt must include `GROUNDED` and a `check` that rejects stray numbers (`strayNumbers`).
Schema changes go in `server/src/db/schema.sql`, written idempotently (`IF NOT EXISTS`), with tables prefixed `cc_`.

## 5. Before you call it done

- [ ] `npm run typecheck` passes.
- [ ] `npm test` passes (on Node 20.19+/22.12+).
- [ ] UI changes: played through in the browser at **1440 px and 390 px** wide (a bot-filled Demo room is fastest).
- [ ] No outcome or number invented in the UI or an LLM prompt. New numbers are labelled illustrative/hypothetical.
- [ ] Role-play, personal preference, demo vs community sessions and bots are still kept apart in records.
- [ ] Contract changes (`room.ts`, `engine.ts` types, `record.ts`) are called out in the commit; `RULES_VERSION` bumped for rule changes.
- [ ] Docs updated if you changed rules, areas or setup (`coastal-clash.md`, this file, the skill).

## 6. Git workflow

- Branch from `aum/coastal-clash` (the integration branch for this game) as `<name>/dev` or `<name>/<topic>`.
  `aum/dev` holds the older ReefForge project; do not merge between them.
- Commit small with a message that says what changed and why. Pull and rebase often: `content.ts`, `engine.ts` and `panels.tsx` are where people collide.
- Never commit `.env`, `pipeline/cache/` or `node_modules/`.

## 7. Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `require() of ES Module …cookie…` in `rooms.test.ts` | Node too old for `require(esm)`. Use Node 22.12+ (or 20.19+). |
| "Room not found" on a join link | Rooms live in server memory: a server restart (including `tsx watch` reloading after an edit) clears them. Open a new room. |
| Phones cannot join | They must be on the same network. Check `/api/join-base`; set `PUBLIC_URL` to a tunnel when the LAN is locked down. |
| No AI headline / no voice | Expected without `GEMINI_API_KEY` / `ELEVENLABS_API_KEY`. `/api/health` shows what is on. |
| Studio is empty after a restart | The memory store is not persistent. Set `DATABASE_URL` for Tiger Data. |
| `npm run data` fails | The GIS services are down or rate-limited. Run it without `--refresh` to use the cache; the committed data still works. |

## 8. Deploying

There is one Docker service (`Dockerfile`): the server serves the built app, `/api` and `/ws`. `render.yaml` is a Render Blueprint
with a health check on `/api/health`. Keys are set in the host's environment, never in the image.
