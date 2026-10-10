# Demo playbook

**Owner:** Stream D. Rehearse it 5 times. Run it with the browser **offline** at least once.

## 3-minute script
| Time | On screen | Say |
|---|---|---|
| 0:00–0:20 | Reef scene, flat profile, larvae drifting past | "Baby corals need the right surface to land on. Most never find one." |
| 0:20–0:55 | Drag a ridge onto the profile | "Shape changes the water. Watch the flow arrows bend." |
| 0:55–1:35 | Hit **Run**. Larvae swirl and stick, and the score counts up. | "Simulated settlement: 14%, up from 3% on flat." |
| 1:35–2:05 | Baseline bars and the benchmark badge | "We froze our model, *then* predicted the recess. Here's whether it held." |
| 2:05–2:35 | Open the experiment record | "Every run is reproducible: same seed, same result. A researcher can rerun it." |
| 2:35–3:00 | Closing slide | "Next: researchers post real flow conditions, and players design for them." *(future work)* |

## Pre-demo checklist
- ☐ Laptop on power, high-performance GPU mode, browser zoom at 100%
- ☐ Tested on the projector resolution
- ☐ Demo profiles saved locally, with the `?demo=1` URL preloading them
- ☐ Gemini key works, **or** critic hidden (the demo must not depend on it)
- ☐ Backup video ready on the desktop and on a phone
- ☐ Answers to the 5 hard questions memorized (below)

## Hard questions
1. **"How do you know the score means anything?"** We froze the parameters on flat vs. ridge, then predicted the recess blind. Here is the result.
2. **"Larvae respond to chemical cues, not just flow."** True. We use a cue-gated attachment rule, and it's listed in our assumptions.
3. **"Why 2D?"** It runs in real time and stays honest. A 3D helix is motivation for the project, not something we claim to reproduce.
4. **"Wouldn't an optimizer beat players?"** Probably, on our toy model. That's why simulator scores are hypotheses and not results.
5. **"What's next?"** Lab partners tank-test the top designs, and the results recalibrate the model.

---

## Setup (fresh laptop)
1. Install Node 20.19+ or 22. Clone the repo, then `npm install`.
2. Run `npm run dev` and open http://localhost:5173. No network or keys are needed: the sim runs in a Web Worker.
3. Run `npm test` to sanity-check. Run `npm run benchmark:regress` to confirm the same seed still gives the same output.
4. First load shows onboarding. Press `?` to show it again.

## Live demo, click by click
| Beat | Do |
|---|---|
| Problem | App loads on the **Ridge** preset. Let the larvae swirl and settle (about 7 s on first load). |
| Edit | Press `2` (Recess), click the flat seabed between two ridges. Drag down while clicking to set depth. Then press `1` and add a ridge. |
| Run | It re-runs automatically 300 ms after an edit. The score counts up in the Results panel; a thin progress line runs along the bottom of the stage. |
| Compare | Point at the **Compared with baselines** bars (Flat / Ridge / Recess / **Yours** in sun color) and the settlement strip under the canvas, where the peaks sit at the feature bases. |
| Benchmark | Click the **Benchmark** badge (top right). Show the prediction, the pass rule, the CI, and "what this does not show". |
| Record | Results → Run details → **View experiment record** (or Dock → **Library → This run**). Show seed, parameters and version, then **Re-run from this record**. The result is the same number. |
| Critic (optional) | Results → **Explain this result**. Point out the "AI explanation" label and that scores come from the simulator. Skip this if no key is set (the card is hidden). |
| Leaderboard | Dock → **Leaderboard**. Show the surface budget meter, submit a design, point at "below/≈/beats" with its CI. |
| Future | Closing slide only. There is no button for it. |

Shortcuts: `1–4` tools · `Ctrl+Z / Ctrl+Y` undo/redo · `Enter` or `R` re-run · `F` flow arrows · `Ctrl+S` save · `?` help.

## Backup procedure
- **Sim too slow on the projector laptop:** the flow is cached per geometry. Pre-warm by loading Flat, Ridge and Recess from **Presets** before going on stage.
- **WebGL broken:** the backdrop and 3D extrusion are decoration. Toggle **Reduce motion** in Results → Run details. The 2D sim canvas does not use WebGL.
- **Browser dies:** restart with `npm run dev`. Saved designs persist in IndexedDB. Exported record JSON can be re-imported via **Library → Saved designs → Import**.
- **Everything fails:** play the backup video (record it from this script at 1920×1080), and show `benchmark/results.json` and `docs/PHASE_A.md` from the repo.
