# Contributing

How 3–4 people (and their AI agents) can work in parallel for 24 hours without breaking each other's code.

## Branches and merging
- `main` must always be demoable. Never push broken builds to it.
- Name branches `<stream>/<short-name>`, for example `sim/lbm-bounceback`, `ui/dock`, `scene/larva-trails`.
- **Merge at least every 2 hours.** A small branch that lives a short time beats a big branch that lives a long time.
- Before merging: rebase on `main`, then run `npm test && npm run typecheck`, then merge.
- Self-merge is fine **except** for:
  - Files in `src/contracts/`, which need one other person to approve.
  - `benchmark/`, which needs the Science owner, and the pre-registration file is frozen once committed.
  - `src/ui/tokens.css`, which needs the UI owner.

## Commit messages
Write `<stream>: <what changed>`, for example `sim: add Zou-He inflow boundary`.

## Who owns what
See `docs/WORKSTREAMS.md`. You may read any folder. Only write outside your own folder when you're pairing with that folder's owner, or when the change is a one-line fix you tell them about.

## Working against unfinished parts
Every stream can start in hour 0 because the contracts and fixtures already exist:
- UI and Scene work against `fixtures/sample-record.json` and `src/sim/mockWorker.ts` until the real solver lands.
- Sim works headless through `npm run benchmark` and needs no UI at all.
- To switch from the mock worker to the real one, flip `VITE_USE_MOCK_SIM=false`.

## Sync points (all 4 people, 5 minutes)
| Hour | Agenda |
|---|---|
| 0 | Confirm the contracts, assign streams, create the branches |
| 6 | **Calibration gate.** Is flat vs. ridge stable? Freeze the parameters and pre-register, or switch to the fallback. |
| 10 | **Held-out gate.** Record the recess result. Wire the real worker into the UI. |
| 16 | Visual review against the UI skill checklist. Cut anything not done. |
| 20 | **Feature freeze.** From here on: bug fixes, demo rehearsal, backup video. |

## When contracts disagree
The person who needs the change opens a PR touching only `src/contracts/` and `fixtures/`, and posts it in the team chat. Nobody codes against the new shape until that PR is merged.
