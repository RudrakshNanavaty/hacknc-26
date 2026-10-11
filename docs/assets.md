# Art assets

## Underwater seascape and bubbles (onboarding, loading and lobby screens)

- `app/public/background_seascape.png` (1672×941): the bubble-free underwater background. Shown still, `cover` / `center`,
  behind the onboarding (join form), loading ("Connecting to room…") and lobby screens (`Seascape` in `app/src/ui/FloatingBubbles.tsx`,
  used by `app/src/routes/Play.tsx`).
- `app/public/bubbles.png` (1672×941, RGBA): the source bubble artwork. Not shown directly.
- `app/public/bubbles/bubble-00.webp` … `bubble-20.webp`: 21 single-bubble sprites cut from `bubbles.png` (7 large, 5 medium,
  9 small), lossless WebP with alpha, 872 KB in all. Regenerate with
  `python app/scripts/extract-bubbles.py app/public/bubbles.png app/public/bubbles <check-sheet.png>` (needs Pillow, NumPy, SciPy).

How the sprites are cut: each bubble is a solid round shape at alpha ≥ 200; the sheet's noisy low-alpha cyan splatter (alpha 1–63)
sits between them. The script finds each round component, fits its circle, and keeps only the pixels inside it with a 1.5 px soft
edge, so the splatter is dropped and nothing inside a bubble changes. Fully transparent pixels take the bubble's rim colour, so
scaling never shows a dark fringe. Satellites smaller than 30 px are skipped. The check sheet shows every sprite on black and on cyan.

`FloatingBubbles`: 24 bubbles on desktop (10 back, 9 mid, 5 front), 13 on phones; CSS transforms only (rise, sway, wobble on
separate periods), seeded per mount, negative delays, paused while the tab is hidden, a still scene with 10 bubbles under
`prefers-reduced-motion`, `pointer-events: none`.
