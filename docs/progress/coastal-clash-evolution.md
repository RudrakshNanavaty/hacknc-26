# Coastal Clash evolution: working notes

The brief has five milestones: living map (M1), AI Game Director (M2), card expansion (M3), economy and negotiation UX (M4), polish (M5).
This file is the source of truth if a session is cut off. **Re-read it before continuing.** Update it at the end of every milestone.

- Branch: `pratham/living-city`, made from `pratham/coastal-clash` (= `aum/coastal-clash` + a lockfile refresh + the docs commit).
- Local dev: `npm run dev` on Node 22 (`.node-version`). App on http://localhost:5173, server on http://localhost:8787 (`PORT` in `.env`).
  `.env` has GEMINI and ELEVENLABS keys, so AI runs live locally. The tests mock Gemini.

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
  Gemini scenario desk) and Aero Lagoon UI on branch `pratham/integrate-aum` (merge commit 3e5db65), made from `pratham/living-city`.
  Our panels.tsx (deleted upstream) was ported into his screens through `app/src/game/insights.tsx`. Crisis lines, twists, previews
  and replays now follow each match's crisis (kinds). Checked a full bot match at 1440 and 390 on the merged build (no console errors).
- [ ] Review findings: a 5-dimension review with adversarial verification ran on the pre-merge code (c83ba05); apply the confirmed
  ones to the merged code.

## Open questions for humans
- The Gemini key in `.env` returns HTTP 402 ("prepayment credits are depleted", 2026-10-11). Everything runs on templates until the
  AI Studio project is topped up. Live AI behaviour (bubbles, twists, hint wording, scenarios) was verified earlier the same night.
- Balance numbers for the 18 new cards, the combo bonuses, upkeep and twist magnitudes are first guesses (illustrative values);
  they need playtesting.
- Persona tone: the Mayor is now dry and pragmatic per the brief (was "overly dramatic"); the scenario desk prompt was aligned too.
