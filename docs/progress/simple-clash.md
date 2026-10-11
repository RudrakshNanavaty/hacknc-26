# Simple-clash line of work: where things stand (handoff)

The handoff for the `simple-clash/` folder. Read it after `AGENTS.md` and before changing anything; update it at the end of each piece of
work. The game itself (Planning Edition, rules `planning-1.0.0`) is described in [`../planning-edition.md`](../planning-edition.md); the
earlier map-board history is in [`map-board.md`](map-board.md) and [`coastal-clash-evolution.md`](coastal-clash-evolution.md).
Last updated 2026-10-11.

## The branches (the `simple-clash/` git worktree of `github.com/RudrakshNanavaty/hacknc-26`)

```
pratham/map-board-onboarding   d6b311f   three round steps, plain cards, Sprint (see map-board.md)
└─ aum/simple-clash            5ef187a   Aum: Planning Edition (three real fights, one plan, a simulator) + explicit role objectives
   └─ pratham/seascape-bubbles 6676bf4   + underwater seascape, floating bubbles, liquid-glass join panel     (pushed, checked out here)
```

- `pratham/seascape-bubbles` is `aum/simple-clash` plus the visual pass below; it changes no rules or game logic. Ready for a PR into
  `aum/simple-clash`: https://github.com/RudrakshNanavaty/hacknc-26/pull/new/pratham/seascape-bubbles
- Other lines of work live in other folders: `map-board/` (`rdx/map-board`, `pratham/map-board-onboarding`, `pratham/beginner-mode`,
  the unpushed `pratham/intro`; handoff in that branch's `docs/progress/map-board.md`). Do not merge across them without asking.
- `.env` in this folder holds the keys (git-ignored). Untracked and not committed: `background_seascape.png`, `bubbles.png` and
  `Sunlit Tropical Bubble Seascape.png` at the folder root (the first two duplicate the copies in `app/public/`).

## How to run (this machine)

- In Git Bash: `export PATH="$HOME/.bun/bin:$APPDATA/fnm/node-versions/v22.23.3/installation:$PATH"` (Bun 1.4.3; Node 22.23, not the
  default 22.11, which crashes the WebSocket test).
- `bun install`, `bun run dev` (game http://localhost:5173; :8787 is the API only), `bun run typecheck`, `bun run test`.
- Only one folder's dev server can hold ports 5173/8787 at a time; stop the other one first.

## Status (2026-10-11, `pratham/seascape-bubbles`)

- Typecheck clean; `bun run test`: 215 tests in 20 files pass.
- The Gemini key returns HTTP 402 (credits depleted): narration uses templates and card pictures are placeholders.
- Planning Edition's own verification notes are in `planning-edition.md` ("Verified and not verified").

## Main comparison and merge check (2026-10-11)

- At the user's request, fetched `origin/main` and compared its history and tree with this branch.
- Remote `main` is `31f3040` (`Initial Commit`), the original Next.js starter, already an ancestor of this branch.
  There are no main-only commits. Its old `src/`, root `public/`, Next.js configuration and starter dependencies have already
  been removed/replaced in this branch; nothing obsolete was reintroduced or needed further deletion.
- Saved the UI work as `b75c47b`, then ran `git merge --no-edit origin/main`: `Already up to date.` No conflicts or merge commit.
- Typechecking, all 215 tests, and the production build pass. No remote branch was modified or pushed.

## UI consistency pass (2026-10-11, `b75c47b`)

- Landing, onboarding, loading, and lobby now share `ui/CoastalShell.tsx`: the same header, glossy wordmark, seascape,
  and 78% desktop content width (maximum 1440px), with tablet/mobile gutters.
- `ui/coastal.css` owns the shared glass, typography, controls, spacing, and responsive layouts. It replaces the previous
  onboarding-specific glass overrides. `ui/Stakeholder.tsx` gives landing, onboarding, and lobby the same 48px portraits and identity text.
- The landing map remains interactive inside a glass panel. All navigation, district details, layer toggles, sample cards,
  and data sources remain. The lobby has compact player/QR panels and a full-width three-step guide; the QR has a four-module quiet zone.
- No game/server/protocol changes, new dependencies, or original image edits. Existing root image files remain untracked.
- Verified in Chromium at 1440×900, 1280×720, 768×1024, and 390×844. Shared header/content alignment, glass and background values
  match on all three screens; no horizontal overflow or page errors. Host/join, second-client updates and role switching,
  bot add/remove, QR rendering, map picking/layers, bubble motion and reduced motion passed. Game start checked at both desktop sizes.
- `bun run typecheck`: clean. `bun run test`: 215 passing tests / 20 files. `bun run build`: passes (existing large-chunk advisory).
- Local QA screenshots and side-by-side review: `server/.cache/ui-polish/comparison.html` (git-ignored), with PNGs and `report.json`.
  See [UI polish verification](ui-polish.md). Actual phone hardware and a camera scan were not part of this browser verification.

## Original seascape pass (visual only; layout superseded above)

On the onboarding (join form), loading ("Connecting to room…") and lobby screens, i.e. the `.lagoon` shell in `app/src/routes/Play.tsx`:

- **Seascape**: `app/public/background_seascape.png`, still, `cover` / `center`, softened in CSS (saturation .78, contrast .9, 2.5 px
  blur, a white-aqua veil). The image file is unchanged.
- **Bubbles**: 21 sprites cut from `app/public/bubbles.png` into `app/public/bubbles/*.webp` (872 KB) by
  `app/scripts/extract-bubbles.py`; method in [`../assets.md`](../assets.md). `FloatingBubbles` (`app/src/ui/FloatingBubbles.tsx`):
  back / mid / front layers, 23 on desktop and 13 on phones, small (largest ~75 px, mean ~30 px), slow; CSS transforms only (rise,
  sway, wobble), seeded, negative delays, paused while the tab is hidden, a still scene under `prefers-reduced-motion`,
  `pointer-events: none`. `Seascape` in the same file renders background, veil and bubbles.
- **Join panel** (`JoinForm` in `app/src/game/Lobby.tsx`, `.join-panel` in `styles.css`): about 78% of the width on desktop in two
  columns (name and stakeholders; goals, character line and the button), more frosted and opaque than other panels; stacks on phones.
  Liquid-glass styling for panels, stakeholder cards and chips under `.seascape`. The wordmark is deep ink with a white glow; the header
  is as wide as the join panel on that screen and as the lobby (`max-w-5xl`) on the lobby.
- Checked in a real browser at 1440×900, 1280×720 and 390×844: bubbles rise and loop, clicks pass through (bot seats filled), the pause
  and reduced-motion paths work, sprites have clean edges on black and cyan.

## Known loose ends

- `/verify` still uses the older bubble treatment; it is outside this three-screen polish pass.
- `app/public/bubbles.png` (1.6 MB) ships with the app though only the extraction script needs it; it could move out of `public/`.
- From the earlier work: `app/src/api.ts` and Atlas exports still call `/api/studio*`; `render.yaml` lacks `SNOWFLAKE_*` / `SOLANA_*`.

## Open questions for humans

- Merge `pratham/seascape-bubbles` into `aum/simple-clash` (Aum's branch), or keep it separate?
- Delete the duplicate images at the folder root? Move `bubbles.png` out of `app/public/`?
- Should the seascape also go behind the Atlas?

## Next steps

1. Open the PR for `pratham/seascape-bubbles` and ask Aum to review the join-panel layout.
2. Verify the full Planning Edition match at 1280×720 and on physical devices; this pass covers the pre-game screens and starting a match.
3. Top up the Gemini key and replay one match with narration and card art.
