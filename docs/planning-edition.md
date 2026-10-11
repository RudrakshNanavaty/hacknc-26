# Planning Edition (rules `planning-1.0.0`)

Branch `aum/simple-clash`, cut from `pratham/map-board-onboarding` (`d6b311f`). The earlier card game (rules 2.0.0) is still in the tree: a room created with `rules: 'legacy'` plays it, and old records replay. Pratham's money/agreements rules 3.0.0 (`origin/pratham/coastal-clash`) are **not** merged.

## What it is

Two systems on one game:

- **Human decision intelligence.** Four stakeholders play three real Miami Beach planning fights and negotiate. The record keeps what each person played in role, how they voted, which amendment they asked for, whether it was accepted, whether stances changed, and, separately and voluntarily, what they personally prefer.
- **A small transparent simulator.** Every city plan the three scenarios allow (1,400 of them) is evaluated under three defined futures. The finale compares the plan the table built with contrasting feasible plans, and the Civic Atlas compares what people chose with what the model rates.

## A round

`select` (the real story and three projects on one screen; everyone privately plays one) → `propose` (cards face up; the Mayor puts one forward and cannot approve it alone) → `deal` (support or oppose; ask for one amendment; the sponsor decides) → `vote` (3 of 4) → `result` (verdict and points). Three rounds, one scenario each. Pratham's three-step tracker is kept, rebuilt as one clear ribbon: select is *Play a Card*, propose, deal and vote are *Make a Deal*, result is *See What Happens*. Missing seats are filled with bots at Start, so there is always a Mayor and four votes.

**Verdicts.** `approved`; `rejected` (fewer than 3 votes, or nothing put forward); `delayed` (passed, but a scenario constraint is unmet, e.g. raising West Avenue needs a property-access guarantee); `no-money` (cost over the round budget). Anything but `approved` applies the status quo.

**Amendments.** One per round, from a short scenario-specific list, compatible with the project, inside the 10-unit budget. A non-sponsor asks; the sponsor (the player whose card the Mayor put forward) accepts or declines. A bot sponsor settles when the table is ready to vote, preferring an offer that clears a blocker, then a person's offer. An accepted amendment changes cost, tags and the simulator profile of the adopted plan.

**Scoring (a game design convention, not a measured score).** Up to 6 a round, 18 a match, the same 3+2+1 for every role:

- **Goal 0–3.** Every stakeholder, the Mayor included, has three one-point objectives written as data in `scenarios.ts` (`Check`s: what the plan that stands is or has, its simulator profile, its cost, whether an amendment is in it, and whether a project was *stopped*). It is scored on what actually happened: an approved plan is scored as built, and a rejected, delayed or unfunded plan is scored as the status quo, with the project that failed recorded. So stopping a harmful or unaffordable project can be a real success (the Activist at Mid-Beach when groins and breakwaters are stopped; the Resort Owner at West Avenue when the road works are stopped; the Mayor at South Pointe when the city-funded park is stopped), and a plan the Mayor controls can still score 0. Every objective line shows ✔ or ✘ in the result.
- **The Mayor** is measured on citywide responsibilities and has a *critical* objective: if the plan does not really address the problem (or stop an unaffordable structure), the goal is 0 whatever else went right. Their other objectives are a reserve held back (a threshold strictly below the 10-unit round budget, so it is not the City point), the federal or public share carrying cost, and keeping services and public access. "Getting an intervention implemented" is not scored separately: a rejection already costs the Mayor the critical and protection objectives.
- **Deal-making 0–2.** The author of an accepted amendment that answers their own concern gets 2; the sponsor who brokered it gets 1; nothing for concessions that do not answer the author's concern, or if the plan fails.
- **City feasibility 0–1.** Shared: approved, inside the 10-unit round budget, constraints met. This is the only place budget compliance is scored; the Mayor's reserve objective is a stricter, separate test.
- There is no automatic penalty for a rejected or delayed proposal. Every role has at least one outcome worth 0 and one worth 3 in every scenario (`plan.test.ts` enumerates them). Every point has a written reason. Models never touch points.

## The three scenarios

Three different kinds of problem, one per round, one per area (an earlier version had three "raise the road" stories; they were replaced):

| Round | Area | Kind of problem | Story (Snowflake corpus id) | Sources |
|---|---|---|---|---|
| 1 | West Avenue | flood infrastructure: raise the streets, or drain, or elevate the buildings | `west-ave-road-raising` (+ `pump-bacteria` for the Activist's goal) | 4 + 2 |
| 2 | South Pointe | land use: height traded for a public park | `five-hundred-alton` | 2 news |
| 3 | Collins / Mid-Beach | shoreline: more sand, hard structures, or dunes | `beach-renourishment` | 3 (1 official, 1 news, 1 industry), re-read 2026-10-11 |

The tests check every district, source URL, cited fact and number in the situation text against `pipeline/research/miami-beach-civic-corpus.json`. The beach story was expanded from 1 to 3 sources (Dredging Today, Miami Today, the Miami-Dade ERM page); a Miami Herald copy on AOL returned 404 and a FIU Caplin News page returned 403, so neither was used. The two sources disagree slightly ($40.4M and 835,000 cubic yards vs $40.5M and 830,000); the corpus says so. **Snowflake has not been reloaded with the changed corpus** (`npx tsx --env-file=.env pipeline/snowflake-load.ts`); the planning game cites the repo copy at run time.

Mandates marked `inferred: true` (the South Pointe Activist) are role inference, not a documented position, and the UI says so. The South Pointe decision barely moves modelled flood exposure; it moves public access and cost, and the UI and the simulator say that.

## How it got easier (difficulty "9 → 4", then lower)

One screen opens each round (the real story, your goal, how points work, three cards): there is no separate reading step. A bot Mayor's reveal moves on after a four-second beat even in turn-based play. Points are explained where they are earned: a Goal / Deal / City guide on the first screen and the result, "Fits your goal ★★☆" on every card, "🤝 +2 for you" on the amendment that answers your own concern, and the same icons in the final table.

## The news desk and the characters

Kept. The Coastal Clash anchor, the crawl and the map speech bubbles run in the Planning Edition. Gemini words the anchor's line and the characters' bubbles from `planFacts()` (the real story and what the rules decided); a line with a number outside those facts is dropped and the template line stays, and ElevenLabs reads the headline and your own character's line. None of it decides a vote, a verdict or a point. With no Gemini or ElevenLabs credit the game runs on template lines and silence.

## The simulator

`shared/src/game/plan/sim.ts`, assumptions in `sim-assumptions.ts` (each marked `real`, `derived` or `assumed`, with its source). Futures use real NOAA Virginia Key levels (ordinary 2.25 ft MLLW, minor flood 3.94, major flood 6.14). Exposure weights real FEMA flood-zone shares and VE bands from `districts.json`. The effect of each project and amendment is **assumed**. Output is a ranking proxy for flood exposure (0–100, lower is better), a public-access index and cost, under each future. It is not a flood forecast. `pipeline/plan-sim.ts` writes the cache `shared/src/data/plan-sim.json`; a test fails if it goes stale. Run: `npx tsx pipeline/plan-sim.ts`.

## Data

`MatchRecord.plan` (`PlanRecord`): rounds (picks, leading proposal, stances before and after, offers, accepted amendment, votes, verdict, adopted plan, cost, scores with reasons), voluntary `personal` answers (before and after, reason, moved by amendment), the final plan and totals, and the simulated outcome. `rulesVersion` is `coastal-clash-rules/planning-1.0.0`; legacy fields stay empty. Tiger Data stores the record unchanged, plus `cc_decisions` rows (cards, stances, offers, votes, outcomes, personal answers) and a match summary. Civic Atlas: `/atlas` → Planning Edition, four views (A real issues, B human decisions, C plan explorer, D planning insights); `GET /api/atlas/plan`, `GET /api/atlas/plan/export.csv`.

## Verified and not verified

Verified: `vitest run` (all suites), typecheck of `shared`, `server`, `app`; a three-round match with one person and three bots played headlessly in Chrome at 1440×900 through the finale and the Atlas.

Not verified: several people in separate browsers (covered by room tests, not by a browser run); 1280×720 and phone layouts; ElevenLabs voices and Gemini in this mode (neither is used for decisions; headline voice only); Tiger Data and Solana with this record shape (the Solana civic record is skipped for plan matches because it fingerprints the legacy `final`).
