# consensusclub

**Four stakeholders. Three real planning fights. One shoreline.**

What if the next argument about your city's future happened around a game table instead of at a town hall?

consensusclub is a multiplayer strategy game about real coastal planning decisions in Miami Beach. Play as the Mayor, Resident, Environmental Activist, or Resort Owner. Propose a project, negotiate a change, and vote on the plan that actually gets built. Every match leaves a record of **what people supported, what they opposed, and the conditions that changed their minds**.

Built for **HackNC 2026**, with a Frutiger Aero + Liquid Glass interface: ocean scenery, small floating bubbles, glossy green buttons, glass panels, and animated 3D characters.

![Stakeholder selection: four roles and their goals, on frosted glass over an underwater seascape](docs/images/stakeholder-selection.png)

[Quick start](#quick-start) · [How to play](#how-to-play) · [Civic Atlas](#what-stays-after-the-match) · [How we built it](#how-we-built-it)

## Inspiration

More than **100 million people** have played GeoGuessr, exploring places they have never visited because it is fun. Strategy games get people to spend evenings deciding things for imaginary cities. Engaging people in real decisions about their own neighborhood is harder.

Rio Rancho's professionally run 2025 survey reached 3,000 randomly selected households and received an **11% response**, while University of Michigan researchers found **65% of Michigan local jurisdictions** struggled to engage people beyond repeat participants. These figures describe participation challenges, not a claim that surveys are broken.

Engagement also takes resources. Seattle advertised an estimated **$250,000** contract for broad community stewardship and engagement around its I-5 lid studies, not one survey. An American Planning Association interview described one regional council sending about 20,000 survey invitations and offering **$125 gift cards** for longer follow-up interviews.

People do show up when taking part is easy. Boston's first citywide participatory budgeting cycle held 19 idea workshops and three visioning forums, worked in six languages, and collected **4,462 votes** in January 2025. **131,527 New Yorkers** voted in The People's Money in 2025.

Our question is what happens **before** someone votes yes or no. A resident might support raising a flood-prone road **only if** the city guarantees access to their front door. A business owner might back a different design. Someone else might want the project stopped. That “only if” is the information we wanted to collect.

Miami Beach gave us a real place to try it. Its 2025 Sea Level Rise Adaptation Plan identified **67,000-plus vulnerable assets**, with the underlying work supported by a **$454,000 Resilient Florida grant** and **$100,000 city match**. [West Avenue Neighborhood Improvements](https://www.miamibeachfl.gov/projects/west-avenue-neighborhood-improvements-project-phase-ii/) has a **$100,229,771** published budget: raised roads, pumping, utilities, and harmonization, connecting raised public streets to existing private properties.

That is a real, expensive, complicated decision about a neighborhood. We wondered what it would be like to play that conflict as a card game, something like a round of Clash Royale. That became consensusclub.

## How to play

Host a room and share its code or QR. Up to four people join, one stakeholder each; empty seats are filled by bots when the host starts. The game board is designed for laptops and desktops. The landing page, stakeholder selection, and lobby also adapt to tablet and mobile screens.

| Stakeholder | What is at stake |
| --- | --- |
| **Mayor** | Fix the city's problem, preserve reserves, and keep public access working. Chooses the proposal, but needs other players' votes. |
| **Resident** | Safety, access to home, and the neighborhood left after construction. |
| **Environmental Activist** | Habitat, public space, natural shorelines, and careful development. |
| **Resort Owner** | Viable businesses, visitors, investment, and property protection. |

The map contains South Pointe, West Avenue, Collins/Mid-Beach, and North Beach Oceanside. A match plays three real fights in three of those places, each presenting a different kind of problem:

| Round | Place and issue | Project choices |
| --- | --- | --- |
| 1 | **West Avenue — flood infrastructure** | Raise roads, improve drainage, or elevate properties. |
| 2 | **South Pointe — land use** | A tower and park, a shorter tower with a smaller park, or a city-funded park. |
| 3 | **Collins/Mid-Beach — shoreline protection** | Add sand, build groins and breakwaters, or restore dunes. |

These cards are simplified options authored for the game. They do not imply that the city put exactly three choices on a ballot. Costs use hypothetical game budget units.

The underlying stories are concrete: safe access beside raised streets on West Avenue; a tower over 500 feet tall in exchange for a developer-donated three-acre park at South Pointe; and roughly 835,000 cubic yards of sand under a $40.4 million beach-renourishment contract, alongside debate over structures to retain it. The [research corpus](pipeline/research/miami-beach-civic-corpus.json) preserves differences in reported tower height, sand volume, and project cost.

### 1. Play a Card

Read the real issue, its sources, your character's goal, and three project cards. Each card explains its benefit, trade-off, and cost. Everyone privately chooses a project; the cards are then revealed, and the Mayor puts one forward.

### 2. Make a Deal

Support or oppose the proposal, or request an amendment from the scenario's short list. The proposal's sponsor decides whether to accept the change. An amendment changes the actual plan, its cost, or its conditions; it is saved in the match record.

For example, a Resident can ask for a **Property Access Guarantee** before backing raised roads. Then everyone votes. **Three of four votes** are needed to approve a proposal.

### 3. See What Happens

The server applies the rules and gives a verdict:

- **Approved:** the plan passes, fits the budget, and meets its constraints.
- **Rejected:** the proposal does not receive enough votes, or none goes forward.
- **Delayed:** it passes the vote but lacks a required condition, such as safe property access.
- **Unfunded:** its cost exceeds the round budget.

A plan that cannot proceed leaves the status quo. Blocking a harmful or unaffordable project can advance one role's goals while frustrating another's.

### Every point has a reason

Up to **6 points per round**, **18 per match**:

| Score | Points | What earns them |
| --- | --- | --- |
| Goal | 0–3 | The outcome satisfies your role's explicit objectives. |
| Deal | 0–2 | An accepted amendment answers your concern; its author can earn 2, and the sponsor who brokers it can earn 1, if the plan succeeds. |
| City | 0–1 | A shared point for an approved plan within budget and meeting the scenario's constraints. |

The Mayor has a critical objective and can earn zero if the problem is not addressed. Reserve requirements are separate from the shared City point. Rejected, delayed, or unfunded projects are scored as the status quo, including objectives that reward stopping a project. These scores are game design conventions, with explanations on screen.

After round three, **Your Miami Beach Plan** shows what passed, what failed, the negotiated changes, votes, budget, and sources. A storm tests the plan, and the simulator compares it with alternatives.

## What stays after the match

A vote records which option won. consensusclub also records the path to that vote:

- The real issue, sources, and map location.
- Each player's project choice and stance.
- Requested amendments, their effects, and whether they were accepted.
- Votes, verdicts, the adopted plan or status quo, and scores with reasons.
- Separate, voluntary personal answers given outside the assigned role.

**Role-play is not public opinion.** Winning as the Resort Owner does not mean a person wants hotels on every beach. In-role decisions, personal answers, bots, and demo/community session labels remain distinct.

The **Civic Atlas**, at `/atlas`, explores these records in four views:

| View | What it shows |
| --- | --- |
| Real issues | Source-linked situations, projects, and constraints. |
| Human decisions | Picks, support, opposition, requested changes, votes, and separate personal answers. |
| Plan explorer | Plans people built compared with feasible alternatives. |
| Planning insights | Patterns with sample sizes and the records behind them. |

A pattern such as “support for road elevation increased after an access guarantee” is a lead for further consultation. It does not establish what Miami Beach residents think: who played, their assigned roles, and the choices they saw all matter.

## A small, transparent simulator

The simulator evaluates **1,400 feasible plans**, including amended variants, under three futures: ordinary high tide, minor flooding with heavy rain, and major flooding. NOAA Virginia Key tide levels and FEMA flood-zone shares ground the comparison.

Project effects are explicitly labeled assumptions. The output ranks plans by flood exposure, public access, and cost; it is **not a flood forecast or an engineering assessment**. Assumptions and their sources live in [`sim-assumptions.ts`](shared/src/game/plan/sim-assumptions.ts), and [`sim.ts`](shared/src/game/plan/sim.ts) contains the model. A test checks that the committed simulator cache matches the rules.

## How we built it

The project builds on our earlier work: **Pocket Rivals** contributed the real-time room and synchronized-play pattern, while **Mayday Mayor** informed civic records and contribution incentives.

```text
app/       React + Vite + TypeScript, MapLibre, three.js, motion, Tailwind
shared/    Deterministic rules, scenarios, scoring, simulator, records, Atlas aggregation
server/    Fastify + WebSockets, authoritative rooms, narration, voices, persistence
pipeline/  GIS extraction, civic research corpus, Snowflake loading, Gemini casting
docs/      Rules, data provenance, setup, handoffs, and verification notes
```

The server owns proposals, amendments, voting, budgets, and scoring. Shared TypeScript rules determine outcomes. **Gemini can explain and narrate; it cannot decide votes, verdicts, or points.** Narration is checked against supplied facts, and lines with unsupported numbers fall back to templates.

### The research swarm

Planning information is public but scattered across board agendas, project pages, hearings, public comments, budgets, GIS layers, and local news. The team's multi-agent civic research workflow divides that work into these roles:

| Role | Responsibility |
| --- | --- |
| Agenda scout | Find planning-board items, hearings, applications, and proposals; retain identifiers and sources. |
| Projects scout | Track capital projects, status changes, and published budgets. |
| Geo agent | Tie proposals to addresses, parcels, neighborhoods, or game areas. |
| Context agent | Find documented arguments in records, official statements, and reporting. |
| Verifier | Check numbers and claims, flag contradictory sources, and hold uncertain items back. |
| Human review | Decide which research items are reliable enough to become scenarios. |

The workflow is **research → Snowflake → Gemini → the game**. Research items carry facts, documented positions, locations, source URLs, and verification notes. Gemini uses that context for scenario setup, stakeholder casting, story names, the anchor's lines, and characters' speech bubbles. Players can trace the conflict back to a real place and open its evidence.

Repository entry points: [research corpus](pipeline/research/miami-beach-civic-corpus.json), [Snowflake loader](pipeline/snowflake-load.ts), [Gemini casting](pipeline/cast-stories.ts), and [validation](shared/src/game/story.ts). The agents organize the conflict, Gemini makes the scene understandable, and people decide what to do.

### Tracks we are entering

Each track connects to a different part of the project:

| Track / technology | Contribution |
| --- | --- |
| **General** | A complete three-round multiplayer planning game. |
| **Frutiger Aero Tech** | Shared aqua glass, glossy controls, ocean scenery, bubbles, and 3D characters over real geographic data. |
| **Community** | A format for negotiating a neighborhood's future and retaining conditional feedback. |
| **Best Use of Gemini API** | Research agents at one end; scenario setup, stakeholder casting, news narration, and character choreography at the other. Verified context only; no authority over outcomes. |
| **Best Use of ElevenLabs** | Distinct voices for the news anchor and each character, making a match a scene people can listen to. |
| **Best Use of Snowflake API** | The research swarm's output and the input to scenario casting: facts, positions, places, sources, and verification notes, read through the SQL API. |
| **Best Use of Solana** | A public ledger with fingerprints, outcome memos, Merkle proofs and verification, plus the non-transferable contribution-card incentive design. Outside the live demo. |
| **Best Use of Tiger Data** | Persistent matches and decision rows with places, coordinates, and timestamps, so planning insights accumulate across sessions. |
| **Ig Turing** | A party game with talking characters that also captures material for planning research. |

### Public records and contribution incentives

The project's public-ledger design fingerprints role-play decisions with **SHA-256**, writes a plain-language outcome summary as a **Solana memo**, and anchors batches as a **Merkle root**. Each covered match keeps its proof; a verify page recomputes the fingerprint and checks it against the chain. Names and voluntary personal answers are excluded: the public record concerns seats, roles, and game decisions.

The service is designed to fail softly: a slow chain or an unfunded key does not block a match, and failed memos can be retried. Solana is **not part of the live demo**.

Recording input is one part of participation; giving people a reason to contribute is another. The incentive layer, first explored in **Mayday Mayor**, is a collectible **non-transferable contribution card** on Solana. A city or planning partner acts as collection authority and recognizes useful input, such as a compromise or a previously missed concern. Cards cannot be traded or bought, and partners can verify them and honor perks off chain.

This incentive layer is a **design and devnet prototype with simulated authority**, not a live city program or part of the demo.

## Quick start

Use **Bun 1.4+** and **Node 22.12+** (Node 20.19+ is also supported). Bun manages the workspaces; Node runs the test and server tooling.

```bash
git clone https://github.com/RudrakshNanavaty/hacknc-26.git
cd hacknc-26
bun install
bun run dev
```

Open **http://localhost:5173**. The API and WebSocket server use port **8787**. Host a match, choose your role, and start with friends or bots. Other laptops can use the host's LAN address when the network allows it.

All API keys are optional. To enable integrations, copy `.env.example` to `.env` and fill in the relevant values. On PowerShell, use `Copy-Item .env.example .env`; on macOS/Linux, use `cp .env.example .env`. Keep `.env` out of version control.

| Configuration | Purpose and fallback |
| --- | --- |
| `GEMINI_API_KEY` | AI narration and related services; otherwise template text and placeholder art. |
| `ELEVENLABS_API_KEY` | Spoken headlines and character lines; otherwise captions without generated speech. |
| `DATABASE_URL` | Tiger Data/PostgreSQL; otherwise records persist in `server/.cache/matches.json`. |
| `SNOWFLAKE_ACCOUNT`, `SNOWFLAKE_TOKEN`, `SNOWFLAKE_WAREHOUSE`, `SNOWFLAKE_ROLE` | Research feed; the Planning Edition's committed scenarios remain playable without it. |
| `SOLANA_PAYER_SECRET_KEY`, `SOLANA_RPC_URL` | Optional devnet ledger configuration. |
| `PUBLIC_URL` | Public base URL for room QR links; otherwise the host's LAN address is used locally. |

Optional integrations fail independently so a missing key does not block the game. See [the developer guide](docs/contributing.md) for configuration and troubleshooting.

### Commands

```bash
bun run dev          # Vite app and Fastify server
bun run typecheck    # shared, app, and server workspaces
bun run test         # rules, rooms, records, integrations, and app helpers
bun run build        # production client in app/dist
bun run start        # serves the built client, API, and WebSockets on :8787
```

[`Dockerfile`](Dockerfile) and [`render.yaml`](render.yaml) describe a single-service deployment. Supply secrets through the hosting environment. If using local-file persistence in production, provide persistent storage; ephemeral hosts can discard their files.

## Verification and developer notes

The default game is **Planning Edition**, rules `coastal-clash-rules/planning-1.0.0`.

- Three-round play, bots, explicit scoring, amendment negotiation, the simulator, and Planning Edition Atlas are implemented.
- **215 automated tests across 20 files** pass, along with workspace typechecking and the production build, as of October 11, 2026.
- Landing, selection, and lobby were browser-checked at **1440×900, 1280×720, 768×1024, and 390×844**, including a second client joining, role switching, bot controls, and game start. The game board remains desktop-oriented.
- Live vendor availability depends on credentials, quotas, and network access. Passing integration tests does not certify live service availability.

Details: [Planning Edition](docs/planning-edition.md), [UI verification](docs/progress/ui-polish.md), and [current handoff](docs/progress/simple-clash.md).

## Challenges we ran into

**Negotiation has to change the plan.** Early versions had influence, combos, and many city meters. We simplified the Planning Edition around concrete changes that affect cost, access, design, and the recorded outcome.

**Choosing the agenda should not guarantee winning.** The Mayor has explicit objectives and can fail them. Every role can reach both zero and three goal points in each scenario, checked by tests.

**Documents need context.** The research corpus retains source disagreements, including different reported costs and volumes for beach renourishment. Sources, inferred role objectives, and illustrative options remain distinguishable.

**Simulation needs visible assumptions.** Real flood zones do not establish a project's effectiveness. The model's assumed effects are listed openly.

**Play and personal opinion are different records.** A role-play vote is not a resident survey, and online comments are not representative. We keep role decisions, voluntary personal answers, and documented public-record themes separate.

## Accomplishments that we're proud of

- A full three-round game for four people or bots, built around sourced Miami Beach stories and a real map.
- Explicit reasons for every point, with outcomes determined by tested rules.
- A research-to-scenario workflow that keeps source documents accessible to players.
- A simulator that compares all 1,400 feasible plans with its assumptions in the open.
- A Civic Atlas that preserves the distinction between role-play and personal answers and shows sample sizes.
- A project-level public-ledger workflow and a contribution-card incentive design.
- A Frutiger Aero look people want to click before they discover it is civic technology.

## What we learned

We thought the hard part would be getting a whole city into a game. The most useful moment turned out to be small: “I could support that, but only if.” That is where a disagreement becomes a design problem people can negotiate: where a sidewalk goes, who pays, or what land stays public.

Making public information current, readable, linked to its source, and tied to a place is a substantial part of the work. AI helps find, organize, and explain it. It should not pose as a city engineer or as the public.

## What's next

Run a participatory planning workshop with residents and planning researchers. Check whether players understand the projects, have domain experts review simulator assumptions, and test whether the format surfaces conditions that a questionnaire misses. Take contribution cards from prototype to a real partner, with a city or planning group recognizing useful input. Then point the research swarm at other cities and conflicts in transportation, housing, public space, and utilities, each with its own data and rules.

## Sources and further reading

The engagement examples draw on GeoGuessr's company overview, Rio Rancho's 2025 Citizen Survey, the University of Michigan's Michigan Public Policy Survey, Seattle's I-5 lid engagement solicitation, the American Planning Association's *Why Paid Community Engagement Is Worth the Investment*, Boston's first participatory budgeting cycle, and New York City's 2025 People's Money results.

Scenario sources are clickable in the game and recorded in the [civic corpus](pipeline/research/miami-beach-civic-corpus.json). Start with:

- [City of Miami Beach: West Avenue Neighborhood Improvements](https://www.miamibeachfl.gov/projects/west-avenue-neighborhood-improvements-project-phase-ii/).
- [Miami Today: 44-story limit on the Alton Road site](https://www.miamitodaynews.com/breaking/beach-commission-hear-44-story-limit-alton-road-site/).
- [Miami-Dade County: Beach Renourishment](https://miamidade.gov/environment/beach-renourishment.asp).
- [Miami Today: New ways to retain beach sand](https://www.miamitodaynews.com/?p=76028) and [Dredging Today: Miami Beach project](https://dredgingtoday.com/?p=82517); the corpus documents differing cost and volume figures.
- [NOAA CO-OPS: Virginia Key, station 8723214](https://tidesandcurrents.noaa.gov/stationhome.html?id=8723214).
- [Miami Beach zoning GIS](https://gis.miamibeachfl.gov/public/rest/services/gc/gc_Zoning/MapServer/0) and [Miami-Dade FEMA flood-zone GIS](https://gisweb.miamidade.gov/ArcGIS/rest/services/EnerGov/MD_LandMgtViewer/MapServer/63).

For development, read [`AGENTS.md`](AGENTS.md), the [Planning Edition rules](docs/planning-edition.md), and the [contributing guide](docs/contributing.md). The [earlier design and architecture](docs/coastal-clash.md) documents the legacy game and its integrations.

People already love making decisions about imaginary cities. We want to find out whether that same energy can help real ones have better conversations.
