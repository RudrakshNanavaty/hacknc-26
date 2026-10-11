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

## What `pratham/seascape-bubbles` adds (visual only)

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

- The landing page (`/`, the live map) and `/verify` still use the old CSS-circle bubbles (`ui/Bubbles.tsx`, `LagoonBubbles`); the
  seascape was kept to the onboarding, loading and lobby screens on purpose.
- `app/public/bubbles.png` (1.6 MB) ships with the app though only the extraction script needs it; it could move out of `public/`.
- The lobby screen ("The council is assembling") keeps its old size; only the join panel was widened.
- From the earlier work: `app/src/api.ts` and Atlas exports still call `/api/studio*`; `render.yaml` lacks `SNOWFLAKE_*` / `SOLANA_*`.

## Open questions for humans

- Merge `pratham/seascape-bubbles` into `aum/simple-clash` (Aum's branch), or keep it separate?
- Delete the duplicate images at the folder root? Move `bubbles.png` out of `app/public/`?
- Should the seascape also go behind the landing page or the Atlas?

## Next steps

1. Open the PR for `pratham/seascape-bubbles` and ask Aum to review the join-panel layout.
2. Run the Planning Edition at 1280×720 and on a phone (not yet verified per `planning-edition.md`), now with the new screens.
3. Top up the Gemini key and replay one match with narration and card art.
