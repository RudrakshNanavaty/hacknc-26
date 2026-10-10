# ReefForge UI revamp: Frutiger Aero + liquid glass

Self-contained: a fresh session can execute this from this file plus `AGENTS.md`.
Supersedes the earlier draft `docs/ui-revamp-plan.md` (untracked); copy this file over it as the
first commit so the plan lives in the repo.

## Context

ReefForge (HackNC 2026) was forked from Mayday Mayor and still wears its look: flat print-shop
style, hard black outlines, offset ink shadows, `Big Shoulders` condensed type, `chalk/bond/ink`
palette. The hackathon's Frutiger Aero track wants the glossy, optimistic mid-2000s aesthetic
(gel buttons, bubbles, blue skies, turquoise water, nature and technology together) applied to a
sustainability project. The owner wants a **neo-retro** take: Apple Aqua skeuomorphism plus
modern liquid glass, in a sunlit shallow-reef world.

Outcome: every screen restyled with one small custom kit, behaviour unchanged, honest about the
science, demo-ready for the 3-minute judging flow
(globe -> pick reef -> build -> test -> compare -> Research Mode reveal).

## Decisions already made (do not re-litigate)

| Topic | Decision |
|---|---|
| Approach | Custom visual layer (tokens + kit). `@base-ui/react` for behaviour. `motion` (already installed) for animation. No shadcn/MUI/7.css/XP.css. |
| Kit conventions | Plain CSS classes in `styles.css` + a ~5-line `cx()` helper; variants via `data-variant`. No new class-merging deps. Polymorphism: Base UI `render` prop where a Base UI primitive is involved, typed `as` prop otherwise (so `Link` can wear button styles). |
| Skeuomorphism | Restrained: gel only on primary actions (Test, Start the round, Join, Export). Glass elsewhere. One or two hero touches (title plate, medal). Glass-on-glass max two deep. |
| Theme | UI is light-only (sunlit). Leave `globeStyle(..., dark)` and `theme.ts` untouched and unused by new UI. |
| Fonts | Source Sans 3 (400/600/700) for display and body: a crisp humanist sans in the Frutiger/Myriad family. Nunito was tried and dropped at the Phase 1 review (rounded heavy type read as cheap). Drop `Big Shoulders` and Devanagari. |
| Avatars | Keep Open Peeps (CC0) in `app/public/avatars`, add a glossy ring frame. |
| Sound | None in this pass. `ui/sound.ts`, `ui/voice.ts`, `theme.ts` are left alone (no deletions). |
| Refraction | SVG `feDisplacementMap` in `backdrop-filter`, Chromium only, **landing title plate only**, with plain-glass fallback via `@supports`. Cut entirely if it hurts frame rate. |
| Phones (390 px) | Join, lobby, briefing, lock in a prebuilt design, results. Building is desktop-first. Must still have no horizontal scroll and visible focus. |
| Polish priority | 1 Landing, 2 Workshop HUD, 3 room Results, 4 Research. Lobby, briefing, 404 get the kit and nothing more. |
| Copy | Navigation/button microcopy may change. Scientific copy (provenance labels, caveats, engine-pending notice, ranking rule, `ResultLine` text) frozen in meaning. List changed strings in the PR description. |
| Delivery | Merge Phase 1 (tokens + kit + `/kit`, no screen changes) to `main` first; screens in small per-screen PRs after. Work on your own `<name>/dev` branch. |

## Repo facts (verified)

- bun workspaces: `shared/` (pure TS), `app/` (Vite + React 18 + TS strict + Tailwind 4 + zustand
  + motion + MapLibre + qrcode), `server/` (Fastify + ws).
- Commands: `bun install`, `bun run dev` (app :5173, server :8787), `bun run typecheck`,
  `bun test` (vitest, 11 tests). No API keys needed; everything fails soft.
- AGENTS.md rule 5: run typecheck + tests, and check UI in a real browser at **1440 px and 390 px**.
- Working tree has someone else's uncommitted package-manager edits (`package.json`, `bun.lock`,
  `Dockerfile`, `README.md`, `AGENTS.md`, `.gitignore`, deleted `package-lock.json`). **Never stage
  or revert them.** Stage only your own files by path.
- `app/package.json` does not yet list `@base-ui/react`; add it (`^1.9.0` was in the original
  scaffold).
- `app/src` map:
  ```
  styles.css      Tailwind import, :root tokens, @theme inline, keyframes, MapLibre overrides
  tokens.ts       tokens(): reads CSS custom props into JS; THROWS if a listed NAME is missing
                  or not #rrggbb. Used by map/globe.ts (chalk,bond,ink,flood,safe,storm-*) and
                  room/Invite.tsx (ink,bond)
  theme.ts        zustand light/dark; only consumer is routes/Landing.tsx (dark -> globeStyle)
  router.tsx      history router: Link, navigate, matchPath
  App.tsx         route table (/, /research, /solo/:reef, /play/:code, 404)
  routes/         Landing, Solo, Play (lobby/briefing/building/results), Research
  ui/             ReefCard (+ ProvenanceTag), ResultLine, sound.ts, voice.ts
  room/           Invite (QR), useRoom (WebSocket; do not touch)
  workshop/       Workshop.tsx: reference-tile picker, exports `button` class string used by
                  Landing, Solo, Play, Research
  map/globe.ts    globeStyle(tokens, dark, satellite)
  ```
- Gotchas:
  1. Keep `NAMES` in `tokens.ts` and the `:root` vars in `styles.css` in sync, all `#rrggbb`.
     Old city/storm tokens can be removed only after fixing `globe.ts` and `Invite.tsx`.
  2. Landing wraps the map in an `absolute inset-0` div because `maplibre-gl.css` forces the map
     element `position: relative`. Keep it.
  3. Reef pins are built imperatively in `Landing.tsx` (`document.createElement('button')` + a
     Tailwind class string). Restyle through a CSS class (e.g. `.reef-pin`), not JSX.
  4. `.timer-pulse` keyframe is used for the last seconds of the build timer; `ring-pulse`,
     `chip-float`, `chip-pop` are from the old game: grep, delete if unused.
  5. Reduced-motion handling lives at the bottom of `styles.css`; keep and extend.
  6. Server typecheck previously failed on `fetch` `Response` types (missing `DOM` in
     `server/tsconfig.json` `lib`); app typecheck was clean. Re-check in Phase 0 and report, do not
     fix silently.

## Visual language (tune live on `/kit`; owner vetoes at the Phase 1 checkpoint)

### Palette (all `#rrggbb`)

| Token | Hex | Use |
|---|---|---|
| `--sky` | `#dff4ff` | Page gradient top |
| `--aqua` | `#2bb6e6` | Primary accent |
| `--aqua-deep` | `#0a6fb3` | Gel body, focus ring, selected, links |
| `--lagoon` | `#12a89a` | Water, globe ocean |
| `--seagrass` | `#2f9e4c` | Success, "measured", ready |
| `--sun` | `#ffc93d` | Highlights, near-budget |
| `--coral` | `#e5533f` | Errors, negatives |
| `--sand` | `#f4ecd3` | Globe land, warm neutral |
| `--deep` | `#06304d` | Body text on glass |
| `--foam` | `#ffffff` | Specular highlights |

Text on glass must hold **4.5:1** against the worst-case background behind it (check over both the
sky end and the deep-water end of the gradient). Provenance tag colours: measured = seagrass,
published = aqua, model = lagoon, game-defined = sun.

### Recipes (CSS classes in `styles.css`; React kit wraps them)

Revised at the Phase 1 review (first pass read as cheap: everything pale cyan, cards in cards,
clip-art gel, soft glows). The source of truth is the header comment and recipes in
`app/src/ui/kit/kit.css`; in short:

- The ocean is the colour; surfaces stay quiet. Glass only for floating chrome (bars, palette,
  drawer, title plate). Group content with spacing inside one sheet, not more panels. Flat
  `.well` for content inside glass (blur never nests).
- `.glass`: mostly-white fill (.64 -> .5), `blur(24px) saturate(1.8)`, bright top rim, 0.5 px navy
  hairline, navy-tinted shadow (no coloured glow). Radius 20 px; inner surfaces 12 px; controls pill.
- `.gel` gel variants (aqua|sun|seagrass|coral): Aqua recipe, dark-to-light body (light glows up
  from below), hard-edged gloss over the top half, dark rim, white label (dark on sun), each
  checked at >= 4.5:1. `glass` variant (default) is the quiet secondary button. Press = scale .97
  on pointer-down. Disabled = flat pale glass. Busy keeps its colour.
- `.meter`: 10 px inset trough + glossy bar. **Pending variant**: dashed empty trough.
- `.ocean`: fixed backdrop: surface light, sky -> turquoise -> deep blue, soft-light ray shafts,
  SVG-noise caustic web fading with depth, 7 rim-lit bubbles. Only transform/opacity animate.
- Focus ring: 2 px white + 2 px `--aqua-deep` outer. Visible on glass, gel and deep water.
- `.reef-pin`: glossy bubble marker (ready = sun/aqua, next = muted glass).
- Fallbacks: `prefers-reduced-transparency` -> opaque plates; `prefers-reduced-motion` -> no
  bubbles/caustics movement; no `backdrop-filter` -> solid tinted plate.

### Performance rules

Few, large blurred surfaces; never nest blur inside blur; no `backdrop-filter` on elements that
move every frame; the map/canvas is behind glass, so keep blur radius modest. Target: Landing
globe interacts at ~60 fps under Chrome DevTools 4x CPU throttle.

## Component kit (`app/src/ui/kit/`, barrel `index.ts`)

| Component | Replaces | Notes |
|---|---|---|
| `Backdrop` | body background | Mounted once in `App.tsx`; Landing's map covers it. `data-mode` aware (see Research) |
| `GlassPanel` | every `border-ink bg-bond shadow-plate` block | `as`, `tone` clear/tinted, padding presets |
| `Button` | `button` class string from `Workshop.tsx`, `<Link className={button}>` | `variant`, `size`, polymorphic |
| `Meter` | new | `value`, `max`, label; `pending` state |
| `Tag` | `ProvenanceTag`, host badge, "next" | colour by provenance |
| `Field`, `TextInput`, `Select` | raw `<input>`/`<select>` | styled native select (fewer risks) |
| `Alert` | `border-alarm bg-bond` boxes | keep `role="alert"` |
| `Avatar` | `Avatar` in `Play.tsx` | gloss ring; selected = sun ring |
| `WorkshopLayout` | Workshop card | see HUD spec |
| `cx()` | none | tiny class joiner |

Done-rule: no screen contains `border-ink`, `bg-bond`, `shadow-plate`, `shadow-piece`, and
nothing imports `button` from `workshop/Workshop.tsx`.

## Workshop HUD spec

`<WorkshopLayout stage={ReactNode} palette={ReactNode} ... />` owns everything except the canvas
and the part buttons' behaviour:

- Top bar (glass): reef name, countdown (rooms only, reuse `timer-pulse` in the last 30 s),
  material `Meter` (`materialOf(design)` / `MATERIAL_BUDGET`).
- Left palette (glass): slot for part buttons, undo/redo, remove.
- Centre: `stage` slot. Until the R3F builder exists it shows the current reference-tile picker
  as placeholder content (same `onSubmit(design)` contract; `Solo` and `Play` call sites unchanged).
- Bottom centre: gel **Test it** / **Lock in my design** button, disabled while busy.
- Right drawer (collapsible, glass): last results (`ResultLine`) and "compare with reference
  tile". On 390 px, the drawer becomes a bottom sheet and the palette collapses.
- The 3D builder person supplies `stage` + palette items and calls `onSubmit`; they must not need
  to edit HUD CSS.

## Honest "engine pending" state

While `result.model === 'pending'` (settlementRate `null`): `Meter` shows the dashed pending
trough labelled "Engine pending"; results rank by material only with the caption "Ranked by
material until the larval engine is in"; **no medals, no count-up**. Medals and count-ups appear
only when `model !== 'pending'`. Never render a placeholder number (AGENTS.md rule 2).

## Research Mode reveal

Route-driven `data-mode="research"` on the root element, CSS-only (~600 ms): bubbles and gel
gloss fade, a blueprint grid fades in, panels tint cooler, numerals use tabular figures. No new
route, no transition library. Still reads as the serious view: tinted panels, dense table-like
rows, clear gel **Export JSON** button. Wire in `App.tsx` from `matchPath('/research', path)`.

## Landing globe

Restyle `map/globe.ts`: water -> lagoon/aqua tints (opaque, not alpha, as today), land -> sand,
parks -> faint seagrass, borders thin deep-blue, labels `--deep` with white halo. Reef pins ->
`.reef-pin`. Attribution control restyled to glass in `styles.css`. Optional: crossfade to the
existing satellite layer (`globeStyle(..., satellite=true)`) once the camera has flown into the
selected reef (zoom >= 3.2); cut it if fiddly, illustrated-only is acceptable. Title plate =
`GlassPanel` + refraction hero (Chromium, with fallback).

## Phases and acceptance criteria

**Phase 0: baseline (15 min).** `bun install`, typecheck, test, dev. Open each screen at 1440
and 390 px as the "before". Record any pre-existing failures; do not fix unrelated ones silently.

**Phase 1: tokens + recipes + kit + `/kit` (merge to main).**
- Edit: `app/src/styles.css`, `app/src/tokens.ts`, `app/index.html` (fonts), `app/package.json`
  (`@base-ui/react`), new `app/src/ui/kit/*`, `App.tsx` (add `/kit`, DEV-only).
- `/kit` shows every component and state (default, hover, pressed, focus, disabled, loading,
  pending) over the backdrop and over a busy ocean background.
- Do not change any real screen. **Stop and ask the owner to review the look.**
- Accept: typecheck + tests pass; contrast >= 4.5:1 on all glass variants; `tokens()` does not
  throw on Landing and Invite; `/kit` fine at 390 px.

**Phase 2: screens, one PR each, in this order.**
1. Shared pieces: `ReefCard`/`ProvenanceTag`, `ResultLine` (text unchanged), `Invite`, `Avatar`.
2. Workshop HUD + `Solo`.
3. `Play` (lobby, briefing, building, results incl. pending state).
4. `Research` (+ mode transition).
5. `Landing` + `map/globe.ts` + pins + refraction hero.
- Accept per screen: no old classes; behaviour identical; no horizontal scroll at 390 px;
  keyboard focus visible; two-tab room flow still works.

**Phase 3: polish.** Motion pass (panel enter, button press, phase transitions); reduced-motion
and reduced-transparency fallbacks; perf check (Landing ~60 fps at 4x throttle); remove dead
tokens, keyframes and fonts; hide `/kit` behind `import.meta.env.DEV`; update README if it
describes the old look. One commit per phase or smaller.

## Verification

1. `bun run typecheck` and `bun test` after every phase.
2. `bun run dev`, then in a real browser at 1440 px and 390 px: Landing (globe, pins, reef card,
   join form), Solo (test, results list, record link), Play with two tabs
   (lobby -> briefing -> building -> results), Research (reef select, export JSON link), 404.
3. Keyboard-only pass on each screen (tab order, focus ring on glass).
4. Reduced-motion and reduced-transparency emulation in DevTools.
5. Chrome DevTools Performance: Landing interaction at 4x CPU throttle, about 60 fps.
6. `rg "border-ink|bg-bond|shadow-plate|shadow-piece|workshop/Workshop.*button" app/src` returns
   nothing at the end of Phase 2.

## Risks

- Backdrop blur over WebGL cost (globe now, canvas later): see performance rules.
- Safari/Firefox lack SVG-filter refraction: fallback required, content never depends on it.
- Projector legibility on demo day: bold weights, strong text colour, subtle text shadow.
- Merge conflicts with the 3D builder/engine work in `Workshop.tsx`, `Solo.tsx`, `Play.tsx`:
  mitigated by merging Phase 1 first and keeping the `onSubmit(design)` contract.
- Scope: engine and builder matter more for judging; timebox Phases 1-2 to about half a day.
