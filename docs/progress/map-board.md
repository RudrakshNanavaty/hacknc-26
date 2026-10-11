# Map-board line of work: where things stand (handoff)

The working notes for the map-board branches. Read this after `AGENTS.md` and before you change anything; update it at the end of each
piece of work. Design decisions with their reasons are in [`coastal-clash-evolution.md`](coastal-clash-evolution.md) (history + rationale).
Last updated 2026-10-11.

## The branches (all in the `map-board/` git worktree of `github.com/RudrakshNanavaty/hacknc-26`)

```
rdx/map-board                      891e7fc  the map-board game (baseline, see "What rdx/map-board is" below)
├─ pratham/map-board-onboarding    d6b311f  + three round steps, plain cards, Sprint pace, readable-at-a-glance UI   (pushed)
│  └─ pratham/beginner-mode        95799ca  + Beginner Mode, city plan page, personal question          (pushed, newest)
└─ pratham/intro                   (local)  + the 3D cinematic intro on the landing page                (NOT pushed)
```

- **`pratham/beginner-mode` is the most complete branch** and contains the onboarding work. Start new work from it unless told otherwise.
- **`pratham/intro`** branches from `rdx/map-board`, not from the others: it does not have Sprint or Beginner Mode, and they do not
  have the intro. It touches `App.tsx`, `routes/Landing.tsx`, `game/Lobby.tsx` and `ui/sound.ts`; merging it into `pratham/beginner-mode`
  should conflict only lightly in `Lobby.tsx` (both read a saved name) and `App.tsx` (both add a route).
- No branch has been merged into `rdx/map-board`. Do not merge, push or pull other branches unless the person you work with asks.
- `Coastal Clash_ Animated Game Intro Guide.png` at the worktree root is an untracked storyboard image (not used yet, not committed).

## How to run (this machine)

- Bun 1.4.3 is in `~/.bun/bin`; use fnm's Node 22.23 (`%APPDATA%/fnm/node-versions/v22.23.3/installation`), not the default 22.11
  (the WebSocket test crashes on it). In Git Bash: `export PATH="$HOME/.bun/bin:$APPDATA/fnm/node-versions/v22.23.3/installation:$PATH"`.
- `bun run dev` (app http://localhost:5173, server :8787 is the API only), `bun run typecheck`, `bun run test`.
- After switching branches, stop the dev server and delete `app/node_modules/.vite` if the page looks stale.

## Status

| Branch | Rules | Tests (2026-10-11) | Checked in a browser |
|---|---|---|---|
| `pratham/beginner-mode` | Advanced `coastal-clash-rules/2.0.0` + Beginner `coastal-clash-beginner/1.0.0` | 174 pass, 18 files; typecheck clean | Beginner turn by turn 1440×900, Beginner Sprint 1280×720 (135 s), plan page |
| `pratham/map-board-onboarding` | 2.0.0 | 157 pass | Advanced turn by turn 1440×900 and 1280×720, Sprint 1280×720 (156 s) |
| `pratham/intro` | 2.0.0 | 149 of 151 (the 2 failures are the Windows `/dev/null` store bug fixed on the onboarding branch) | intro at 1440×900, 1280×720, 390 px; skip, mute, reduced motion, no WebGL, missing model |

- `pratham/coastal-clash` has moved to a money/agreements rules 3.0.0 that none of these branches have.
- The Gemini key returned HTTP 402 (credits depleted) all day: card pictures are placeholders and narration is the templates.

## What each branch adds

### `pratham/beginner-mode`: Beginner Mode (the default for new tables)
Code: `shared/src/game/beginner.ts`, engine rules C5/O8 in `engine.ts`, `server/src/rooms.ts` (`setMode`), `app/src/game/Beginner.tsx`,
`app/src/routes/Plan.tsx`. Tests: `shared/src/game/beginner.test.ts`, the "Beginner Mode rooms" block in `server/src/rooms.test.ts`.
- One conflict a round (one project, proposer, district). A documented story is used only when its own deal is legal in its own
  district and its text names the project (`storyIsAbout`); else a labelled authored scenario. 20 of 31 approved stories qualify.
- 2-3 cards each, picked for the conflict; no influence; one card and one table move a round.
- Support / Oppose / Suggest a Change (a real engine rule: accepted +1 support and its effect, refused +1 opposition; built once).
- Bots argue authored agendas (`AGENDA`) so a human choice changes a real result; a test checks every seat of every authored round.
- End: city viability, the storm, one line per stakeholder goal; Advanced points folded away. `/plan/:matchId`: shareable plan
  (Documented / Simulated / Decided). One optional personal yes/no/not-sure question, stored apart (`PreferenceResponse.stance`).
- Contracts: `RoomState.mode/conflict`, `ClientMsg {t:'mode'}`, `respond.stance`, `MatchRecord.mode`, `NegotiationMove 'suggest'`,
  `CompromiseKind 'change'`, CSV `stance` column. Server default is Advanced; the lobby switches new tables to Beginner once.

### `pratham/map-board-onboarding`: readable Advanced Mode and Sprint
- The round as three steps with one short instruction (`app/src/game/Steps.tsx`); Flood safety and City money in the HUD, the rest in a
  City drawer; cards show one benefit and the cost, the downside on the held card (`shared/src/game/simple.ts`); a compact confirm with
  Lock it in / Change area / Change card; the case file lists only valid moves with engine previews (Support, Oppose, Pay for it,
  Accept deal); one sentence per result; the storm after round 3 (`app/src/game/Climax.tsx`); news and bubbles quiet while you decide.
- Sprint (`setPace`, `SPRINT_MS` in `shared/src/room.ts`): 60 s a round on server deadlines; turn by turn stays the default.
- `/fx-lab?storm=win|loss` plays the storm from an engine fixture. Fix: `MemoryCivicStore` no longer writes a file.

### `pratham/intro`: the cinematic intro
`app/src/intro/`: name entry, a ~12 s three.js film (dock, the Fisherman Hero with a jointed rod, the catch, the fish into the camera,
bubble, logo, reveal), one master timeline, Skip, mute, short path for reduced motion / no WebGL / missing model. First visit only;
`?intro=1` or "Replay intro" plays it again. `app/public/characters/fisherman.glb` is a static mesh (no rig): whole-body motion only.
The Fisherman stays intro-only.

### `rdx/map-board` (baseline)
The map is the whole board; real civic stories (Snowflake corpus, Gemini casting); Solana public record (`/verify/:matchId`); Tiger
Data for the whole app; turn-based play; Gemini card art; Civic Atlas (`/atlas`); 3D GLB portraits; ElevenLabs voices.

## Known loose ends

- Card art and live narration need a Gemini key with credit; Beginner could ship static art for its ~15 cards.
- Beginner reveal step swaps to the Advanced case file (style jump); a compact "who played what" strip would fit better.
- Only 20 of 31 stories fit Beginner; a `project` field in the research corpus would replace the keyword check.
- Beginner bots accept every suggested change; letting a bot refuse a change that costs its own goal would make suggestions riskier.
- `/plan/:matchId` needs the match on the server; no print stylesheet yet.
- The intro's rod floats near the hand (no grip pose); its 3D bubbles look a little like frosted balls.
- `app/src/api.ts` and the Atlas exports still call `/api/studio*` (they work; historical names). `render.yaml` lacks `SNOWFLAKE_*`/`SOLANA_*`.

## Open questions for humans

- Which branch becomes the demo build, and whether `pratham/intro` should be rebased onto `pratham/beginner-mode` and pushed.
- Whether these branches should take the rules 3.0.0 money work from `pratham/coastal-clash`. Not decided; do not merge without asking.
- Card balance, combo bonuses, upkeep, twist sizes, and the Beginner `AGENDA` and `SUGGESTED_CHANGES` are first guesses; playtest them.

## Next steps

1. Run the 5-question Beginner usability test (script in `coastal-clash-evolution.md`) with two or three first-time players.
2. Decide the demo branch; bring the intro onto it (rebase `pratham/intro` onto `pratham/beginner-mode`, fix `Lobby.tsx`/`App.tsx`).
3. Top up the Gemini key, then replay one Beginner match with live stories, narration and card art.
