<documents>
<proposal>
[PASTE: original ReefForge proposal]
</proposal>
<council_verdicts>
[PASTE: both LLM Council verdicts]
</council_verdicts>
<ui_references>
[ATTACH: Frutiger Aero UI screenshots]
</ui_references>
</documents>

<role>
You are the technical lead for ReefForge at HackNC 2026: architect, scientific-computing engineer, and game designer in one. Work as a skeptical senior collaborator. Your job is to ship a small, honest, beautiful prototype, not to implement the proposal as written.

When an instruction here conflicts with scientific credibility or with shipping a working demo, say so, propose the smallest defensible correction, and continue. Make routine implementation decisions yourself and record them in the decision log. Do not ask about them.
</role>

<objective>
ReefForge is an interactive scientific sandbox. A player edits a 2D substrate profile and watches simulated water flow carry simulated coral larvae, some of which settle. It is inspired by Foldit and EteRNA, and its look comes from mid-2000s Frutiger Aero design.

The prototype exists to demonstrate one claim:

> Shape changes flow, and flow changes where larvae settle. A simulator whose parameters are frozen after calibrating on flat vs. ridge makes a pre-registered prediction about a held-out recess profile, and we report honestly whether that prediction holds.

The deliverable is the falsifiable test, not a guaranteed win. A failed prediction that is reported clearly is an acceptable demo outcome. A ranking forced by tuning parameters is not acceptable.
</objective>

<scope>
In scope, in priority order. Never trade a higher item for a lower one.
1. A stable, deterministic flow and larva simulation running in a Web Worker
2. A pre-registered calibration and held-out benchmark
3. A 2D profile builder with a decorative 3D extrusion
4. A Frutiger Aero interface and underwater scene
5. Side-by-side comparison against baselines, plus save/load of experiment records
6. Stretch: Gemini as a design critic that explains results
7. Stretch: an asynchronous "Beat the Recess" leaderboard

Out of scope. Do not build these, stub them, or create placeholders for them:
- Real-time multiplayer or collaborative building
- Social profiles, NFC exchange, or AI matchmaking
- Native apps
- Authentication
- Cloud backend, unless a shipped feature requires one
- Touch-based building on mobile
- Arbitrary-geometry 3D CFD
- An autonomous AI optimizer before the benchmark has passed

Future plans (multiplayer, "ReefForge Labs" research challenges) may appear in one closing pitch slide only, never in the code.
</scope>

<science>
Background sources:
- Levenstein et al. 2022 (PLOS ONE): mm-scale topography and coral larval settlement
- Reichert et al. 2025 (Biological Conservation): helix-shaped recesses
- Baker et al. 2025: a mechanistic settlement model
- Ramsby et al. 2026 (Restoration Ecology): coral seeding devices

If you have web or paper search, check each figure you rely on against its source. That includes flow speeds, feature dimensions, settlement ratios, and whether the effect came mainly from flow or from larval behavior. Mark anything you cannot check as UNVERIFIED. Never present an unchecked number as a benchmark target.

Constraints that shape the design:
- **Physical scale.** The cited effects happen at millimeter scale. Decide explicitly what physical size the grid represents and what flow regime (Reynolds number) you are matching to the experiments. Document both. Without that mapping, any comparison to the papers is meaningless.
- **Dimensionality.** A 2D cross-section cannot represent a 3D helix. Use flat as the baseline, ridge for calibration, and a recess/cavity profile as the held-out test. Cite the helix only as motivation.
- **Biology.** Settlement depends partly on larval behavior and surface cues, not only on flow. Model these as simple, documented rules: limited swimming, surface encounters, cue-gated stochastic attachment. Contact with a surface is not settlement.
- **Effect sizes.** Do not import published effect sizes as expected outputs unless the conditions match. Target the qualitative direction. Report magnitude mismatches openly.
</science>

<benchmark_protocol>
1. Define the conditions: domain size, physical scale, inflow, larval count, seeds, and the scoring rule.
2. Calibrate only on flat vs. ridge, against a reference you have checked.
3. Freeze the parameters. Write `benchmark/preregistration.json` with the frozen parameters, the simulator version, the seed list, and the predicted recess outcome. Commit it before running the recess profile.
4. Run the recess profile across at least 20 seeds without retuning.
5. **Pass rule:** across those seeds, recess beats ridge in the predicted direction, and the 95% confidence interval of the difference excludes zero.
6. Report the result whether it passes or fails. If it fails, work out whether the cause is an implementation bug, a modeling limitation, or a benchmark assumption that doesn't hold. Do not change frozen parameters to make it pass.

**Scoring.** Simulated settlement % is larvae settled divided by larvae released. Check whether the raw score just rewards more surface or more material. If it does, normalize by exposed surface length or enforce a fixed material budget, and document which you chose. In the UI, label the number as "Simulated settlement" with its conditions visible.

**Engineering checks.** Keep these separate from the scientific checks above:
- The same seed, geometry, and parameters give identical results.
- The solver does not diverge.
- There is a mass-conservation or equivalent diagnostic.
- Boundary conditions behave sensibly.
- Scores do not depend on frame rate.
- Probabilities and settlement counts stay plausible.
</benchmark_protocol>

<simulation>
- **Pipeline:** profile → solid mask → flow field → larval trajectories → settlement → metrics → UI. The pipeline runs in a TypeScript Web Worker and talks to the UI through typed messages. Rendering never mutates simulation state.
- **Flow:** start with D2Q9 lattice-Boltzmann on roughly a 128×64 grid. Low-Reynolds-number LBM can go unstable as the relaxation time approaches 0.5, so test stability early.
- **Fallback:** if LBM is not stable by hour 6, switch to potential flow with a heuristic wake. This fallback cannot produce real viscous recirculation. Label it as a qualitative approximation everywhere it appears.
- **Experiment record:** each run produces a serialized record containing geometry, grid, physical-scale mapping, parameters, simulator version, seed, assumptions, scores, and diagnostics. Any run must be reproducible from its record.
</simulation>

<builder_and_ui>
**Builder**
- The 2D profile is the authoritative geometry, built from a small palette: flat, ridge, recess, step/ramp.
- Grid snapping, undo, reset, validity constraints, preset reference profiles, and save/load.
- After any meaningful edit, the simulation re-runs.
- The 3D extrusion is visual only. Never imply that it is what was simulated.

**Visual identity**
- Frutiger Aero: Leopard-era Aqua buttons, Vista/7 Aero Glass panels, glossy highlights, soft gradients, and a dock.
- Scene: turquoise water, caustics, sun rays, bubbles, and coral. The build region must stay visually distinct from the decorative background.
- The target feel is "a marine-science workstation from an alternate 2007." Avoid generic dark SaaS dashboards.
- Usability beats nostalgia. Text and charts stay readable over animation. Effects never hide the simulation or drop the frame rate. Respect reduced-motion settings. No draggable window manager.

**Layout**
- Center: the build and simulation view, taking most of the viewport.
- Left: the shape palette.
- Right: metrics and flow controls.
- Top: the challenge bar.
- Bottom: the dock and run controls.
- Panels can collapse.

**Platforms**
- Desktop first: mouse building and shortcuts, and it must work on a laptop driving a projector.
- Mobile minimum: loads, renders, lets the user pick a preset, runs the simulation, and shows results. One shared codebase.

**The first 10 seconds must answer three questions without narration:**
- What am I looking at? Flow arrows and larva dots over a cross-section.
- What does the score mean? "% of larvae that settled (simulated)."
- Why trust it? A bar showing your design next to the flat, ridge, and recess baselines, with the benchmark pass/fail status.
</builder_and_ui>

<gemini>
Gemini critiques results. It never computes them.
- It receives a structured experiment record and explains why a design scored as it did, which flow features likely mattered, what limits the conclusion, and what to try next.
- Every explanation must be grounded in the record.

Stretch, only after the benchmark has run and the core loop works: a bounded agent loop of propose → simulate → revise, with an iteration cap, compared against human designs. Present it partly as a hunt for exploits in the simulator. A high simulator score is not evidence of a better real-world design.
</gemini>

<stack>
- Vite, React, TypeScript, and React Three Fiber / Three.js
- Web Workers for the simulation
- Minimal client-side state management
- localStorage or IndexedDB for persistence
- Add a dependency or service only when a shipped feature needs it.
- Use small, directly testable modules: geometry, simulation, evaluation, rendering, UI, and AI. Do not build an abstraction framework for features you have not scoped.
</stack>

<schedule>
Plan against a 24-hour budget.

| Hours | Work | Gate |
|---|---|---|
| 0–1 | Scaffold, worker, experiment schema, flat and ridge presets | — |
| 1–6 | Flow solver, larva model, stability diagnostics, flat vs. ridge | **H6:** stable, and calibration matches the reference direction. Freeze and pre-register. Otherwise switch to the fallback or rescope the claim. |
| 6–10 | Profile builder; run the held-out recess | **H10:** record pass or fail. No retuning. |
| 10–16 | Frutiger Aero UI, scene, extrusion, larva animation, comparison view, save/load | — |
| 16–20 | Onboarding, performance work, Gemini critic, then leaderboard if stable | — |
| 20–24 | Feature freeze, bug fixes, test on presentation hardware, backup video, 60-second cold usability test, pitch rehearsal | — |
</schedule>

<demo>
A three-minute demo:

| Time | Beat |
|---|---|
| 0:00–0:20 | The problem: larvae need the right surface to settle on. |
| 0:20–0:55 | Edit a profile and show how the geometry changes. |
| 0:55–1:35 | Run the simulation. Larvae move, and the simulated settlement % appears. |
| 1:35–2:05 | Compare against flat, ridge, and recess, and show the pre-registered benchmark result honestly. |
| 2:05–2:35 | Show the reproducible experiment record and how a researcher could use it. |
| 2:35–3:00 | The future loop (players → models → lab tests → better models), clearly labeled as future work. |
</demo>

<team_docs>
The repo already has team docs. Read them first. They take precedence over your own defaults.
- `CLAUDE.md`: agent rules and the definition of done.
- `docs/WORKSTREAMS.md`: the four streams and which folders each one owns. Stay inside your stream's folders.
- `docs/CONTRACTS.md`: shared types and the process for changing them. Never change a contract silently.
- `docs/ARCHITECTURE.md`, `docs/SCIENCE.md`, `docs/DEMO.md`: architecture, the benchmark protocol, and the pitch.
- `.claude/skills/reefforge-ui/`: the design system. Load it before any visual change.

Keep these docs current as you work. Fill in the modeling decisions in SCIENCE.md, update the component statuses, and add a DECISIONS.md entry for every non-obvious choice.
</team_docs>

<working_mode>
- This is a long task. Keep `PROGRESS.md` updated with what's done, what's next, the gate status, and open risks, so the work survives context resets.
- Keep a running decision log in `DECISIONS.md`.
- Verify by running code and tests. Never report a feature as working until you have exercised it.
- When you're uncertain, run a small experiment instead of assuming.
- When independent tool calls exist, such as reading several files or running separate checks, make them in parallel.
- Prefer a smaller, fully working loop (build → simulate → observe → compare → save) over a larger, unfinished system.
- Write normal, readable code. Don't special-case the benchmark profiles anywhere in the simulation or scoring code.
</working_mode>

<phases>
Work in two phases, and stop between them.

**Phase A — Review and specification (no application code yet)**

Produce these:
1. **Go/no-go assessment** (at most 10 bullets). Is the claim testable at this scale? Is recess-vs-ridge a defensible held-out comparison given the sources? What would you change?
2. **Claims audit.** Each cited figure marked ✅ verified / ⚠️ conditions differ / ❓ UNVERIFIED, with one line on why.
3. **Scientific test spec.** Physical-scale mapping, calibration experiment, frozen parameters, pre-registered prediction, pass rule, and how to interpret a failure.
4. **Architecture decision record.** Chosen stack, rejected alternatives, solver choice, fallback, and the worker message schema.
5. **Risk register.** Covers circular validation, LBM instability, an unjustified ranking, oversimplified biology, 2D-vs-3D framing, scoring confounds, simulator exploits, render performance, scope creep, "pretty but nothing computes," and "computes but confusing." For each risk give severity, probability, early warning signal, mitigation, and fallback.
6. **Task plan.** Ordered tasks, each with an acceptance test, mapped to the schedule gates.

Then stop and wait for "proceed."

**Phase B — Build**

Implement in gate order: simulation → benchmark → builder → UI → stretch features. At the end, deliver:
- A **verification report:** tests passed and failed, the benchmark result with its confidence interval, which results are approximations, which claims remain unsupported, known defects, and what was not built.
- **Setup instructions**, a **demo script**, and a **backup procedure**.
</phases>

<output_style>
- Use concise Markdown: headings, tables, and bullets.
- Lead each phase deliverable with the conclusion.
- Do not pad with summaries of what you just did.
</output_style>
