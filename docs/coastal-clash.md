# Coastal Clash: design, audit and demo

## 1. Audit of the code we started from

Both earlier projects were available locally: Pocket Rivals at `~/Documents/Projects/hackdays` (github.com/darshrank/pocket-rivals) and Mayday Mayor at `~/Documents/Projects/wolfhacks` (github.com/darshrank/ready-raleigh). Mayday Mayor had already absorbed Pocket Rivals' room pattern, and this repo (`aum/dev`) already carried Mayday's structure for ReefForge. Coastal Clash is built on branch `aum/coastal-clash`; ReefForge is untouched on `aum/dev`.

### Pocket Rivals (2-player, Express + socket.io, vanilla JS)

| Module | Verdict | Where it went |
|---|---|---|
| `server/rooms.js`, phase machine in `server/game.js` (sync actions validate input, an async step advances) | **Reused as a pattern** (already ported into Mayday's `rooms.ts`) | `server/src/rooms.ts`: crisis, select, reveal, negotiate, resolve, final |
| LAN address and QR join (`server/index.js`) | **Reused** (via Mayday) | `server/src/net.ts`, `app/src/room/Invite.tsx` |
| `server/combat.js`: "Gemini classifies, code decides, every effect leaves an event line" | **Modified**: kept the principle, replaced combat with planning rules | `shared/src/game/engine.ts` (rule event log, deterministic) |
| Two-card combos, stance triangle | **Modified** into authored card interactions and compromises | Rules R1, O1-O3, C1-C3, F1-F3 |
| `public/fx.js` choreography (projectile to target, stamp, floating numbers) | **Modified** for React and a map | `app/src/game/Flights.tsx` (card flights to real places, verdict stamps), `Hud.tsx` (indicator deltas) |
| Card CSS (deal, stamp animations) | **Restyled** in Frutiger Aero | `app/src/styles.css` |
| Mock-AI fallback in `server/ai.js` | **Reused as a pattern** | template narration in `shared/src/game/narrate.ts` |
| Camera scan, scribble canvas, battle-cry recording, image forging, HP/ATK/TRK/GRD, cry-off, socket.io, self-signed TLS | **Discarded** | Not relevant to planning; raw `ws` already in place |

### Mayday Mayor (Vite + React, Fastify + ws, shared TS engine)

| Module | Verdict |
|---|---|
| Rooms over raw WebSockets, resume by secret id, host hand-off, server clock offset (`rooms.ts`, `roomSocket.ts`, `useRoom.ts`) | **Reused**, protocol rewritten for four personas; added an 8 s reconnect grace |
| Gemini client with timeouts, model fallback and the `GROUNDED` rule (`ai/gemini.ts`) | **Reused unchanged**; narrator adds a number check |
| ElevenLabs TTS with disk cache (`voice.ts`, `ui/voice.ts`) | **Reused**: optional "read the news aloud" |
| Tiger Data store with `failSoft` memory fallback, idempotent schema | **Reused**, new `cc_` tables and a decisions hypertable with a continuous aggregate |
| Web Audio synthesized sounds (`ui/sound.ts`) | **Reused**, plus deal, reveal, approved, blocked and tick sounds |
| Production serving, Dockerfile, Render blueprint | **Reused** |
| MapLibre/deck.gl flood city, H3 cells, optimizer, Solana civic record | **Not reused**: the game board is a lean MapLibre view of real layers; Solana is out of scope |
| Planner view (top places, consensus, exports) | **Reused as a design**: Planning Studio |
| Frutiger Aero theme (from ReefForge on this repo) | **Reused** |

## 2. Architecture

```
pipeline/miami-beach.ts       ArcGIS REST -> cache -> app/public/data/miami-beach/*.geojson + shared/src/data/districts.json
shared/src/game/content.ts    personas, 12 cards, indicators, crises (authored, versioned RULES_VERSION)
shared/src/game/districts.ts  playable areas (real measurements) and geographic eligibility
shared/src/game/engine.ts     buildBoard (reveal) -> resolveRound (deterministic, rule event log) -> finalResult; bots
shared/src/game/record.ts     MatchRecord, Planning Studio aggregation, CSV/GeoJSON export
server/src/rooms.ts           authoritative state machine; roomSocket.ts drains effects (save, narrate)
server/src/studio.ts          /api/studio, /api/matches/:id, /api/studio/export.{json,csv,geojson}, /api/studio/brief
app/src/routes                Landing, Play (game screen), Studio
```

One server, one source of truth. The client never decides anything; the negotiation preview runs the same shared engine on the public table.

## 3. Real data and the modelling rule

Playable areas are focus boxes around real places; each area is the union of the City zoning polygons whose centroid lies in the box. Facts are measured on a 20 m point grid: FEMA zone shares, zoning shares, median base flood elevation, and the share of a 100 m band around the area in FEMA VE (coastal high hazard).

| Area | Planning district | In FEMA 1% flood area | VE band | Hotel/commercial zoning | Residential zoning |
|---|---|---|---|---|---|
| South Pointe | South Beach | 96% | 43% | 31% | 39% |
| West Avenue Bayfront | South Beach | 100% | 0% | 90% | 59% |
| Collins Avenue, Mid-Beach | Mid Beach | 91% | 11% | 67% | 84% |
| North Beach Oceanside | North Beach | 58% | 16% | 24% | 15% |

Game rules on these numbers: a hotel needs at least 25% hotel/commercial zoning (North Beach fails), home elevation needs at least 20% residential zoning and at least 50% in the 1% flood area (North Beach fails), drainage needs at least 50% in the 1% flood area, and an Environmental Challenge **blocks** a hotel outright where the VE band is at least 15% (South Pointe, North Beach) but only adds opposition elsewhere.

Real layers decide context and constraints. Effect sizes are **illustrative scenario values**; budgets are **hypothetical**. Neither is a prediction, and the UI and exports say so.

## 4. Live crises

Every match gets a fresh scenario. At start the server reads NOAA CO-OPS Virginia Key (8723214): the latest water level, the week's predicted highs and NOAA's flood thresholds, converted to MLLW. It also reads the NWS forecast for Miami Beach. Gemini then writes three crises from those readings and the area facts. For each one it chooses a kind (flooding, development pressure, storm, beach erosion, budget crunch), one or two spotlight areas, the words, and which live readings to show. It also writes one line per card in its persona's voice. What each kind does (its K1 bonus) is authored, so outcomes stay deterministic. A scenario is thrown away if any number is not in the facts or any id is unknown, and the authored scenario, carrying the same live readings, stands in. Round 1 waits up to 10 s for the desk.

## 5. Rules in one page

**Decks and hands (rules 2.0.0).** Each stakeholder has a deck of 6 cards; each crisis deals an authored hand of 4 (`HANDS` in
`content.ts`), so matches stay short and replays need no randomness. Cards belong to a family (Infrastructure, Economic
development, Environmental, Civic/political, Negotiation), show their influence cost and public $ cost, list what answers them
(`counters`) and which authored combos they complete. New projects: seawall (needs at least 50% in the 1% flood area), dune
restoration (Atlantic shore only), marina (Biscayne Bay shore and at least 25% hotel/commercial zoning: West Avenue only), workforce
housing (at least 20% residential zoning). Drainage and seawalls cost $1M upkeep in every later round (U1). Some cards carry a
delayed consequence one round later (Resilience Bond: -$3M; Lobbying Blitz: -2 access; L0 schedules it, L1 applies it; anything
owed after round 3 is settled before the storm). Authored combos (M1-M5, plus the C3 grant match) add a small bonus when their
pairing is approved: Public-Private Flood Partnership, Eco-Resort Agreement, Hybrid Shoreline, Neighborhood Resilience Package,
Working Waterfront.

Each round: one card per player (cost in influence; start 5, +2 per round, max 8). Project cards create proposals; support, opposition and negotiation cards act on the best-matching proposal in the same area (or fall back to a small effect or a refund). Negotiation: one move each (back 1, oppose 1, fund 2) and the proposal's owner may accept compromises offered by Public Access Guarantee (access corridor) or by an Environmental Challenge in a coastal high hazard area (dune setback). Resolution: support minus opposition decides (ties are delayed to the next round; Fast-Track breaks a tie and ignores one opposition but never overrides R1), then funding (budget, or covered by Emergency Funding, Private Investment or a fund move), then effects plus the crisis bonus. After round 3 the storm tests flood resilience. Each persona scores its own weighted indicator changes plus objective bonuses; if any of flood, economy, environment or access ends below 30, every positive score is halved.

Rule ids in the event log: P1 proposal, F1-F4 funding/fast-track/bond, S1-S5 support, O1-O7 opposition (O4 moratorium, O5 habitat survey, O6 rent shield, O7 eco-certification refused), R1 coastal high hazard block, C1-C4 compromises, M1-M5 combos, N1-N3 negotiation, V1 vote, B1-B2 budget, U1 upkeep, L0/L1 delayed consequences, K1 crisis bonus, E1 built, X1-X2 fallbacks, S9 storm; D1 a validated twist event (stored in the round's `director` record).

## 4b. The living city and the AI Game Director

**On the map.** Each stakeholder is a small SVG character standing near the area they played in. A Fisherman (a non-player
scenario role) stands at the South Pointe pier. Characters walk, celebrate, protest and worry, and speak in short speech bubbles. Proposals show as
ghost markers whose tag follows the live preview (proposed, would pass, delayed, blocked). Built projects, protests, investments,
floods, storms and combos have short effects. All of this is decorative: positions are pixel offsets around an area, not surveyed sites.

**The Director** (`server/src/ai/director.ts` proposes, `shared/src/game/director.ts` validates, `server/src/rooms.ts` applies):

| Job | What Gemini may do | What decides |
|---|---|---|
| Speech bubbles | One 3-18 word line per character, from a fixed reaction list | `validateDialogue`: known speaker on the map, known reaction, length, no invented numbers, safe words. The template line stays otherwise. |
| Twist event (rounds 2 and 3) | Pick a type, a place, a magnitude 1-3, write a one-line narrative | `validateEventProposal`: type enum, phase, once per type, at most 2 per match, real-geography eligibility (e.g. an algae bloom only on the bay), magnitude clamped, narrative without numbers. Effects come from the `DIRECTOR_EVENTS` catalogue (rule D1), never from the model. |
| Negotiation hints | Word hints and explain combos | The engine finds every move that flips an outcome (`negotiationCandidates`) and every authored combo within reach (`combosInReach`). Gemini can only pick from those. Hints are public: everyone sees the same ones, built from `publicState(room, null)`. |
| Explanations | Reword the engine's answer in plain language | `explainEligibility` / `explainOutcome` from the rules and GIS facts. A rewording with a number not in the facts is refused (`POST /api/explain`). |
| Novel combo ideas | Suggest one | Never executed: stored in `MatchRecord.reviewQueue` for a designer. |

Templates are on screen first. Gemini answers replace them only if they validate and the moment is still current. The twist for the
next round is prefetched during the resolution, so it is ready when the crisis starts. Every call times out after 8 s and fails soft.
Each round record stores the accepted twist with its exact values, every hint shown and whether a player followed it, and a log of every
proposal with its status (accepted, clamped or rejected) and reasons. `replayMatch(record)` re-runs a match from the record alone,
without Gemini.

## 6. Records and Planning Studio

A match record holds the session id, scenario, rules and data versions, data sources, session kind (demo or community), players (human or bot), every round's proposals, attachments, compromises, negotiation moves, outcomes and rule events with before/after indicators, the final result, and personal preferences. It is saved after every round, at the end and on every answer (Tiger Data `cc_matches` + `cc_decisions` hypertable, or memory). Studio findings are computed from the records and each lists the record ids it comes from; Gemini may only reword them into a brief.

## 7. Two-minute demo script

| Time | On screen | Say |
|---|---|---|
| 0:00 | Landing: Miami Beach on satellite with FEMA VE/AE zones. Tap South Pointe: its measured profile. | "This is a real city, and these are real planning constraints." |
| 0:15 | Host a room (Demo pace); three phones join as Activist, Resort Owner, Resident. | "Four stakeholders, four agendas." |
| 0:30 | Round 1 crisis, written live from today's tide gauge and forecast. Then (round 2, or skip to it) Resort drags Hotel onto South Pointe, Activist plays Environmental Challenge, Mayor plays Fast-Track, Resident plays Public Access Guarantee. Cards fly to South Pointe. | "Everyone plays on the same neighborhood." |
| 0:55 | Negotiate: preview shows BLOCKED (R1: South Pointe borders a FEMA VE zone). Resort accepts the dune setback and the access corridor; preview flips to APPROVED. | "The geography is real; the deal is theirs." |
| 1:20 | Resolve: APPROVED stamp, hotel, setback and access pins appear, indicators move, the Gemini news line plays. Show the rule trace. | "Every outcome shows the rules that produced it." |
| 1:40 | Final: the honest question. Then Planning Studio: hotspot on South Pointe, compromises accepted, in-role vs personal preference, CSV with coordinates and zoning ids. | "Every match becomes geographically linked feedback planners can explore." |

## 8. What is next (P3)

More cities and scenarios, a Fisherman persona for working-waterfront decisions, more cards per persona, ElevenLabs persona voices, richer layers (NOAA sea level rise), and a richer negotiation.
