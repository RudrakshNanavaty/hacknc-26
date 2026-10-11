# Coastal Clash

**Clash Royale meets real-world coastal planning.** Four players take the roles of Mayor, Environmental Activist, Resort Owner and Resident, deploy cards on a real map of Miami Beach, watch their proposals collide, negotiate, and see the city change. Every match is saved as geographically linked planning feedback that planners can explore in **Planning Studio**. HackNC 2026.

## How a match works

1. **Lobby.** Open a room and share the code or QR. Four stakeholders; empty seats can be bots. The host picks the pace (standard about 4 minutes, demo about 2) and whether this is a demo session or a community session.
2. **Three rounds** (king tide, oceanfront hotel boom, storm season). Each round has five phases: **Crisis** (spotlight on real places), **Play a card** (hidden, one per player, influence permitting, only where the real zoning and FEMA layers allow it), **Reveal** (cards fly to their targets), **Negotiate** (back, oppose, fund, or accept a compromise; a live preview runs the rules engine), **Resolve** (a deterministic engine decides and shows every rule it applied; the map and indicators change).
3. **End.** Scores per persona and city viability. Then one optional question: *"Outside your assigned character, which proposal would you personally support?"*
4. **Planning Studio** (`/studio`). Hotspots on the real map, card distribution, the most common objections, compromises accepted, in-role versus personal preferences, a replay of every match, provenance, and JSON, CSV and GeoJSON exports with coordinates and source feature ids.

## Real data

| Layer | Source |
|---|---|
| Zoning | [City of Miami Beach GIS, gc_Zoning/0](https://gis.miamibeachfl.gov/public/rest/services/gc/gc_Zoning/MapServer/0) |
| Planning districts | [City of Miami Beach GIS, gc_Cadastral/10](https://gis.miamibeachfl.gov/public/rest/services/gc/gc_Cadastral/MapServer/10) |
| FEMA flood zones | [Miami-Dade County GIS, MD_LandMgtViewer/63](https://gisweb.miamidade.gov/ArcGIS/rest/services/EnerGov/MD_LandMgtViewer/MapServer/63) |
| Imagery | Esri World Imagery |

`npm run data` rebuilds `app/public/data/miami-beach/` and `shared/src/data/districts.json` (raw answers cached in `pipeline/cache/`; `--refresh` refetches). Card effects are illustrative scenario values and budgets are hypothetical; the game says so wherever it shows them.

## Run it

Requires Node 20+.

```bash
npm install
cp .env.example .env   # everything is optional
npm run dev            # app on :5173, server on :8787
npm test               # engine, rooms, a four-client WebSocket match, studio exports
npm run typecheck
```

Architecture, the audit of the code this was built from (Pocket Rivals, Mayday Mayor), the rules and the demo script: [`docs/coastal-clash.md`](docs/coastal-clash.md).
