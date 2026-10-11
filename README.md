# Coastal Clash

**Clash Royale meets real-world coastal planning.** Four players take the roles of Mayor, Environmental Activist, Resort Owner and Resident, deploy cards on a real map of Miami Beach, watch their proposals collide, negotiate, and see the city change. Every match is saved as geographically linked planning feedback that planners can explore in **Planning Studio**. HackNC 2026.

## How a match works

1. **Lobby.** Open a room and share the code or QR. Four stakeholders; empty seats can be bots. The host picks whether this is a demo session or a community session. Play is turn-based: there is no clock, and every step moves on when all players present are ready.
2. **Three rounds**, each a crisis written live for the match from NOAA's Virginia Key tide gauge, the NWS forecast and the areas' real flood and zoning facts (an authored scenario stands in without Gemini). Each round has five phases: **Crisis** (spotlight on real places; from round 2, a twist), **Play a card** (each crisis deals 4 of your 6 cards; click an area on the map to see which you can play there; hidden, influence permitting, only where the real zoning and FEMA layers allow it), **Reveal** (cards fly, the characters walk to where they played), **Negotiate** (back, oppose, fund, or accept a deal; a live verdict runs the rules engine; public hints show which moves would change an outcome), **Resolve** (a deterministic engine decides and shows every rule it applied; combos fire; the map and meters change).
   On the tilted 3D map, the four stakeholders and a Fisherman on the South Pointe pier react in speech bubbles. A Gemini Game Director words bubbles, hints and explanations and proposes twists; the rules validate every proposal and decide every number.
3. **End.** Scores per persona and city viability. Then one optional question: *"Outside your assigned character, which proposal would you personally support?"*
4. **Planning Studio** (`/studio`). Hotspots on the real map, card distribution, the most common objections, compromises accepted, in-role versus personal preferences, a replay of every match, provenance, and JSON, CSV and GeoJSON exports with coordinates and source feature ids.

## Real data

| Layer | Source |
|---|---|
| Zoning | [City of Miami Beach GIS, gc_Zoning/0](https://gis.miamibeachfl.gov/public/rest/services/gc/gc_Zoning/MapServer/0) |
| Planning districts | [City of Miami Beach GIS, gc_Cadastral/10](https://gis.miamibeachfl.gov/public/rest/services/gc/gc_Cadastral/MapServer/10) |
| FEMA flood zones | [Miami-Dade County GIS, MD_LandMgtViewer/63](https://gisweb.miamidade.gov/ArcGIS/rest/services/EnerGov/MD_LandMgtViewer/MapServer/63) |
| Live conditions | [NOAA CO-OPS Virginia Key 8723214](https://tidesandcurrents.noaa.gov/stationhome.html?id=8723214) water level, predictions and flood thresholds; [NWS](https://api.weather.gov) forecast for Miami Beach |
| Street map | OpenFreeMap (OpenMapTiles, OpenStreetMap data); Esri World Imagery as an optional satellite layer |

`bun run data` rebuilds `app/public/data/miami-beach/` and `shared/src/data/districts.json` (raw answers cached in `pipeline/cache/`; `--refresh` refetches). Card effects are illustrative scenario values and budgets are hypothetical; the game says so wherever it shows them.

## Run it

Requires [Bun](https://bun.sh) 1.4+ (Node 20+ compatible).

```bash
bun install
cp .env.example .env   # everything is optional
bun run dev            # app on :5173, server on :8787
bun run test           # engine, rooms, a four-client WebSocket match, studio exports
bun run typecheck
```

Architecture, the audit of the code this was built from (Pocket Rivals, Mayday Mayor), the rules and the demo script: [`docs/coastal-clash.md`](docs/coastal-clash.md).
