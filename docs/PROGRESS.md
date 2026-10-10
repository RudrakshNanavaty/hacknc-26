# ReefForge progress

## Done (aum/dev)
- **Frutiger Aero theme** on every screen (`app/src/styles.css`: glass panels, gel buttons, bubbles, Nunito).
- **Living Ocean globe**: satellite imagery, sky atmosphere, glossy reef pins with labels, idle spin. Reef card with satellite imagery of the reef, water conditions, live NOAA heat stress and provenance tags. Sources panel: satellite, NOAA seafloor relief, NOAA heat-stress grid (`/api/reefs/:id/heat-grid`), data sites. "Dive in" flies onto the reef and fades through bubbles into the workshop.
- **Underwater workshop** (React Three Fiber, all procedural): seabed with caustics, light shafts, corals, seagrass, fish, bubbles, plankton, glazed grid platform, descending camera, orbit/zoom.
- **Builder**: block, ridge, arch, tunnel; select, move, rotate, delete; 2.5 mm / 0.5 mm snapping; green/red preview with the reason (outside, overlap, floating, budget); undo/redo; material meter; templates; browser save slots; JSON import/export; STL export; keyboard shortcuts.
- **Prototype larvae** (`shared/src/sim/prototype.ts`, model documented in the file): deterministic per seed; glowing larvae with trails, gold on contact; replay bar with scrub and speed; measured metrics only. Settlement shows "Scientific engine pending".
- **Rooms**: full workshop while building, shared timer and seed, lock in, arcade ranking (most larvae reached, then less material, labelled as not science), "Watch" replays any player's design.
- **Research Mode**: every test stored with design, conditions, seed and model version; JSON record and STL mesh per experiment.
- Shared core: pieces with bounds/overlap/support checks, `pieces` extension of the design format, STL, server re-evaluates every design. 21 tests pass; typecheck and build clean.

## Fixed
- Workshop scene vanished ("Context Lost") from a zustand selector that returned a new object every call (infinite re-render). The preview now derives its candidate from shallow-selected inputs; a scene error boundary shows "Reload the scene" instead of a blank screen.

## Next
1. Click-through test: placing, moving, deleting, larvae replay, a two-player room, Research Mode; phone layout at 390 px.
2. Drag-and-drop moving (today: select, Move, click).
3. Wire Gemini (explain a run from its stored numbers) and ElevenLabs (briefing narration) into the new UI.
4. Heron Island current presets from the IMOS GBRHIS current meters.
5. Split the 3D code into its own chunk (bundle is over 500 kB).
6. The validated settlement engine (flow solver + settlement rules, checked against Levenstein et al. 2022).
7. Solana: undecided, confirm with the team.
