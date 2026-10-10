---
name: reefforge-ui
description: Use before ANY visual or UI change in the ReefForge repo — new components, styling, layout, panels, buttons, colors, animation, the dock, the results view, onboarding, or mobile layout. Keeps the Frutiger Aero design system consistent when several people edit the same UI.
---

# ReefForge UI skill

ReefForge looks like **a marine-science workstation from an alternate 2007**: Leopard-era Aqua gloss, Vista/7 Aero Glass panels, and an optimistic underwater scene. Several people edit this UI at once. This skill is how their changes stay looking like one product.

## The four laws
1. **Only use tokens.** Every color, radius, shadow, blur, font, duration and z-index comes from `src/ui/tokens.css` (canonical copy: `references/tokens.css`). Hex values, px shadows and magic numbers are not allowed in component files.
2. **Reuse before you create.** Check `references/components.md`. If a component exists, use it or extend it with a variant. Never fork a near-copy.
3. **The simulation is the hero.** Chrome never covers the build or sim view, never drops the frame rate, and never competes visually with the larvae.
4. **Usability beats nostalgia.** Readable text, AA contrast, visible focus rings, reduced motion. Gloss is seasoning, not the meal.

## Before you start
1. Read `references/components.md` to see what already exists.
2. Read `references/tokens.css` to see which tokens you can use.
3. Find your region in the layout map below. Stay inside it.

## Layout map (desktop ≥ 1024 px)
```
┌──────────────────── ChallengeBar (top, 48px) ────────────────────┐
│┌Palette┐                                          ┌─ Metrics ───┐│
││ left  │        BUILD / SIM VIEW (center)         │ right panel ││
││ 72px  │     ≥ 60% of viewport width, always      │ 320px,      ││
││       │     visible; nothing floats over it      │ collapsible ││
│└───────┘     except transient toasts              └─────────────┘│
│               ┌──────────── Dock (bottom) ─────────────┐         │
└───────────────┴─── Run · Reset · Compare · Save ───────┴─────────┘
```
- Mobile (< 768 px): the center view goes fullscreen. Metrics become a bottom sheet, and the palette is hidden (preset picker only). The dock shrinks to Run, Presets and Results. **No touch building.**
- Register z-layers only through `--z-*` tokens: scene 0, sim overlay 10, panels 20, dock 30, sheet 40, toast 50, modal 60.

## Visual recipe
| Element | Recipe |
|---|---|
| **Glass panel** | `--glass-bg` + `backdrop-filter: blur(var(--glass-blur))` + `--glass-border` + `--shadow-panel` + `--glass-sheen` overlay on the top 40% |
| **Aqua button** | `--aqua-gradient` pill + `--aqua-highlight` top gloss (pseudo-element) + `--shadow-button`. Pressed state: invert the highlight and translateY(1px). |
| **Title bar** | `--titlebar-gradient`, 28px tall, centered title in `--font-ui` 13px semibold |
| **Numbers** | `--font-mono-num` with tabular figures. The settlement % is the largest text on screen. |
| **Icons** | Glossy, rounded, 2-tone. Lucide is acceptable when wrapped in `<GlossIcon>`. No emoji in the UI. |

## Color meaning (don't mix these up)
| Token | Means | Use it for |
|---|---|---|
| `--c-aqua-*` | interactive | buttons, selection, focus |
| `--c-leaf-*` | good / passed | benchmark PASS, score above baseline |
| `--c-coral-*` | warning / failed | benchmark FAIL, divergence, errors |
| `--c-sun-*` | highlight | the player's own design in comparisons |
| `--c-ink-*` | text | never put body text on raw scene imagery without a panel |

**Baseline bars always use the same order and colors:** flat `--c-ink-400`, ridge `--c-aqua-400`, recess `--c-aqua-700`, yours `--c-sun-500`.

## Motion
Motion and touch details follow Emil Kowalski's skills (https://github.com/emilkowalski/skills: `emil-design-eng`, `review-animations`, `mobile-native`). Concretely: strong ease-out `--ease-aero`, UI under 300 ms, `:active` → `scale(var(--press-scale))` on every pressable, hover gated behind `@media (hover: hover) and (pointer: fine)`, enter with `@starting-style` transitions (not keyframes), never `scale(0)`, and reduced motion keeps fades but drops movement.

- Use `--dur-fast` 120 ms for hover and press, `--dur-med` 220 ms for panels and sheets, and `--dur-slow` 400 ms for score count-ups.
- Easing is always `--ease-aero`.
- Wrap all decorative motion (bubbles, sheen sweeps, caustics) in `@media (prefers-reduced-motion: no-preference)`, and respect the in-app toggle (`data-reduced-motion`).

## Performance rules
- At most **4** `backdrop-filter` elements visible at once. Blur costs a lot over a WebGL canvas.
- Don't put `filter: drop-shadow` on anything that animates. Use the box-shadow tokens.
- Animate CSS only through `transform` and `opacity`.
- Never re-render React on each `SimFrame`. Frames go straight to the R3F scene through refs.

## Copy rules
- The score is labeled **"Simulated settlement"**, never "survival" or "growth".
- The benchmark badge reads `Benchmark: PASS` or `Benchmark: FAIL`, and links to the assumptions list.
- Future features never appear as buttons. They are mentioned only on the pitch slide.

## Adding or changing a component
1. Check `references/components.md`. Extend an existing component if you can.
2. Put it in `src/ui/components/<Name>/`, with `<Name>.tsx`, `<Name>.module.css` and an optional `<Name>.stories.tsx`.
3. Use only tokens. If you need a new token, add it to `tokens.css` **and** to `references/tokens.css` in the same PR, and tag the UI owner.
4. Add the component to the catalog in `references/components.md`, including its props and variants.
5. Run `references/review-checklist.md` and take screenshots at 1440×900 and 390×844.

## Common mistakes
- Glass on top of glass, which turns into muddy gray. Nest plain sections inside one panel instead.
- Low-contrast white text on bright turquoise water. Always put text on a panel.
- Making every button glossy. Use `AquaButton` for primary actions only and `GhostButton` for everything else.
- A full draggable window manager. It's out of scope.
- Dark-mode SaaS cards. ReefForge is light, bright and optimistic.
