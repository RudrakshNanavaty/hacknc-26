# ReefForge

**Build for fun. Discover for real.** A multiplayer underwater construction game where every structure a player builds is evaluated as a coral settlement experiment on real reef data. HackNC 2026.

Product vision: [`docs/reefforge-one-pager.md`](docs/reefforge-one-pager.md). Data sources and what is verified: [`docs/scientific-data-audit.md`](docs/scientific-data-audit.md).

## How it works

1. **Pick a real reef** on the globe. Kāneʻohe Bay, Oʻahu opens the game: it is where researchers tested 3D-printed helix-recess settlement modules.
2. **Build a settlement tile** in the underwater workshop, within a material budget.
3. **Test it.** The server evaluates the design under the reef's water conditions and stores the experiment with its seed and model version, so anyone can re-run it.
4. **Compete** in Reef Rivals rooms: 2–4 players, same reef, same water, same seed.
5. **Research Mode** lists every experiment as an exportable record.

Every environmental value is tagged with where it comes from: measured, published, ocean model, or game-defined.

## Architecture

Built on the Mayday Mayor (WolfHacks 2026) structure:

```
shared/   TypeScript used by app and server: reef packs, design format, room protocol,
          reference tiles, and the evaluation engine (the flow and larvae model plugs in here).
app/      Vite, React, MapLibre globe, Tailwind. Landing globe, workshop, rooms, Research Mode.
server/   Fastify and WebSockets: rooms, experiment store (Tiger Data or memory),
          NOAA heat stress, Gemini, ElevenLabs.
docs/     One-pager and data audit.
```

The server re-evaluates every design, so results cannot be faked. Every integration fails soft: without a database, AI key or voice key the game still runs.

## Run it locally

Requires [Bun](https://bun.sh) 1.4+.

```bash
bun install
cp .env.example .env   # everything is optional
bun dev                # app on :5173, server on :8787
```

```bash
bun test
bun run typecheck
```

## Status

- Done: globe with reef packs, reef cards with live NOAA heat stress, solo tests, rooms end to end, experiment records (memory or Tiger Data), Research Mode list and JSON export.
- Next: the 3D voxel workshop (React Three Fiber), the flow and larval settlement engine, and validation against Levenstein et al. 2022. Until the engine lands, the settlement rate shows as "engine pending" rather than a made-up number.
