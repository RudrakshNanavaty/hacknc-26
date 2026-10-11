# Coastal Clash evolution: working notes

The brief has five milestones: living map (M1), AI Game Director (M2), card expansion (M3), economy and negotiation UX (M4), polish (M5).
This file is the source of truth if a session is cut off. **Re-read it before continuing.** Update it at the end of every milestone.

## Where things stand (2026-10-11, handoff)

- **Pushed:** `origin/pratham/coastal-clash` at the commit that adds this section. It holds all five milestones, the merge of
  `aum/coastal-clash` (3D street map, live crises, Aero Lagoon UI) and the review fixes. The work was done on the local branch
  `pratham/living-city` (same commits); the temporary `pratham/integrate-aum` worktree branch has been deleted.
- **Green:** `npm run typecheck` and `npm test` (92 tests) on Node **20.19+ or 22.12+** (see `docs/contributing.md` §7 if the WebSocket match test fails on older 22.x). Full bot matches checked in the browser at 1440 px and 390 px.
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

## Open questions for humans
- The Gemini key in `.env` returns HTTP 402 ("prepayment credits are depleted", 2026-10-11). Everything runs on templates until the
  AI Studio project is topped up. Live AI behaviour (bubbles, twists, hint wording, scenarios) was verified earlier the same night.
- Balance numbers for the 18 new cards, the combo bonuses, upkeep and twist magnitudes are first guesses (illustrative values);
  they need playtesting.
- Persona tone: the Mayor is now dry and pragmatic per the brief (was "overly dramatic"); the scenario desk prompt was aligned too.

## Round 2: characters, cards, money and Nessie (M6-M10), branch `pratham/money`

Brief: make characters, cards and money one system, and mirror the money to the Capital One Nessie API (simulated banking).
Baseline (2026-10-11, Node 22.23.3): typecheck clean, 92/92 tests. No UI reference image was attached to the brief, so the
visual work follows the existing Aero Lagoon style.

### Decisions (one line each, with the reason)

- **The engine's ledger is authoritative; Nessie is a mirror.** `shared/src/game/money.ts` holds wallets, debts, scheduled
  payments, reserves and a ledger inside `CityState.treasury`; resolveRound moves money only through `Books`. Why: the
  invariant "the engine decides" already holds for the meters; money joins it, so replays and previews stay exact.
- **Integer cents, authored in whole $M.** `CENTS_PER_M = 1e8`. Why: minor units make money exact; whole-$M authoring keeps the
  existing `budget` meter an exact integer, now always equal to the city wallet (tested over a whole bot match).
- **Resources are separate.** Influence pays for cards and moves only; the public budget pays public projects, upkeep and
  installments; private capital (Activist $4M, Resort Owner $20M, Resident $3M) pays their own projects and agreements; debt
  is owed to a simulated lender; operating costs (U1 upkeep, U2 installments, U3 availability payments) come first each round.
  Hotels ($6M) and marinas ($4M) now cost the Resort Owner's own capital. Why: before, "covered" made grants, bonds, private
  money and influence (the 2-influence fund move) interchangeable.
- **The start budget drops from $30M to $16M.** Why: with $30M the city could pay for almost everything and no deal mattered;
  $16M pays one big project, so the second needs a grant, bond or partner (the target demo).
- **No negative wallets without a rule.** A bill the budget cannot pay becomes arrears debt (B3, the lender pays); a player
  wallet never overdraws (`Books.pay` refuses); only the simulated lender and grants can go below zero (they are outside money).
- **Agreements are compromises with `terms`.** Five authored types on five existing cards (no new cards): Private Investment =
  public-private partnership (A1), Resilience Bond = bond (A2), Habitat Survey = restoration partnership (A3), Community Benefits
  = conditional investment (A4), Flood Watch = maintenance reserve (A5). Why: the compromise path (owner accepts, hints find it,
  records and replays carry it) already existed; a parallel deal system would duplicate it. Terms are fixed at the reveal from
  the card and the project: no free-form deals, no client or model amounts.
- **Money moves only if the project is approved and the payer can pay then.** A void agreement (B4) moves nothing; a funding
  agreement made unnecessary by an earlier source (grant before bond before partner before contribution before budget) is
  `not-needed` and carries no strings. Why: no transfer without an accepted agreement, and no double funding.
- **No double spend.** `committed()` sums what a wallet already promised on the board (accepted agreements, fund moves, own
  private projects); accepting or funding beyond the rest is refused, and accepting twice is refused.
- **Rule ids added:** A0 offer refused (no money), A1-A5 agreements, B3 arrears, B4 payer cannot pay, U2 bond installment,
  U3 availability payment. RULES_VERSION 2.0.0 -> 3.0.0: older records load and report "not comparable", as designed.
- **Persona colors follow the figurine bases:** Mayor blue, Activist pink, Resort Owner gold, Resident green (Fisherman teal).
- **Nessie (live, checked 2026-10-11):** `https://prod-api.nessieisreal.com` works; `http://api.nessieisreal.com` does not answer.
  The key's namespace started empty (0 customers, 0 accounts). Transfers take only `{transaction_date, status, amount,
  description}` (no payee) and never change balances; deposits likewise; loans take `{type, status, credit_score,
  monthly_payment, amount, description}`; bills need a `status` enum. An unknown key reads an empty namespace (200 []).
- **One transfer record per ledger entry, on the payer's account.** The payee and the idempotency marker `[cc:<match>:<entry>]`
  go in the description. Why: the API has no counterparty field; a second "deposit" leg would double the writes that can fail
  half-way. Bonds are also mirrored as loan records (credit score 0: not applicable to a simulated municipal bond). Bills are
  not used: scheduled payments become transfers when they are paid, and a bill would add a second record of the same money.
- **Bounded accounts.** Eight fictional customers "CoastalClash <Wallet>" with one `cc-sim:<wallet>` account each, found by name
  before anything is created and reused by every match. Why: a per-match account would grow without bound.
- **Uncertain writes are reconciled, never retried blindly.** Timeout, network or 5xx on a write -> `uncertain`; the next pass
  reads the payer's records and looks for the marker: found -> confirmed; absent -> pending, sent again (attempt cap 4, then
  failed). A refusal is final (`failed`). An auth error pauses the mirror until a restart.
- **Sync state survives a restart when Tiger Data is configured** (`cc_bank_sync`, `cc_bank_accounts`, idempotent schema).
  Memory otherwise. The match record carries each item's status (`MatchRecord.bank`), separate from the outcomes.
