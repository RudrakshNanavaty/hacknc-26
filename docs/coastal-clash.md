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
shared/src/game/content.ts    personas, 24 cards (6 per deck), HANDS, projects, COMBOS, indicators (`coastal-clash-rules/2.0.0`)
shared/src/game/districts.ts  playable areas (real measurements) and geographic eligibility
shared/src/game/scenario.ts   crisis kinds (authored K1 bonuses), live readings, the authored scenario, scenario checks
shared/src/game/engine.ts     buildBoard (reveal) -> resolveRound (deterministic, rule event log) -> finalResult; bots
shared/src/game/living.ts     the Fisherman (scenario role), reaction vocabulary, template speech bubbles
shared/src/game/director.ts   Game Director validators, twist catalogue (D1), engine-found hints and combos, explanations
shared/src/game/economy.ts    previews that match the engine, the next round's bill, affordability, agreementPreview
shared/src/game/money.ts      wallets, debts, scheduled payments, reserves and the ledger (integer cents); Books moves money
shared/src/game/agreements.ts the five authored agreements' terms (fixed at the reveal), committed money, checkFund/checkAfford
shared/src/game/cardfacts.ts  every card face derived from the rules (cost, whose money, effects, needs, deal, counters)
server/src/bank/              the Nessie mirror: nessie.ts (client), mirror.ts (provision, outbox, reconcile), store.ts
shared/src/game/record.ts     MatchRecord, replayMatch, Planning Studio aggregation, CSV/GeoJSON export
server/src/live.ts            NOAA Virginia Key tide gauge + NWS forecast (cached, fail soft); GET /api/live
server/src/ai/scenario.ts     the scenario desk: Gemini writes each match's crises and card quips (checked)
server/src/ai/director.ts     the Game Director: dialogue, twists, hint wording, explanations (proposes only)
server/src/rooms.ts           authoritative state machine; roomSocket.ts drains effects (save, narrate, scenario, director)
server/src/studio.ts          /api/studio, /api/matches/:id, /api/studio/export.{json,csv,geojson}, /api/studio/brief
app/src/map                   CityMap + basemap (tilted 3D street map, FEMA water), LivingLayer + sprites (avatars, bubbles, fx)
app/src/game                  screens (one per phase), Deck, GameCard, Hud, ui (Aero Lagoon pieces), insights (Director/economy UI)
app/src/routes                Landing, Play (the stage: map arena + lagoon column), Studio
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

The crisis moment (headline, the characters' first lines, and in rounds 2 and 3 the round's twist) starts when the crisis is on
screen, so a scenario that arrives late still gets all of it. The fallback twist fits the crisis kind and stays in its spotlight
where the real facts allow (section 6).

## 5. Rules in one page

**Decks and hands (rules 2.0.0).** Each stakeholder has a deck of 6 cards; each crisis deals an authored hand of 4 (`HANDS` in
`content.ts`), so matches stay short and replays need no randomness. Cards belong to a family (Infrastructure, Economic
development, Environmental, Civic/political, Negotiation), show their influence cost and public $ cost, list what answers them
(`counters`) and which authored combos they complete. New projects: seawall (needs at least 50% in the 1% flood area), dune
restoration (Atlantic shore only), marina (Biscayne Bay shore and at least 25% hotel/commercial zoning: West Avenue only), workforce
housing (at least 20% residential zoning). Drainage and seawalls cost $1M upkeep in every later round (U1). Some cards carry a
delayed consequence one round later, due only if the proposal they backed is approved (Resilience Bond: -$3M; Lobbying Blitz:
-2 access; L0 schedules it, L1 applies it; anything owed after round 3 is settled before the storm). Authored combos (M1-M5, plus the C3 grant match) add a small bonus when their
pairing is approved, and are recorded with the round: Public-Private Flood Partnership, Eco-Resort Agreement, Hybrid Shoreline, Neighborhood Resilience Package,
Working Waterfront.

Each round: one card per player (cost in influence; start 5, +2 per round, max 8). Project cards create proposals; support, opposition and negotiation cards act on the best-matching proposal in the same area (or fall back to a small effect or a refund). Negotiation: one move each (back 1, oppose 1, fund 1 influence **plus the project's public cost from the mover's own wallet**) and the proposal's owner may accept (or decline) compromises and money agreements offered to them (§10). Resolution: first this round's bill (delayed consequences L1, scheduled payments U2/U3, upkeep U1); then support minus opposition decides (ties are delayed to the next round; Fast-Track breaks a tie and ignores one opposition but never overrides R1); then funding, paid once by the first source that can pay: the proposer's own capital for hotels and marinas, else an emergency grant (F1), a bond (A2), an accepted partnership (A1), a player's fund move (N3), the public budget (B2), or it stays unfunded (B1); then the other agreements' money, then effects plus the crisis bonus. After round 3 everything still scheduled is settled and the storm tests flood resilience. Each persona scores its own weighted indicator changes plus objective bonuses (the Mayor loses 1 per $2M still owed, the Resort Owner gains 1 per $4M of capital left); if any of flood, economy, environment or access ends below 30, every positive score is halved.

Rule ids in the event log: P1 proposal, F1-F3 grant/fast-track/private backing, S1-S5 support, O1-O7 opposition (O4 moratorium, O5 habitat survey refused, O6 rent shield, O7 eco-certification refused), R1 coastal high hazard block, C1-C4 compromises, M1-M5 combos, N1-N3 negotiation (N3: a fund move, and its payment), V1 vote, B1 unfunded, B2 paid, B3 arrears, B4 a payer who cannot pay (the agreement is void), U1 upkeep, U2 bond installment, U3 partnership availability payment, A0 an offer refused (no money), A1-A5 agreements (partnership, bond, restoration, conditional investment, maintenance reserve), L0/L1 delayed consequences, K1 crisis bonus, E1 built, X1-X2 fallbacks, S9 storm; D1 a validated twist event (stored in the round's `director` record). Rules version `coastal-clash-rules/3.0.0`.

## 6. The living city and the AI Game Director

**On the map.** Each stakeholder is a small SVG character standing near the area they played in. A Fisherman (a non-player
scenario role) stands at the South Pointe pier. Characters walk, celebrate, protest and worry, and speak in short speech bubbles. Proposals show as
ghost markers whose tag follows the live preview (proposed, would pass, delayed, blocked). Built projects, protests, investments,
floods, storms and combos have short effects. All of this is decorative: positions are pixel offsets around an area, not surveyed sites.
The characters' crisis lines are keyed by crisis kind, so they fit whatever scenario the desk wrote.

**In the Aero Lagoon screens** (`app/src/game/insights.tsx`): the crisis screen shows the round's twist card (game fiction, its
effects from the catalogue); the card screen adds the card's trade-off, what answers it, its combos and any delayed consequence, a
before/after preview with warnings, and "Why here? / Why not here?"; the duel shows "if it passes" and the public table hints with
"Do it"; the result screen shows completed combos and "Explain in plain words"; the podium has a round-by-round recap; the meters
tween and carry "this round's bill" (upkeep and delayed consequences).

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

## 7. Records and Planning Studio

A match record holds the session id, scenario, rules and data versions, data sources, session kind (demo or community), players (human or bot), every round's crisis (as written for the match), proposals, attachments, compromises, negotiation moves, outcomes, combos and rule events with before/after indicators, the final result, and personal preferences. It also keeps where the scenario came from and the live readings it used (`scenarioSource`, `live`), each round's Director record (the applied twist with exact values, every hint shown and whether a player followed it, every AI proposal with accepted / clamped / rejected and why), and a review queue of AI combo ideas that were never played. It is saved after every round, at the end and on every answer (Tiger Data `cc_matches` + `cc_decisions` hypertable, or memory). Studio findings are computed from the records and each lists the record ids it comes from; Gemini may only reword them into a brief.

Planning Studio keeps the AI apart from opinion data: an "AI Game Director" panel (twists by source, AI proposals by status, hints shown and followed, the review queue) is labelled game fiction and never feeds the findings. Each match's timeline shows its twists and combos and a replay check: `replayMatch` re-runs the record through the engine and must reproduce it (compared by value, so a store that reorders keys still matches; a record made under other rules is reported as not comparable rather than different). The CSV, GeoJSON and `cc_decisions` exports carry each round's twist as its own `twist_event` row, marked `fictional`, with its source and effect, so outcomes a twist changed are never read as player decisions alone. Studio's counts leave bots out (unless included) consistently: areas, in-role proposals, cards and combos.

## 8. Two-minute demo script

| Time | On screen | Say |
|---|---|---|
| 0:00 | Landing: the tilted 3D street map of Miami Beach with FEMA VE/AE zones as water. Tap South Pointe: its measured profile. | "This is a real city, and these are real planning constraints." |
| 0:15 | Host a room (Demo pace); three phones join as Activist, Resort Owner, Resident (or add bots). | "Four stakeholders, four agendas." |
| 0:30 | Round 1 crisis, written live from today's tide gauge and forecast. The characters gather on the map and react in speech bubbles; the Fisherman grumbles from the pier. | "The city is alive, and so are the people in it." |
| 0:45 | Round 2 (or skip to it): the twist card (game fiction, sized by the rules). Resort drags Hotel onto South Pointe, Activist plays Environmental Challenge, Mayor plays Fast-Track, Resident plays Public Access Guarantee. Cards fly; the avatars walk to South Pointe. | "Everyone plays on the same neighborhood." |
| (money cut) | Instead of the hotel: the Mayor's seawall on West Avenue that the $3M budget cannot cover (preview: "a grant, a bond, a partner or a player must pay"). The Resort Owner's Private Investment puts a public-private partnership on the table ($7M now, $2M availability payment later); the Activist's Habitat Survey offers a restoration partnership; the neighbors petition. The hint (engine-found, Gemini-worded) says accepting the habitat clause flips it; the Mayor accepts both; RESOLVE: approved, paid by Resort capital, the ledger toasts show A1 and A3, the 📒 ledger shows each entry "mirrored" to Nessie, the avatars celebrate. | "Money changes hands only through rules: the bank mirrors the books, it never writes them." |
| 1:00 | Negotiate: the verdict pill shows BLOCKED (R1: South Pointe borders a FEMA VE zone). A table hint says accepting the dune setback flips it; the Resort taps "Do it"; the verdict flips to APPROVED; "Combo in reach: Eco-Resort Agreement". | "The engine finds the deal; the players take it." |
| 1:20 | Resolve: APPROVED stamp, the combo banner, the hotel, setback and access pins, the meters count up, the avatars celebrate. Tap "Explain in plain words". | "Every outcome shows the rules that produced it." |
| 1:40 | Podium with the round-by-round recap, the honest question, then Planning Studio: hotspots, compromises, in-role vs personal preference, the AI Director panel apart from the findings, the replay check, CSV with coordinates and zoning ids. | "Every match becomes geographically linked feedback planners can explore." |

Without a working Gemini key (no key, or a key out of credit) the same demo runs on the authored scenario, template bubbles,
template twists and engine-worded hints: nothing is skipped.

## 9. What is next (P3)

More cities and scenarios, the Fisherman as a playable fifth seat (today a non-player role), ElevenLabs persona voices, richer layers (NOAA sea level rise), designer review of the AI combo ideas queue, and balance tuning of the 24 cards and the money (start budget, wallets, agreement amounts) from recorded community sessions. Open bugs and limits: `docs/progress/coastal-clash-evolution.md`.

## 10. Money, agreements and the Nessie mirror (rules 3.x)

All money is **simulated and illustrative**: hypothetical dollars, fictional accounts, no real financial data.

**Resources are separate.** Influence pays for cards and negotiation moves only. The **public budget** (the city wallet; the
budget meter always equals it) pays public projects, upkeep and installments. **Private capital** (Activist $4M, Resort Owner $20M,
Resident $3M at the start) pays its owner's own projects (hotel $6M, marina $4M) and the agreements they sign. **Debt** is what the
city owes a simulated lender (bonds, and arrears). **Operating costs** (U1 upkeep, U2 installments, U3 availability payments) are
charged at the start of every later round. Start budget $16M. Wealth never buys past geography: eligibility, R1 blocks and the
vote are unchanged by money.

**The ledger is authoritative.** `shared/src/game/money.ts` keeps wallets, debts, scheduled payments, maintenance reserves and every
movement in integer cents (all authored amounts are whole $M). Money moves only through `Books`: a payment the payer cannot cover is
refused (no overdraft, no entry); a bill the city cannot pay is covered by the lender and owed as arrears (B3). Only the simulated
lender and grants (outside money) may go below zero. Entry ids are deterministic (`r{round}-m{n}`, twists `r{round}-t{n}`), so
replays compare money by value.

**Agreements** are authored deals that ride on existing cards, as compromises with `terms` fixed at the reveal (no free-form deals):

| Card | Agreement | Who pays now | Strings | Accepted by |
|---|---|---|---|---|
| Private Investment (on a public project) | A1 Public-private partnership | Resort capital: the whole public cost | city pays $2M back in each later round (U3); +1 economy | the proposal's owner |
| Resilience Bond | A2 Resilience bond | the lender: the public cost | city repays cost + 25% in up to two installments (U2) | the Mayor alone (their signature) |
| Habitat Survey | A3 Restoration partnership | Dunes fund: $1M habitat works | +3 environment if built; refused: +1 opposition | the proposal's owner |
| Community Benefits Pledge | A4 Conditional investment | Resort capital: $2M into the budget, only if built | +2 access, −1 economy | the owner (at once on the Resort's own) |
| Flood Watch Brigade (drainage, seawall) | A5 Maintenance reserve | Neighborhood fund: $1M into a reserve | the reserve pays upkeep before the budget | the proposal's owner |

Money moves only if the project is approved and the payer can pay at that moment (else B4: void). A funding agreement made
unnecessary by an earlier source is `not-needed` and carries no strings. A wallet cannot promise money twice: accepting or funding
beyond what it has not already promised on the board is refused, and accepting twice is refused. Every result is in
`Resolution.agreements`, every movement in `Resolution.ledger`, and both are recorded per round.

**The Nessie mirror** (`server/src/bank/`, off unless `NESSIE_ENABLED=true` and a key are set; credentials server side only):

```
resolveRound (authoritative) -> room effect 'ledger' -> BankMirror.enqueue (idempotent by match:entry) -> outbox
  -> send: one transfer record on the payer's fictional account (bonds also as a loan record)
  -> confirmed | uncertain (timeout, network, 5xx) -> reconcile by reading the account for the [cc:match:entry] marker
     -> confirmed | pending (read and absent: safe to send again, attempt cap 4) | failed
```

- Turns never wait on it, and its status (`RoomState.bank`, `MatchRecord.bank`) sits beside the outcomes, never in them.
- Eight fictional customers ("CoastalClash <Wallet>", one `cc-sim:<wallet>` account each) are found by name and created once,
  then reused by every match. Pre-existing customers are never touched.
- Nessie (checked live 2026-10-11 at `https://prod-api.nessieisreal.com`): transfers have no payee field and never move balances,
  so the payee and the idempotency marker live in the description. Bills are not used.
- An auth error pauses the mirror until a restart. A refusal is final. Pending and uncertain items are stored in Tiger Data
  (`cc_bank_sync`, `cc_bank_accounts`) when `DATABASE_URL` is set, so they resume after a restart; in memory otherwise.
- Replays never call Nessie or Gemini: `replayMatch` is pure shared code (tested with the network forbidden).

**The Director and money.** Its facts carry the public money (budget, debt, wallets, the bill, scheduled payments, each deal's payer
and amount). It may react to money in bubbles, word the engine's deal hints ("If the Mayor accepts ... Resort capital pays $7M"),
and reword `POST /api/explain` with `kind: 'affordability'`, all through the existing validators: it cannot invent a move, a deal,
an amount, a loan or a transfer, and any number not in the facts is rejected.
