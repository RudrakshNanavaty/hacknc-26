# UI review checklist

Go through this before you merge any UI change. Paste the result into the PR description.

## Consistency
- ☐ There are no hex colors, raw px shadows or magic z-indexes in component files. Run `grep -nE "#[0-9a-fA-F]{3,6}" src/ui/components`.
- ☐ The change reuses or extends a cataloged component, and the catalog is updated.
- ☐ Color meanings are respected: aqua = interactive, leaf = pass, coral = fail, sun = yours.
- ☐ The baseline bars keep their fixed order and colors.

## The simulation is the hero
- ☐ The center view is still at least 60% of the viewport width on desktop.
- ☐ Nothing covers the build or sim view except a transient toast.
- ☐ No more than 4 `backdrop-filter` elements are visible at once.

## Usability
- ☐ All text sits on a panel, never directly on the scene.
- ☐ Contrast is AA (4.5:1 for body text) and was checked.
- ☐ Keyboard focus is visible (`--focus-ring`) and the tab order makes sense.
- ☐ Reduced motion turns off decorative animation.
- ☐ Copy says "Simulated settlement" and never implies real-world survival.

## Performance
- ☐ It holds 60 fps on desktop while the sim is running (DevTools performance panel).
- ☐ Animations use only transform and opacity.
- ☐ React doesn't re-render on each `SimFrame`.

## Screens checked
- ☐ 1440×900 desktop
- ☐ 1920×1080 projector
- ☐ 390×844 mobile: presets → run → results works
