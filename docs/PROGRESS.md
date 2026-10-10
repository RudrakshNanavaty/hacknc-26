# ReefForge progress

## Done (aum/dev)
- Shared core: workshop pieces (block, ridge, arch, tunnel) with rotation, bounds, overlap and support checks; designs keep editable `pieces` (documented extension of `{grid, solid}`); tile widened to 96x24x48 voxels (48x12x24 mm, still 0.5 mm voxels).
- Prototype larvae simulation (`shared/src/sim/prototype.ts`): deterministic, explicit parameters, model documented in the file header. Reports encounters and shelter time only; settlement stays null ("Scientific engine pending").
- Server stores prototype metrics with every experiment; rooms rank by an explicit arcade objective (most larvae reaching the structure, then less material).
- Binary STL export of the design surface (`shared/src/mesh.ts`).
- Heat-stress map grid route `/api/reefs/:id/heat-grid` (NOAA CRW; their WMS answers 502, so we grid it ourselves).
- Reef packs have imagery extents (Esri World Imagery thumbnails verified) and data-source locations.
- Frutiger Aero theme in `app/src/styles.css` (glass panels, gel buttons, bubbles, Nunito).
- 21 tests pass; typecheck and production build clean.

## Next
1. Restyle screens with the Aero classes (`glass`, `aero-btn` ...); old print-style classes no longer render.
2. Globe: satellite default, atmosphere, glossy reef pins, layers panel (satellite, NOAA seafloor relief, heat grid, data sites), reef imagery on the card, dive transition.
3. Underwater R3F scene (installed: three 0.170, @react-three/fiber 8.18, drei 9.122) and the voxel builder UI on `pieces.ts`.
4. Larvae replay rendering from `runPrototype` frames; room results with replays.
5. Real-browser two-player test, desktop and phone.
6. Solana: undecided, confirm with the team.
