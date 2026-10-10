# ReefForge 2.0 demo

Start with `npm run dev`. The printed local address is authoritative; Vite increments the port if 5173 is busy. No service credentials are needed for the gameplay loop.

1. **First Settlement:** read the objective. Baby corals need a surface to settle on. The flat bed costs 34 of 54 mm; added and excavated area is limited to 30 mm².
2. Keep Ridge selected. Click about one quarter of the way across the seabed, or press **Place** at 8.5 mm. The default feature is 1 mm wide and 2.5 mm tall. Material becomes 39 mm. Undo/redo restores it exactly.
3. Press **Run experiment**. The first run measures the flat control and then the design. Both use fixed seed 1 and the frozen configuration. Flow vectors and sampled-animation speed affect presentation only. Cancel remains responsive.
4. Review the actual score and spatial map. In the executed browser test, one ridge gave **29.60% versus flat 18.80%**. Do not quote this as a universal outcome for different geometry. Pink marker heights and size are illustrative; the recorded data contains horizontal locations.
5. Press **Improve design**. Shorten, flatten or relocate one feature, then run again. The previous attempt is retained. Save useful failures as well as successful experiments.
6. Choose **Current Clash** from Missions (or the next-mission action). Reuse the geometry. It must gain at least 1 percentage point against each matched control under 4.5 and 3 cm/s waves. Switch the result tabs to inspect each spatial map. The weaker gain determines completion.
7. Open **Research**. The scientific benchmark remains **FAIL**. Show its original result, assumptions and diagnostics. Mission completion is a puzzle outcome, not scientific validation.
8. Save to the Library, reload a record, or replay with its complete saved configuration. Full paired bundles are retained in IndexedDB. Record exports contain individual scientific experiments.

Shortcuts: 1–4 tools; Ctrl+Z / Ctrl+Y history; R run; F vectors; Ctrl+S save; Escape cancel or close dialog; ? help. Numeric position plus Place provides keyboard construction. Shift-click or Select chooses a feature for deletion. Mobile uses Presets rather than advanced touch construction.

## Recovery and backup

- Large first runs can take tens of seconds; the worker computes actual flow and larval trajectories. Later runs reuse flow and matched-control caches.
- For a slower GPU, enable Reduce motion in Research. The numerical worker is independent of decorative R3F scenery.
- Saved data is local to this browser. Export important records before clearing site data.
- The updated screenshots are in `docs/screenshots/`. No backup video was recorded in this task.
- Do not present the optional existing local leaderboard as a remote leaderboard. Gemini is not part of the new gameplay loop.
