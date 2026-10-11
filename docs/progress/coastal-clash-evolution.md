# Coastal Clash evolution: working notes (history)

> **History only.** These are the notes for milestones M1-M5 on `pratham/coastal-clash`, kept for context. For the current state of
> this branch read [`map-board.md`](map-board.md). Setup below (npm, 390 px phone checks, the Fisherman) no longer applies.

The brief has five milestones: living map (M1), AI Game Director (M2), card expansion (M3), economy and negotiation UX (M4), polish (M5).

## Where things stand (2026-10-11, handoff)

- **Pushed:** `origin/pratham/coastal-clash` at the commit that adds this section. It holds all five milestones, the merge of
  `aum/coastal-clash` (3D street map, live crises, Aero Lagoon UI) and the review fixes. The work was done on the local branch
  `pratham/living-city` (same commits); the temporary `pratham/integrate-aum` worktree branch has been deleted.
- **Green:** `npm run typecheck` and `npm test` (92 tests). Full bot matches checked in the browser at 1440 px and 390 px.
- **Gemini key out of credit:** every call returns HTTP 402 ("prepayment credits are depleted"). Top up the AI Studio project;
  until then the scenario desk, narrator and Director run on their authored templates (the game is unaffected).
- **Next:** playtest the balance numbers; Aum to review the merge into his screens (`app/src/game/insights.tsx` holds our
  additions); decide the open questions at the end of this file. To pick up, read `AGENTS.md`, `docs/contributing.md`, then this file.
- Cleanup left for a human: the folder `../coastal-clash-integrate` (no longer a git worktree, held by a file lock) can be deleted.

## Setup

- Local dev: `npm run dev` on Node 22 (`.node-version`). App on http://localhost:5173, server on http://localhost:8787 (`PORT` in `.env`).
  `.env` holds the GEMINI and ELEVENLABS keys (see above for the Gemini credit). The tests mock every AI call and the live feeds.

## Baseline (2026-10-10, before any change)

| Check | Node 22.11.0 (machine default) | Node 22.23.3 (fnm) |
|---|---|---|
| `npm run typecheck` | pass | pass |
| `npm test` | 27/28: the WebSocket match test crashes, `require()` of ESM-only `cookie@2` from Fastify's `light-my-request` | **28/28 pass** |

The fix was environmental: `fnm install 22` and a `.node-version` file. No code change was needed.

## M0 audit: what is reused

- **Map:** `CityMap.tsx` already uses MapLibre HTML `Marker`s for chips and built-project pins, feature-state for highlights, `flyTo`,
  and a reduced-motion-aware spotlight. Avatars, bubbles and effects use the same Marker approach (no new dependency).
- **Animation:** `motion` (framer) is already in use in `Flights.tsx` (card flights, verdict stamps). The CSS keyframes are in `styles.css`.
- **Cards:** `GameCard.tsx`, `CARDS` in `content.ts`. The attachment `switch` in `resolveRound` is the place to extend.
- **AI:** `Gemini.json()` already does schema-constrained output, a timeout, model fallback and a `check` hook. `narrator.ts` uses
  `strayNumbers` plus a template-first, replace-if-current headline (`headline.key`). The Director copies this pattern exactly.
- **No zod in the repo:** the validators are hand-written in pure TS in `shared/` (testable, no new dependency).
- **Records:** `MatchRecord` lives in a JSON(B) row. New fields are optional, so old records still load.

## Plan and decisions

1. **Fisherman = non-player scenario role.** The game stays four players, with no change to seats, lobby or scoring. The Fisherman is an NPC
   avatar at the South Pointe pier who reacts and talks (template or Gemini). `SCENARIO_ROLES` makes roles swappable. Making him
   playable is P2. *Why:* a fifth seat would ripple through rooms, the lobby, scoring, Studio and the tests.
2. **Avatars:** inline SVG chibi sprites (big head, distinct silhouette props), MapLibre `Marker`s with pixel offsets around an area's
   center (decorative, not surveyed positions), CSS-transform animations, and `prefers-reduced-motion` respected. Moods come from a
   fixed reaction vocabulary in `shared/` that maps to CSS animation classes.
3. **Dialogue and reactions:** `RoomState.bubbles`. Deterministic template bubbles are set at every transition. Gemini lines replace them
   only if they validate and the moment is still current (the same pattern as headlines).
4. **Director events:** Gemini proposes `{type, district, magnitude, narrative}`. `validateEventProposal` (shared, pure) checks the type
   enum, phase, geography (real `districts.json` facts), the once-per-match rule and the bounds, then accepts, clamps or rejects it.
   A deterministic template event is the fallback. The accepted event (exact deltas) is stored in the round record, so a replay never calls Gemini.
5. **Hands:** authored, crisis-themed hands of 4 from a 6-card deck per persona (no randomness, so replays and tests stay deterministic).
6. **Combos:** authored templates detected by the engine (rule ids `M*`). Gemini only selects and explains them. Novel AI ideas go to `record.reviewQueue`.
7. **Hints are public:** every negotiation hint goes to the whole table, built from `publicState(room, null)`, so the model never sees hidden selections.

## Progress

- [x] Baseline, Node fix, docs, branch
- [x] **M1 living map** (commit "M1: living map"): `shared/src/game/living.ts` (roles incl. Fisherman NPC, reaction vocabulary,
  template bubbles), `RoomState.bubbles` (**contract change**), `app/src/map/{sprites.ts,LivingLayer.tsx}`, CSS in `styles.css`
  ("Living city" section), card-hover target highlight, the Flights stuck-card fix. Checked in the browser at 1440 and 390 (Playwright
  script in the session scratchpad: hosts a room, adds bots, screenshots each phase).
- [x] **M3 cards** (done before M2 on purpose: the Director's combo suggestions and context need the new cards).
  24 cards (6 per deck), authored crisis hands of 4, 4 new project kinds with real-geography eligibility, generic `attach`/`offer`/`delayed`
  card effects, upkeep (U1), 6 authored combos (M1-M5 + C3), `Resolution.combos`, `CityState.pending` (**contract changes**),
  `RULES_VERSION` 1.0.0 -> 2.0.0. UI: family label, $ badge, card detail with preview/counters/combos/delay, combo banner, card-driven map fx.
  Fixed: markers stacked because `.avatar`/`.fx` set `position` (overrides MapLibre); ghosts animated the marker root's transform.
  Design fixes found by tests: Working Waterfront paired two resort cards (unplayable), now marina + accepted Public Access Guarantee;
  Lobbying Blitz could only back resort projects, now also seawall/drainage/housing.
- [x] **M2 Director**: `shared/src/game/director.ts` (validators, twist catalogue, hints/combos from the engine, explanations,
  `strayNumbers` moved here and re-exported by `narrator.ts`), `server/src/ai/director.ts` (public-state facts, structured prompts,
  8 s timeouts), room functions `proposeEvent`/`proposeEarlyEvent`/`applyDialogue`/`applyHints`, `POST /api/explain`,
  `RoomState.event`/`hints` and `RoundRecord.director`/`combos`, `MatchRecord.reviewQueue`, `replayMatch` (**contract changes**).
  UI: twist card, table hints with Do it / dismiss, Why? buttons. Persona voices updated to the brief; `GROUNDED` no longer mentions reefs.
  Live check with the real key: Gemini bubbles, twist (Investor interest at Collins), and worded hints all arrived. The first run timed
  out at 5 s, so the timeout is now 8 s and the twist is prefetched during the previous resolution.
  Hints only cover players who can still act (bots are done at once).
- [x] **M4 economy UX**: `shared/src/game/economy.ts` (`projectPreview`, `upcomingCosts`; a test pins every preview to what the
  engine really does). UI: before/after preview box with warnings (budget short, upkeep, viability floor, spotlight), "If it passes"
  line on each negotiated proposal, a "This round's bill" chip in the HUD (upkeep + delayed consequences), tweened gauge numbers,
  deal badges on the map's proposal ghosts (🤝 accepted, 🤝? on the table). The three-round state machine is unchanged.
- [x] **M5 polish + Studio** (commit c83ba05): Studio "AI Game Director" panel (apart from findings), combos panel, timeline
  twists/combos/hint follow-through and a replay check; podium recap; camera follows the card's target.
- [x] **Integration with Aum's aum/coastal-clash (2026-10-11)**: merged his 3D street map, live per-match crises (NOAA + NWS +
  Gemini scenario desk) and Aero Lagoon UI (merge commit 3e5db65, now on `pratham/coastal-clash`).
  Our panels.tsx (deleted upstream) was ported into his screens through `app/src/game/insights.tsx`. Crisis lines, twists, previews
  and replays now follow each match's crisis (kinds). Checked a full bot match at 1440 and 390 on the merged build (no console errors).
- [x] **Review fixes (commit c87f2f7)**: a 5-dimension review (engine authority, AI safety/fairness, research integrity, rules/cards,
  UI) with one adversarial skeptic per dimension ran on c83ba05; 40 findings (26 of the first 31 confirmed by the skeptics, the rest fixed anyway as low-risk hardening), all fixed on the merged code with 12 regression tests.
  The highest-impact ones: the replay check compared JSON text (every Tiger Data/jsonb record would show "Replay differs"); AI text
  checks missed spelled-out numbers ("seventy-five percent"), inflected unsafe words, unsafe novel ideas and combo explanations; hints
  were capped in seat order (unfair); C3 was logged even when the shoreline failed; previews ignored this round's bill; "Explain"
  explained a delayed proposal's first verdict; card flights mis-landed while the camera moved; avatars took taps on phones.
  Design calls made while fixing (worth a human look): delayed consequences (bond payment, lobbying backlash) now come due only if
  the backed proposal is approved; a hint pitch must use a verb for its own move; twist narratives with real-news words fall back
  to the template; replays of rules-1.x records are reported as "not comparable".
- [x] **Readable at a glance (2026-10-11, `rdx/map-board`)**: one screen, one primary action, one short instruction.
  HUD: Flood safety (with the storm's 50 line) and City money big, the other meters in a City drawer that warns near the floor of 30;
  one instruction line under the round steps (`Steps.tsx` `instructionFor`). Crisis: a story chip replaces the big briefing; news crawl,
  TV text and speech bubbles go quiet while you choose or negotiate (bubbles one at a time, at most two a moment). Cards: art, name, one
  benefit, cost; the downside shows on the card you pick. Placement: suggested area (crisis bonus) without limiting others, compact
  confirm on the map with Lock it in / Change area / Change card, hand tucks away meanwhile. Deal: the case file shows the project, the
  likely outcome and only the valid moves, each previewed by running the engine with it (`fund` is labelled "Pay for it"; accepting a
  compromise is "Accept deal"). Results: one sentence per project (status, main up/downside, money, one reason) instead of full-screen
  stamps; the storm plays once. Sprint waits 3 s (not 10) for the live desk. `/fx-lab?storm=win|loss` plays the storm from an engine
  fixture (flood fixed at 62 / 38). Checked in the browser: turn-based at 1440x900 and 1280x720, sprint at 1280x720 (156 s).

- [x] **Beginner Mode (2026-10-11, branch `pratham/beginner-mode`, rules `coastal-clash-beginner/1.0.0`)**: a real mode, not labels.
  Code: `shared/src/game/beginner.ts` (rules), engine rules C5/O8, `server/src/rooms.ts` (`setMode`), `app/src/game/Beginner.tsx`,
  `app/src/routes/Plan.tsx` (`/plan/:matchId`). Tests: `beginner.test.ts` (13) and 4 Beginner room tests. Decisions and why:
  1. **One conflict a round** (`beginnerConflict`): one project, one proposer, one highlighted district; the crisis spotlight and its
     bonus (K1) are that district only. *Why:* five proposals in four districts was the main reason nobody could follow a round.
  2. **Stories only when they fit**: a documented story is used only if its own cast deals a project that (a) the real zoning and
     FEMA layers allow in its own district and (b) the story's text names (`storyIsAbout`: "pumps", "seawall", "tower"...). Else the
     round is an authored scenario and says so. *Why:* the walkthrough paired "Palms swapped for shade trees" with a beachfront hotel;
     legal on the map, false to the story. 20 of the 31 approved stories qualify.
  3. **2-3 cards, chosen for you** (`beginnerHand`): one for it, one against it, one condition on it, else another project the place
     allows; story cards first; every card is legal in the conflict's district, which is chosen for you. The proposer plays the project.
     *Why:* nobody has to read eligibility rules; every card answers the one question on the table.
  4. **No influence**: one card and one table move a round, free. Influence is untouched in the room (Advanced still uses it).
  5. **Support / Oppose / Suggest a Change**: real engine moves. Suggest a Change (`SUGGESTED_CHANGES`, one authored condition per
     project kind) is a compromise the owner may accept: accepted +1 support and its effect if built (C5), refused +1 opposition (O8);
     the same change asked twice is built once. Each move shows the engine's own preview ("+1 against → would be rejected").
  6. **Auto-settle**: Pay for it (`fund`) is not a Beginner move; upkeep, combos and delayed effects still run in the engine but the
     HUD shows only Flood safety (money is in the City drawer; no round bill, no influence pips). Money appears where it is the
     decision: the conflict card ("City pays $8M") and the result line ("city spent $7M").
  7. **Bots argue authored agendas** (`AGENDA`: for / against / change per stakeholder and project kind, from their written goals).
     *Why:* with weighted-score bots every table was 8-0 and no human choice mattered. A test plays every authored round from every
     seat and checks that backing passes the project and that some other choice changes the verdict, the conditions, who pays or the
     city's numbers. Two calls made while fixing: the Resident asks for beach access on hotels rather than fighting them (their deck's
     Public Access Guarantee), and condition cards get their own hand slot.
  8. **The end** (`beginnerEnd`): city viable or not, the storm, and one line per stakeholder goal (met or not, with the numbers). The
     weighted score is still computed and shown folded away as "Game scoring (Advanced points)".
  9. **City plan** (`/plan/:matchId`): replayed from the stored record through the engine; map of what was built; three columns kept
     apart: Documented (stories + sources, real place facts), Simulated (illustrative numbers, the storm), Decided (who proposed,
     backed, opposed, which changes were accepted). Copy-link to share.
  10. **Personal question**: one real decision (the most contested project), "Personally, not as the Resident: should Miami Beach
     build...?" yes / no / not sure. Stored as `PreferenceResponse.stance`; Civic Atlas and the summaries count only "yes" (or the old
     Advanced pick) as support; CSV gets a `stance` column. Bots never answer.
  - **Contracts**: `RoomState.mode/conflict`, `ClientMsg {t:'mode'}`, `respond.stance`; `MatchRecord.mode`, `PreferenceResponse.stance`;
    `NegotiationMove` gains `suggest`, `CompromiseKind` gains `change`. Beginner records carry `BEGINNER_RULES_VERSION` and replay
    through the same engine (`replayMatch` accepts both versions). The server default stays Advanced (old clients, tests); the
    lobby opens new tables in Beginner. Advanced rules, scores and records are unchanged (all earlier tests pass).
  - **Typography** (Beginner screens): four sizes as tokens (`--t-small` 14, `--t-body` 16, `--t-key` 20, `--t-title` 24, hero 32),
    two families (Varela Round titles, Nunito UI). Shared pieces are lifted to these sizes under `.stage[data-mode=beginner]`.
  - **Verified**: Beginner bot matches in tests (a human from each seat, a failed project, storm survived and lost by a deterministic
    fixture, a full Sprint on the clock under 4 minutes, replay with no mismatches). In the browser: turn by turn at 1440x900 (97 s of
    play) and Sprint at 1280x720 (135 s), including the personal question and the plan page.
  - **First-time walkthrough** (as the Resident, three bots). *Conflict:* what happened (story or scenario, labelled) and what is
    decided are clear; what to do next is one button. *Cards:* clear after relabelling ("For / Against / A condition on / Another
    project"); fixed a third card hidden under the panel at 1280x720. *Deal:* first run failed "why did my choice matter?" (8-0 tables,
    every preview "still would pass"); fixed by agendas, now previews flip. *Result:* the verdict, the reason and the accepted change are
    on the map. *End:* goals and the storm are clear; the plan link is the obvious next step.

### Beginner Mode usability test (for a human facilitator, first-time players, ~10 minutes)

Seat one first-time player as any stakeholder with three bots, Beginner Mode, Sprint. Do not explain anything. After the match ask:

1. "In your own words, what was the group deciding in round 2, and where on the map?" (Did the conflict card land?)
2. "When you picked your card, what did you expect it to do?" Then: "Did it?" (Card wording vs the result.)
3. "Tell me one thing that changed because of something *you* did." (Does a choice feel like it mattered?)
4. "Which parts of the story were real, and which were the game's guess?" (Documented vs simulated.)
5. "Would you show the city plan to someone? What would you tell them it shows?" (Purpose of the game.)

Note any moment the player stops for more than 5 seconds, reads a panel aloud, or asks "what do I do?".

## Open questions for humans
- The Gemini key in `.env` returns HTTP 402 ("prepayment credits are depleted", 2026-10-11). Everything runs on templates until the
  AI Studio project is topped up. Live AI behaviour (bubbles, twists, hint wording, scenarios) was verified earlier the same night.
- Balance numbers for the 18 new cards, the combo bonuses, upkeep and twist magnitudes are first guesses (illustrative values);
  they need playtesting.
- Persona tone: the Mayor is now dry and pragmatic per the brief (was "overly dramatic"); the scenario desk prompt was aligned too.
