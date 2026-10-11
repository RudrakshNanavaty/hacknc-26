# Coastal Clash

**Clash Royale meets real-world coastal planning.** Four players take the roles of Mayor, Environmental Activist, Resort Owner and Resident, deploy cards on a real map of Miami Beach, watch their proposals collide, negotiate, and see the city change. Every round re-enacts a real, cited Miami Beach civic story. Every match is saved as geographically linked planning feedback that planners explore in **Civic Atlas**, and fingerprinted on Solana devnet so anyone can check it. HackNC 2026.

## How a match works

1. **Lobby.** Open a room and share the code or QR. Four stakeholders, one laptop each; empty seats can be bots. The host picks the mode: **Beginner** (the default: one decision a round in one place, 2-3 cards each, Support / Oppose / Suggest a Change, no points to count, ending in a shareable city plan) or **Advanced** (every card, influence, deals, combos and the game score); whether this is a demo session or a community session; and the pace: **turn by turn** (no clock; every step moves on when all players present are ready, and the host can move on without someone who is away) or **Sprint** (each step on a short server clock, about 60 seconds a round, so a match takes under four minutes). The lobby explains the game in three steps.
2. **Three rounds.** Each one is a real Miami Beach story from the reviewed research corpus (each match draws a different three), with a headline written live from NOAA's Virginia Key tide gauge and the NWS forecast. Without the corpus, Gemini writes the crisis from the live readings; without Gemini, an authored scenario stands in. Each round is three steps, tracked at the top of the screen:
   - **1 · Play a Card.** The crisis lands first: spotlight on real places, the story's sources on screen, and from round 2 a twist. Each crisis deals 4 of your 6 cards, each in plain words (✅ what is good, ⚠️ what is bad, 💲 what it costs the city). Pick one and the green areas on the map show where the real zoning and FEMA layers allow it; click one to see what it does to the city's money, then play it. It stays hidden and costs influence.
   - **2 · Make a Deal.** The cards fly to their places and the characters walk there. A case file pinned to the proposal's area shows the likely outcome and only the moves you can make, each previewed by the rules engine. Advanced: **Support**, **Oppose**, **Pay for it** (cover the public bill) or, on your own project, **Accept deal**. Beginner: **Support**, **Oppose** or **Suggest a Change** (a condition the proposer may accept).
   - **3 · See What Happens.** Each proposal's verdict lands on the map and reads as one plain sentence (what changed, what it cost, why); the deterministic engine's rules are one click away; combos fire; the map and meters change. After round 3 **the storm hits**: the city's flood safety rises against the 50 it needs, and if it falls short the real FEMA flood zones fill up across the map.

   The four stakeholders stand on the tilted 3D map as 3D figures and react in speech bubbles; a news anchor reads the headlines. With an ElevenLabs key they speak. A Gemini Game Director words bubbles, hints and explanations and proposes twists; the rules validate every proposal and decide every number. Each card's picture is painted by Gemini in one house style.
3. **End.** Beginner: is the city viable, did it survive the storm, which stakeholder goals were met, then a link to the city plan (`/plan/:matchId`: what was built on the map, with documented facts, simulated effects and the group's decisions kept apart) and one optional personal yes/no question about a real decision from the match. Advanced: scores per persona and city viability, then one optional question: *"Outside your assigned character, which proposal would you personally support?"* The end screen links to the match's public check (`/verify/:matchId`).
4. **Civic Atlas** (`/atlas`; `/studio` still opens it). What many matches add up to, for city planners: where proposals pass and stall (by area and by project), what concessions unlock them, how the same table behaves under different crises, who helps and hinders whom, how the cities come out, and where the role differs from the person. Every figure carries its sample size and interval, sessions and bots are kept apart, and each table exports as CSV. Per-match replay and the full decision log sit beside the aggregates.

## Real data

| Layer | Source |
|---|---|
| Zoning | [City of Miami Beach GIS, gc_Zoning/0](https://gis.miamibeachfl.gov/public/rest/services/gc/gc_Zoning/MapServer/0) |
| Planning districts | [City of Miami Beach GIS, gc_Cadastral/10](https://gis.miamibeachfl.gov/public/rest/services/gc/gc_Cadastral/MapServer/10) |
| FEMA flood zones | [Miami-Dade County GIS, MD_LandMgtViewer/63](https://gisweb.miamidade.gov/ArcGIS/rest/services/EnerGov/MD_LandMgtViewer/MapServer/63) |
| Live conditions | [NOAA CO-OPS Virginia Key 8723214](https://tidesandcurrents.noaa.gov/stationhome.html?id=8723214) water level, predictions and flood thresholds; [NWS](https://api.weather.gov) forecast for Miami Beach |
| Civic stories | 38 reviewed Miami Beach stories with 62 source links (`pipeline/research/miami-beach-civic-corpus.json`), served from Snowflake |
| Street map | OpenFreeMap (OpenMapTiles, OpenStreetMap data); Esri World Imagery as an optional satellite layer |

`bun run data` rebuilds `app/public/data/miami-beach/` (including the flood zones clipped to each area) and `shared/src/data/districts.json` (raw answers cached in `pipeline/cache/`; `--refresh` refetches). Card effects are illustrative scenario values and budgets are hypothetical; the game says so wherever it shows them.

## Run it

Requires [Bun](https://bun.sh) 1.4+ and Node 20.19+ or 22.12+ (the tests run on Node). On Windows, install Bun with `powershell -c "irm bun.sh/install.ps1 | iex"`.

```bash
bun install
cp .env.example .env   # everything is optional
bun run dev            # app on :5173, server on :8787
bun run test           # engine, stories, atlas, rooms, a four-client WebSocket match, card art, voice, Solana record
bun run typecheck
```

Start with [`AGENTS.md`](AGENTS.md), then [`docs/progress/map-board.md`](docs/progress/map-board.md) (where this branch stands). Setup, the code map and recipes: [`docs/contributing.md`](docs/contributing.md). The product, the rules and the demo script: [`docs/coastal-clash.md`](docs/coastal-clash.md).
