# ReefForge

> Shape changes flow. Flow changes where coral larvae settle. Build a seabed profile and watch it happen.

ReefForge is a HackNC 2026 project: a browser-based scientific sandbox with a Frutiger Aero look. A player edits a **2D substrate profile**. A **lattice-Boltzmann flow solver** runs in a Web Worker, and **simulated larvae** drift, swim and settle. The score is **simulated settlement %**, compared against flat, ridge and recess baselines.

It is a toy model with a falsifiable, pre-registered benchmark. It is **not** a validated restoration tool.

---

## Start here

| If you are… | Read, in order |
|---|---|
| **New to the team** | This README → [`docs/WORKSTREAMS.md`](docs/WORKSTREAMS.md) → [`CONTRIBUTING.md`](CONTRIBUTING.md) |
| **Working on the simulation or science** | [`docs/SCIENCE.md`](docs/SCIENCE.md) → [`docs/CONTRACTS.md`](docs/CONTRACTS.md) → [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) |
| **Working on the builder or 3D scene** | [`docs/CONTRACTS.md`](docs/CONTRACTS.md) → [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) |
| **Working on UI or styling** | [`.claude/skills/reefforge-ui/SKILL.md`](.claude/skills/reefforge-ui/SKILL.md) — **required before touching anything visual** |
| **Pitching or demoing** | [`docs/DEMO.md`](docs/DEMO.md) |
| **An AI coding agent** | [`CLAUDE.md`](CLAUDE.md) |

Live status is in [`PROGRESS.md`](PROGRESS.md). Decisions are logged in [`DECISIONS.md`](DECISIONS.md).

---

## Quick start

```bash
npm install
npm run dev                          # app at http://localhost:5173
npm test                             # unit + engineering tests
npm run typecheck && npm run lint
npm run benchmark -- calibrate       # flat vs ridge grid → benchmark/calibration.json (done, D-014)
npm run benchmark -- freeze          # writes benchmark/preregistration.json (done, committed)
npm run benchmark -- heldout         # 30-seed recess test → benchmark/results.json
npm run benchmark:regress            # same seed → same output
```

Optional environment variables, set in `.env.local` (already created, gitignored; never commit it):

```
VITE_USE_MOCK_SIM=false   # true = fixture-driven mock worker for UI work
VITE_GEMINI_API_KEY=...   # Gemini critic; the card is hidden without it
VITE_GEMINI_MODEL=gemini-3.8-flash   # optional override
```

---

## The core loop

```
Build profile → Simulate (worker) → Observe larvae → Compare vs baselines → Save record
```

Everything in the repo exists to serve this loop. If a change doesn't help it, it waits until after the hackathon.

---

## Out of scope this weekend

Real-time multiplayer, social profiles, NFC, authentication, native apps, touch building on mobile, 3D CFD, and the autonomous AI optimizer (before the benchmark has run).

Don't stub these, and don't add placeholders for them. See `DECISIONS.md` D-001.
