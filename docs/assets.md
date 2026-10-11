# Art assets

## Original artwork

The project root preserves `background_seascape.png`, `bubbles.png`, and `Sunlit Tropical Bubble Seascape.png` unchanged as supplied.
The first two are identical to the runtime/source copies in `app/public/`. The combined Sunlit Tropical Bubble Seascape image is retained
as a visual reference; the app renders the separate background and bubble sprites so they can move independently.

## Underwater seascape and bubbles (landing, onboarding, loading and lobby screens)

- `app/public/background_seascape.png` (1672×941): the bubble-free underwater background. Shown still, `cover` / `center`,
  behind the landing, onboarding (join form), loading ("Connecting to room…") and lobby screens (`Seascape` in `app/src/ui/FloatingBubbles.tsx`,
  shared by `app/src/ui/CoastalShell.tsx`).
- `app/public/bubbles.png` (1672×941, RGBA): the source bubble artwork. Not shown directly.
- `app/public/bubbles/bubble-00.webp` … `bubble-20.webp`: 21 single-bubble sprites cut from `bubbles.png` (7 large, 5 medium,
  9 small), lossless WebP with alpha, 872 KB in all. Regenerate with
  `python app/scripts/extract-bubbles.py app/public/bubbles.png app/public/bubbles <check-sheet.png>` (needs Pillow, NumPy, SciPy).

How the sprites are cut: each bubble is a solid round shape at alpha ≥ 200; the sheet's noisy low-alpha cyan splatter (alpha 1–63)
sits between them. The script finds each round component, fits its circle, and keeps only the pixels inside it with a 1.5 px soft
edge, so the splatter is dropped and nothing inside a bubble changes. Fully transparent pixels take the bubble's rim colour, so
scaling never shows a dark fringe. Satellites smaller than 30 px are skipped. The check sheet shows every sprite on black and on cyan.

`FloatingBubbles`: 23 bubbles on desktop (10 back, 9 mid, 4 front), 13 on phones; CSS transforms only (rise, sway, wobble on
separate periods), seeded per mount, negative delays, paused while the tab is hidden, a still scene with 10 bubbles under
`prefers-reduced-motion`, `pointer-events: none`.
