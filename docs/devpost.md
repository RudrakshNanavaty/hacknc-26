# Coastal Clash — Devpost project context

Primary source for the project's public narrative, supplied by the project author on October 11, 2026. The text below preserves that context with Markdown formatting. Checkout-specific setup and verification are documented separately in [implementation notes](implementation-notes.md).

## Inspiration

What if the next argument about your city's future happened around a game table instead of at a town hall?

More than 100 million people have played GeoGuessr, wandering streets they have never visited because it is fun. Strategy games get people to spend whole evenings deciding things for imaginary cities. Getting people to engage with real decisions about their own neighborhood is much harder.

In May 2025, Rio Rancho, New Mexico mailed a civic survey to 3,000 randomly selected households and 11% answered. That is a professionally run survey with weighting and a reported margin of error, so we are not saying surveys are broken. It does show how hard it is to reach people. University of Michigan researchers found that 65% of Michigan local jurisdictions had trouble getting anyone beyond the same repeat participants in their 2025 engagement efforts.

Cities do spend money on this. Seattle advertised a community stewardship and engagement contract estimated at $250,000 for its downtown I-5 lid studies. That is the estimate for a broad engagement contract, not the cost of one survey. In an interview with the American Planning Association, a Puget Sound Regional Council engagement specialist described sending about 20,000 survey invitations, getting a few thousand responses, and then offering $125 gift cards for longer follow-up interviews.

People do show up when taking part is easy. Boston's first citywide participatory budgeting cycle held 19 idea workshops and three visioning forums, ran outreach in six languages, and collected 4,462 votes in January 2025. 131,527 New Yorkers voted in The People's Money in 2025.

Those are good results, and they made us curious about a different question: what happens before someone votes yes or no? Ask a resident whether they support raising a road to protect their neighborhood from flooding and you get one answer. But they might support it only if the city guarantees access to their front door. A business owner might chip in for a different design. Someone else might want the whole project stopped. That "only if" is the information we wanted to collect.

Miami Beach gave us a real place to try it. In 2025 the city adopted a Sea Level Rise Adaptation Plan that identified more than 67,000 vulnerable assets, and the underlying work was backed by a $454,000 Resilient Florida grant and $100,000 in city matching funds. The West Avenue Neighborhood Improvements project has a published budget of $100,229,771 and involves raised roads, stormwater pumping, new utilities, and a problem called harmonization: connecting newly raised public streets to existing private properties so people can still get in and out safely.

That is a real, expensive, complicated decision about a real neighborhood. We started wondering what it would be like to play that conflict as a card game, something like a round of Clash Royale. That became Coastal Clash.

## What it does

Coastal Clash is a four player strategy game about real coastal planning fights. The map is Miami Beach, with four mapped areas: South Pointe, West Avenue, Collins/Mid-Beach, and North Beach Oceanside. A match plays three real fights in three of those places, so each round is a different kind of problem.

Each player has a role with something at stake:

- **Mayor.** Answers for the whole city: a problem that is really fixed, money held in reserve, and public access that keeps working. The Mayor chooses which proposal goes forward but cannot approve it alone, because three of four players have to vote yes.
- **Resident.** Cares about safety, getting to their home, and what the neighborhood looks like afterward.
- **Environmental Activist.** Pushes for habitat, public space, and careful development.
- **Resort Owner.** Wants viable businesses, visitors, and investment.

Every round has three steps: **Play a Card, Make a Deal, See What Happens.**

### Play a Card

One screen shows a two sentence explanation of a real planning issue, its place on the map, your character's goal, three project cards, and the sources behind the story. The three fights in a match are:

- **West Avenue, flood infrastructure.** Raise the roads, improve drainage, or elevate the buildings. The city's documents describe raised roads and the access problem, so the question is how to improve flood protection without making homes and shops harder to reach.
- **South Pointe, land use.** The city approved a tower of over 500 ft in exchange for a developer-donated 3 acre park (Miami Today). Is height a fair price for a park?
- **Mid-Beach, shoreline.** The Army Corps placed about 835,000 cubic yards of sand under a $40.4 million contract, and the county is weighing breakwaters and groins to keep it there (Miami Today). More sand, hard structures, or dunes?

The cards are simplified options we wrote, not a claim that Miami Beach put exactly three choices on a ballot. Each card does one thing and shows a benefit, a trade-off, and a cost in game budget units.

### Make a Deal

The Mayor puts one proposal forward. Players support or oppose it, and each can ask for one change from a short list written for that scenario. In West Avenue the Resident might demand a property access guarantee. That guarantee changes the design and uses budget, and the sponsor of the proposal decides whether to accept it. Now the group is bargaining over money, access, design, and conditions. Then everyone votes, and it takes three of four.

### See What Happens

A project can be approved, rejected, delayed (it passed but cannot go ahead, like raised roads without an access guarantee), or left unfunded. A rejection does not mean everyone loses. Stopping a harmful or unaffordable project can be a win for one role and a loss for another.

Scoring is up to six points a round and eighteen a match. Goal (0 to 3) measures how much of your role's three objectives the plan that actually stands achieves. Deal (0 to 2) rewards an accepted change that answers your own concern. City (0 or 1) is shared, and it is awarded when the approved plan fits the budget and the scenario's constraints. Every role is scored on explicit objectives and on what really happened. A rejected or delayed plan is scored as the status quo, and the Mayor can score zero if the problem is not fixed. Each point shows its reason on screen. These points are a game design choice, not a measured score.

After round three the game shows **Your Miami Beach Plan**: the places you played, what passed or failed, the concessions you negotiated, who backed or opposed each decision, the budget committed, and the sources. A storm tests the plan, and a simulator compares it with other feasible plans.

### What stays after the match

A normal vote tells you which option won. Coastal Clash saves a much fuller record:

- the real issue and its map location
- the project each player picked
- who supported, opposed, or tried to change the proposal
- the change someone asked for, its concrete effect, and whether it was accepted
- the final vote, and the resulting project or the status quo
- voluntary personal answers, asked outside the role and never scored
- the sources and assumptions behind the situation

Playing a role and giving your own view are different things. Someone who wins as the Resort Owner does not necessarily want hotels on every beach, so we never treat a character's move as a resident's opinion. The Civic Atlas is where researchers and planners explore the records, in four views: the real issues with their sources, the human decisions, an explorer of the plans people built, and planning insights. Every figure carries its sample size and demo sessions are labeled.

### A public ledger

Anyone should be able to check that what a match recorded was not quietly edited afterward. When a match ends, we fingerprint its role play record (who played what, who asked for which change, how each person voted, and every verdict) and write a short plain language summary of its outcomes to Solana as a memo. Matches are then anchored in batches as one Merkle root, and every match keeps its proof. A verify page recomputes the fingerprint from the public record and checks the proof against the chain, so a planner, a reporter, or a resident can confirm the record is complete without trusting our database. No names go on chain, only seats and roles, and voluntary personal answers never do, because they are opinions and not part of the game record.

### An incentive to take part

A ledger shows that input was recorded. We also want people to have a reason to give it. The design, which we built first in our earlier project Mayday Mayor, is a collectible contribution card minted as a non-transferable NFT on Solana. A city partner acts as the collection authority and recognizes useful contributions: for example, a plan that surfaced a blind spot, or a match that reached a real compromise. The cards cannot be traded, so they cannot be bought, and a partner can verify one and honor it with perks off chain. In this build the incentive layer is a design and a devnet prototype with simulated authority, not a live city program, and it is not part of our live demo.

A planner might find a pattern like this one: participants object to road elevation at first, then support it once safe access to existing buildings is guaranteed. That is a hypothesis worth following up in formal consultation. It is not proof of what Miami Beach residents think, because who played and what they saw both matter.

## How we built it

### Game and rules

We reused the real time rooms, character identities, and synchronized reveals from our earlier project, Pocket Rivals. A server controlled rules engine handles proposals, amendments, voting, budgets, and every score, and it is tested (215 automated tests at the time of writing). Gemini can narrate but cannot change an outcome.

### Maps and public data

MapLibre draws a tilted 3D map of Miami Beach. We pulled real FEMA flood zones and city zoning for each area and used NOAA tide data for the water levels. Miami Beach's own project pages and sea level rise assessment set the scene.

### The research swarm

We did not want to spend a weekend hand writing three climate stories and call that understanding a city. Planning information is public but scattered across board agendas, project pages, hearing documents, public comments, budgets, GIS layers, and local news. So we built a multi agent civic research desk:

- **Agenda scout** finds planning board items, hearings, applications, and proposals, and keeps their file identifiers and source links.
- **Projects scout** tracks capital projects and changes in status or published budget.
- **Geo agent** ties a proposal to an address, parcel, neighborhood, or one of the game's areas.
- **Context agent** finds documented arguments and concerns in meeting records, official statements, and local reporting.
- **Verifier** checks extracted numbers and claims against the documents, flags sources that contradict each other, and keeps uncertain items out of the approved set.
- **Human review** decides which items are reliable enough to become a scenario.

The swarm's output lands in Snowflake as research items: each one has its facts, the positions people documented, a location, the source links, and the verifier's notes. That table is the input to Gemini. Gemini reads it to write each round's setup, cast the real stakeholders onto the four roles, and choreograph the round (the anchor's line, the characters' speech bubbles, the cards' story names). A game round traces back to a real proposal, a real place, and the evidence for it, and the player can click through to the document. The agents find and organize the conflict, Gemini turns verified context into a clear scene, and people decide what to do.

### The public record on Solana

A civic record service fingerprints every finished match with SHA-256 over its canonical decision record, writes the summary memo to Solana devnet, and anchors batches as a Merkle root with a proof for each match. It fails soft: if the chain is slow or the key is out of funds, the match is never blocked, and failed memos are retried until the record heals.

### The simulator

We wrote a small simulator instead of a physics engine. It evaluates every plan the three scenarios allow, 1,400 of them including every amended version, under three futures: an ordinary high tide, NOAA's minor flood level with heavy rain, and NOAA's major flood level. Real tide levels and FEMA flood zone shares ground it. The effect of each project is a labeled assumption, listed in one file, and the results rank plans against each other. They are not a flood forecast.

### Interface

Glossy collectible cards, aqua glass panels, animated 3D character miniatures, a news anchor, and large APPROVED and REJECTED stamps, all in a Frutiger Aero style.

## Tracks we are entering and how each one is used

- **General track.** The whole project.
- **Frutiger Aero Tech.** The look is the point. The bubbles, glass panels, blue water, and green pill buttons sit on top of real ocean and flood data: FEMA flood zones, NOAA tide levels, and sea level rise planning. We wanted public planning to look like the optimistic future people used to get excited about, instead of a PDF.
- **Community.** Coastal Clash is a tool for residents, local groups, and planners to argue about a neighborhood's future together, and it keeps what people negotiated so the conversation continues after the match.
- **Best Use of Gemini API.** Gemini is used at both ends of the project. First, it powers the multi agent research swarm that does scenario and story research: scouting planning agendas and project pages, matching proposals to places, pulling documented arguments, and checking numbers against the documents. Second, it processes the swarm's output from Snowflake into the game: it writes each round's setup, casts the real stakeholders onto the four roles (scenario casting), and choreographs the scene, including the news anchor's line after each moment and the speech bubbles for the characters on the map. It is boxed in. It only gets verified facts, any line containing a number that is not in those facts is thrown away and replaced by a template line, and it never decides votes, verdicts, or points.
- **Best Use of ElevenLabs.** The news anchor and each character have their own voice. The anchor reads the headline and your character speaks their lines, so the match plays as a scene you can listen to.
- **Best Use of Snowflake API.** Snowflake is where the research swarm's output lives and the input for everything Gemini does next. Each research item carries its facts, documented positions, location, source URLs, and verification notes. The server reads it through the Snowflake SQL API, and Gemini turns it into scenarios, casting, and choreography. Game scenarios are checked against that research in tests, so a number or link in a round has to match what the swarm found.
- **Best Use of Solana.** Two things. A public ledger: every finished match is fingerprinted, summarized in plain words in a Solana memo, and anchored in Merkle batches with a proof for each match, plus a verify page anyone can use. And an incentive: non-transferable contribution cards (soulbound NFTs) that a city partner can verify and honor, described above. Solana is not part of our live demo, so this is documented here and in the repository.
- **Best Use of Tiger Data.** Each match is stored as a record, and every decision (card, stance, requested change, vote, outcome, personal answer) is also written as a row in a time series table with its place and coordinates. The Civic Atlas reads those rows, so insights build up across sessions instead of showing only the last match.
- **Ig Turing.** This one is two things at once. It is a Clash Royale style party game with a news anchor, talking 3D characters, and big APPROVED and REJECTED stamps, and it is also a tool a planner could use to collect real conditional feedback. Fun and special in the same box, which is an odd pairing we think deserves the prize.

## Challenges we ran into

**Making negotiation matter.** Our first version had influence points, card combos, delayed effects, and a pile of city meters. People could not tell what was going on. The fix was to make "Make a Deal" change the actual proposal. "I'll back your plan if you guarantee access to my building" only means something if the guarantee goes into the plan, costs money, and is saved in the record. We cut the rest.

**Scoring the Mayor.** The Mayor picks the agenda, but that should not mean the Mayor wins. We gave every role explicit objectives, scored on what actually happened, with a critical objective for the Mayor and a rule that the Mayor's reserve test is separate from the shared City point so budget compliance is never counted twice. We also made sure every role can reach a 0 and a 3 in every scenario.

**Turning documents into scenarios.** A planning document is not a game. We had to work out where an issue is, which facts are current, which concerns are documented, and which options are only illustrative. Two sources disagreed on the Mid-Beach sand project's cost and volume, so the corpus records both and the game uses one with a note.

**Keeping simulation honest.** A FEMA flood zone is real. A claim that a project cuts flooding by some amount is an assumption. We keep those apart and label them in the interface.

**Not mistaking play for opinion.** A role play vote is not a resident survey, and online comments are not representative. We separate in role decisions, voluntary personal answers, and cited public record themes.

## Accomplishments that we're proud of

- A full three round game, playable with four people or with bots, built on real sourced Miami Beach stories and a real map.
- Every point on screen comes with a plain reason, and the outcome comes from a rules engine and not from a model.
- A research pipeline where each game round links back to documents a player can open.
- A simulator that evaluates all 1,400 possible plans and shows how the one your table built compares with others, with its assumptions listed in the open.
- A Civic Atlas that keeps role play and personal answers separate and shows sample sizes.
- A public ledger on Solana, so anyone can check a match record was not edited after the fact, with a design for non-transferable contribution cards to reward people for taking part.
- A look people want to click on before they find out it is civic technology.

## What we learned

We thought the hard part would be getting a whole city into a game. It turned out the interesting moment is small: someone saying "I could support that, but only if." That is where an argument becomes a design problem you can negotiate, like where a sidewalk goes, who pays, or what land stays public.

We also learned how much city information is public but hard for an ordinary person to find and read, and that making it current, linked to its source, and tied to a place is a big part of the work. And we learned to give AI the jobs it is good at, which are finding, organizing, and explaining information, and not to have it pose as a city engineer or as the public.

## What's next for Coastal Clash

Run it in a real participatory planning workshop with residents and planning researchers. Check whether players understand the projects behind each card, have domain experts review the simulator's assumptions, and see whether the format surfaces conditions that a questionnaire misses. We also want to take the contribution cards from prototype to a real partner, with a city or planning group acting as the authority that recognizes useful input. After that, point the research swarm at other cities and other kinds of conflict, such as transportation, housing, public space, and utilities, knowing each city brings its own data and rules.

People already love making decisions about imaginary cities. We want to find out whether that same energy can help real ones have better conversations.

## Sources

Source descriptions supplied with the Devpost context:

- GeoGuessr: company overview, more than 100 million cumulative players.
- Rio Rancho: 2025 Citizen Survey, 3,000 households, 11% response, margin of error reported by the city.
- University of Michigan: Michigan Public Policy Survey. The 65% is jurisdictions, not residents.
- Seattle: I-5 Lid engagement solicitation, an estimated $250,000 contract.
- American Planning Association: Why Paid Community Engagement Is Worth the Investment. One regional council's practice, not a universal cost.
- Boston: first participatory budgeting cycle.
- New York City: The People's Money results, 131,527 votes.
- Miami Beach: Sea Level Rise Adaptation Plan, more than 67,000 vulnerable assets.
- Southeast Florida Regional Climate Change Compact: plan funding.
- Miami Beach: West Avenue Neighborhood Improvements, $100,229,771 published budget, roads raised about 24 inches.
- Miami Beach: Sea Level Rise Vulnerability Assessment.
- NOAA: Sea Level Rise Data, and CO-OPS station 8723214 (Virginia Key) for the tide levels the simulator uses.
- Miami Today: 44-story limit on the Alton Road site. Sources disagree on the tower's height (519 ft or 553 ft).
- Miami Today: Miami-Dade seeks new ways to retain vital beach sand, and Dredging Today: USACE nearing completion of the Miami Beach project. The two differ slightly on cost and volume.
