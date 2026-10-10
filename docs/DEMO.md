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
