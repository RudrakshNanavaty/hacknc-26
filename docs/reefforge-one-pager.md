# REEFFORGE
## The Ocean Is Your Playground
**HackNC 2026 — Master Product Vision, Scientific Architecture & Implementation Plan**

**Concept:** Minecraft × Besiege × Subnautica × Pocket Rivals × Mayday Mayor

**Category:** Multiplayer scientific discovery game / environmental technology

**Mission:** Turn the creativity millions of people already spend in games into candidate engineering solutions for real-world coral restoration.

---

# 1. Executive Vision

Millions of people voluntarily spend countless hours building extraordinary structures in games like Minecraft and Roblox. They experiment, compete, collaborate, discover unexpected solutions, and explore enormous design spaces simply because doing so is fun.

Meanwhile, scientists face a difficult engineering challenge: developing structures that help coral larvae settle and survive in increasingly threatened reef environments.

Research has shown that underwater structure geometry can dramatically affect coral settlement. Ridges, cavities, grooves, spirals, and other features influence local hydrodynamics and create different conditions for larvae.

But researchers cannot physically manufacture and experimentally test every possible design.

**What if the creativity of millions of gamers could help explore this design space?**

ReefForge is a multiplayer underwater construction game built around real coral reef environments.

Players explore a global ocean map, select actual reef regions, descend into beautiful underwater environments, and construct innovative coral settlement structures.

A physics-based simulation evaluates their designs under defined ocean conditions.

Players compete, collaborate, improve their structures, and generate reproducible engineering artifacts that researchers could eventually manufacture and test.

**The core idea:**

Players invent → Scientific models evaluate → Researchers test → Real results improve the models → Players invent again.

The game is entertainment first, but scientific discovery is built into its mechanics.

---

# 2. The Hackathon Winning Formula

Our original product discovery framework:

**A game genre millions love → A real task with the same underlying shape → Someone who needs the output → Proof in one room.**

For ReefForge:

| Element | ReefForge |
|---|---|
| Game people love | Minecraft, Besiege, Roblox construction |
| Real-world task | Engineering coral settlement structures |
| Real-world problem | Low coral recruitment and expensive restoration |
| Who needs the output | Marine researchers, reef restoration organizations, seeding-device manufacturers |
| Player contribution | Novel structure geometries and optimization experiments |
| Immediate proof | Simulated larval transport, design comparison, and exportable geometry |
| Long-term proof | Laboratory testing and real coral settlement measurements |

**Important distinction:** ReefForge is not a coral conservation education game. The player activity itself generates candidate engineering designs.

---

# 3. The Problem and Economic Opportunity

Coral reefs are among the most important and threatened ecosystems on Earth.

Key estimates:

- Coral reefs support at least 25% of marine species.
- Their global ecosystem services have been valued at approximately $2.7 trillion annually.
- Published research reports a median coral restoration cost around $400,000 per hectare in 2010 USD, with substantial variation between methods and projects.
- Coral bleaching and warming oceans are making restoration increasingly difficult.
- Australia's marine research programs are already testing approaches for deploying tens of thousands of coral seeding devices.

## The specific problem ReefForge addresses

Coral restoration requires more than growing corals in nurseries.

Larvae must encounter suitable surfaces, attach, and survive.

The geometry of artificial settlement structures can influence:

- Near-surface water velocities.
- Recirculation regions.
- Larval encounters with surfaces.
- Availability of protected settlement locations.
- Material consumption and manufacturing requirements.
- Device robustness under changing flow conditions.

The challenge is discovering configurations that perform well across realistic conditions without making structures excessively expensive or difficult to manufacture.

## Potential customers and beneficiaries

1. Coral restoration laboratories and universities.
2. Marine conservation organizations.
3. Artificial reef and coral seeding-device manufacturers.
4. Government marine restoration programs.
5. Researchers working on hydrodynamics, habitat engineering, and biological settlement.

The initial commercial hypothesis is that ReefForge could reduce the cost of exploring and screening new structural designs.

The business model could eventually include research software, design optimization, engineering collaboration, and fabrication services.

**Market limitation:** Reef ecosystem value is not the same as ReefForge's addressable market. Customer demand, willingness to pay, and research adoption must still be established.

---

# 4. The Scientific Foundation

ReefForge focuses on a specific research problem:

**How does engineered substrate geometry affect coral larval settlement under different flow conditions?**

This is an experimentally studied question, not an invented scientific challenge.

## 4.1 Published evidence

### Millimeter-scale substrate geometry

Levenstein et al. (2022), PLOS ONE, examined how small-scale substrate topography affects coral larval settlement.

The work combines experimental observations with hydrodynamic analysis and provides a foundation for understanding how ridges and sheltered flow regions influence settlement.

Source:
https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0274088

### Helix-shaped settlement structures

A 2025 Biological Conservation study tested engineered settlement geometries, including helix-shaped recesses.

Under the study's specific experimental conditions, certain structures substantially increased settlement and subsequent survival relative to controls.

Reported improvements for the highlighted design included approximately 80× settlement and 20–50× one-year post-settlement survival.

These experimental outcomes are not universal performance multipliers.

Source:
https://www.sciencedirect.com/science/article/pii/S0006320725004446

### Existing mechanistic settlement models

Open-source coral settlement modeling research provides methods and code that may help establish larval transport and settlement behavior.

Reference repository:
https://github.com/mollymaebaker/Modelling-coral-settlement

The repository must be inspected for runnable dependencies, supported geometries, physical assumptions, licensing, and actual applicability.

## 4.2 What the physics must evaluate

ReefForge's scientific pipeline:

**3D geometry → Flow-field calculation → Larval transport → Modeled settlement → Design evaluation**

Potential physical effects include:

- Flow separation.
- Near-surface velocity changes.
- Recirculation.
- Particle residence time.
- Surface encounters.
- Exposure to changing currents.

Coral larvae are not perfectly passive particles. Their swimming, settlement preferences, and biological responses may need to be represented through simplified behavioral rules grounded in published studies.

## 4.3 Scientific evaluation metrics

Primary metric:

**Simulated settlement rate = Number of larvae meeting settlement criteria / Number released**

Secondary metrics:

- Settlement performance under different flow conditions.
- Material consumed.
- Surface utilization.
- Geometry validity.
- Manufacturing constraints.
- Repeatability.
- Uncertainty and sensitivity to model assumptions.

A robust design should not necessarily win because it captures the most particles in one idealized experiment.

It should also satisfy constraints on material efficiency and performance across conditions.

## 4.4 Scientific honesty

We must clearly distinguish:

**Experimentally measured:** Outcomes in published coral studies.

**Observed environmental inputs:** Data from NOAA, Allen Coral Atlas, and other scientific sources.

**Simulated:** Results generated by the ReefForge model.

**Hypothetical:** Whether a new player-created design will improve settlement in a real laboratory or reef.

The hackathon will demonstrate scientific candidate generation, not experimentally proven coral survival improvements.

---

# 5. The Complete Game Experience

## Screen 1 — The Living Ocean

Players land on a beautiful interactive map of Earth.

The globe displays real coral reef regions with luminous turquoise markers, ocean imagery, and Frutiger Aero-inspired visual design.

The interface offers:

- Explore the ocean.
- Select a reef.
- Join friends.
- View community discoveries.
- Open the research dashboard.

The map is not just a menu. It is the player's entry into a global series of engineering challenges.

## Screen 2 — Select a Real Reef

Selecting a region reveals:

- Reef name and location.
- Real imagery or visual references.
- Habitat information.
- Historical water temperature.
- Available bathymetry.
- Environmental context.
- Current mission.
- Model assumptions and data sources.

A player chooses a mission and enters an underwater environment.

For the hackathon, prioritize four regions, opening with Kāneʻohe Bay:

### Kāneʻohe Bay, Oʻahu — The Helix Mission (opening demo reef)

This is the real site where researchers tested 3D-printed helix-recess settlement modules (Reichert et al., *Biological Conservation*, 2025). They reported about 80× more settlement than on flat surfaces under the study's conditions.

Challenge: Build a structure that beats the flat-tile baseline under the same simulated conditions, and see how your design compares with a helix-recess approximation.

Verified real data for this reef:

- Seafloor depth: NOAA NCEI Oʻahu coastal elevation model, 1/3 arc-second (~10 m). A Kāneʻohe Bay subset has been downloaded and checked.
- Heat stress: NOAA Coral Reef Watch daily 5 km Degree Heating Weeks for Kāneʻohe Bay. Downloaded and checked.
- Current range: published reef-flat currents are typically under 20 cm/s (Lowe et al., 2009), labelled as published values.

**Demo line: "This is where researchers tested the helix design."**

### Florida Keys — The Recovery Mission

Focus: Learning the relationship between geometric design and modeled settlement.

Challenge: Build a material-efficient habitat that improves simulated larval encounters and settlement.

### Great Barrier Reef — The Current Challenge

Focus: Robustness under changing currents.

Challenge: Create a structure that performs consistently across several modeled flow directions and speeds.

### Maldives — The Efficiency Challenge

Focus: Construction under restricted material and space.

Challenge: Create a compact, efficient settlement structure under tighter resource limits.

**Data accuracy requirement:** These gameplay objectives are scenario designs. They should not be presented as scientifically established site-specific conditions without corresponding measurements.

## Screen 3 — The Underwater Workshop

Players descend from the selected reef map into a vibrant 3D underwater construction arena.

Visual inspiration:

- Subnautica's beautiful ocean environments.
- Minecraft's intuitive construction.
- Besiege's physics-based engineering.
- Astro Bot's playful animation and friendliness.
- Frutiger Aero's glossy glass, bubbles, turquoise water, and optimistic design.

Each player controls an underwater builder interface.

Possible building tools:

- Solid blocks.
- Ridges.
- Grooves.
- Arches.
- Tunnels.
- Cavities.
- Curved or spiral modules.

Core controls:

- Place.
- Rotate.
- Move.
- Remove.
- Undo/redo.
- Orbit and zoom.
- Duplicate.
- Save.

Players receive a material budget and a time-limited challenge.

The editor should encourage meaningful exploration while preserving geometry constraints required by the scientific model.

## Screen 4 — Test Your Invention

The player presses **TEST**.

A visually striking ocean simulation begins.

Hundreds of glowing coral larvae enter the scene.

The player watches them interact with the structure as water currents carry them around its features.

Visualization features:

- Particle trails.
- Current direction.
- Flow speed visualization.
- Surface encounters.
- Modeled settlement events.
- Escape trajectories.
- Simulation replay.

The visual animation must derive from the actual computed simulation, rather than showing arbitrary effects disconnected from the recorded results.

The core player experience:

**I built something → I watched nature respond → I discovered something → I want to improve my creation.**

## Screen 5 — Results and Competition

Players see:

- Simulated settlement performance.
- Material usage.
- Performance across selected conditions.
- A visualization of successful and unsuccessful regions.
- Comparison with their previous designs.
- Comparison with competing players.

Players can immediately return to construction and improve their structure.

## Screen 6 — Scientific Reveal

A **Research Mode** button transforms the game's presentation into a scientific engineering dashboard.

The same structure appears as an engineering mesh.

Researchers can inspect:

- Design geometry.
- Simulation settings.
- Flow assumptions.
- Larval trajectories.
- Settlement statistics.
- Material consumption.
- Comparison with experimental reference shapes.
- Experiment history.
- Model version and reproducibility information.

Players can export:

- Geometry JSON.
- STL or supported mesh.
- Experiment results CSV/JSON.
- Simulation configuration.
- Scientific experiment summary.

This is the central bridge between entertainment and research.

---

# 6. The Global Underwater Map

ReefForge should follow a three-scale geographical architecture.

## Scale 1 — Global Ocean

A world map highlights real reef locations.

Primary resource:

**Allen Coral Atlas**
https://allencoralatlas.org/

Use reef extent and habitat datasets, respecting licensing and republication restrictions.

## Scale 2 — Regional Reef Environment

Zoom into selected reef regions.

Combine information from:

**Allen Coral Atlas**
- Reef habitats.
- Geomorphic zones.
- Shallow reef mapping.
- Available bathymetric products.

**GEBCO**
https://www.gebco.net/

- Global seafloor elevation.
- Broad underwater terrain.

**NOAA**
https://coralreefwatch.noaa.gov/

- Sea surface temperature.
- Historical marine heat stress.
- Coral bleaching risk context.

**NOAA Bathymetry**
https://www.ncei.noaa.gov/maps/bathymetry/

- Higher-resolution regional underwater surveys where available.

## Scale 3 — Construction Arena

Generate a visually rich underwater scene informed by the selected location.

The arena should be explicitly understood as a representative simulation environment, not a centimeter-accurate digital twin of an actual reef.

The scientific geometry model operates at much smaller spatial scales than the global mapping datasets.

## Environmental differences

Different reef scenarios may vary in:

- Modeled flow speed.
- Flow direction.
- Depth.
- Habitat classification.
- Temperature context.
- Simulated deployment constraints.
- Material budget.
- Environmental variability.

Location-specific values must carry provenance labels:

- Measured.
- Model-derived.
- Game-defined.

This distinction prevents global mapping data from being misrepresented as precise measurements of currents around individual coral structures.

---

# 7. Multiplayer Design

ReefForge should combine Pocket Rivals' competitive energy with a creative engineering sandbox.

## Game Mode A — Reef Rivals

Two to four players enter the same challenge.

Each receives:

- Identical environmental conditions.
- A material budget.
- A construction space.
- A build timer.
- The same scientific evaluation configuration.

Players independently construct structures.

When time expires, their designs are evaluated and compared.

The game presents a winner according to transparent challenge rules.

This is the primary hackathon mode.

## Game Mode B — Collaborative Laboratory

Multiple players contribute to one shared structure.

They experiment with different design approaches and collectively optimize the result.

This can become a post-MVP mode.

## Game Mode C — Ocean Expedition

Players progress through real reef regions and environmental challenges.

Successful completion unlocks:

- More complex components.
- New environments.
- New challenge types.
- Cosmetic workshop enhancements.
- More demanding optimization tasks.

Scientific performance should not be artificially altered by paid or cosmetic progression.

## Game Mode D — Creative Sandbox

Players build without competition.

They can experiment, save, publish, and remix structures.

The longer-term goal is a community of underwater inventors.

---

# 8. Reusing Pocket Rivals and Mayday Mayor

ReefForge should reuse existing infrastructure rather than rebuild systems unnecessarily.

## Pocket Rivals

Reference:
https://github.com/darshrank/pocket-rivals

Potential reuse:

- Multiplayer rooms.
- Session management.
- Game-state synchronization.
- Round lifecycle.
- Timers.
- Scoreboards.
- Player identity.
- Real-time events.
- Gemini integration.
- Audio interactions.
- Game UI patterns.

These are reuse candidates; the actual repository must be inspected.

## Mayday Mayor

References:

https://maydaymayor.us/

https://mayday-mayor.onrender.com/

Potential reuse:

- Geographic map exploration.
- Real-world data ingestion.
- Geospatial interactions.
- Simulation orchestration.
- Scenario management.
- Game-to-research transition.
- Data visualization.
- Research dashboards.
- Experiment logging.
- Deployment architecture.

Again, actual components must be audited before reuse.

## The architectural difference

Mayday Mayor evaluates player decisions about real locations.

ReefForge evaluates player-created physical geometry under simulated environmental conditions.

Therefore:

**Reuse shared platform infrastructure, not Mayday Mayor's disaster simulation or Pocket Rivals' specific game mechanics.**

Proposed logical architecture:

- Shared multiplayer infrastructure.
- Shared geographic exploration components.
- Shared AI integration layer.
- Shared experiment/event model.
- New 3D construction editor.
- New coral settlement scientific engine.
- ReefForge-specific research dashboard.

---

# 9. Scientific Simulation Architecture

A full arbitrary-geometry, three-dimensional CFD simulation is unlikely to be practical as the first hackathon implementation.

We need a scientifically defensible simplified model with fast feedback.

## Initial approach

Use visually three-dimensional construction with a constrained geometry representation appropriate for a 2D or shallow-3D physical model.

Possible architecture:

1. Convert player structure into valid computational geometry.
2. Generate or retrieve the applicable flow field.
3. Initialize larvae with controlled random seeds.
4. Simulate particle transport and permitted biological behavior.
5. Evaluate modeled surface encounters and settlement.
6. Store reproducible results.
7. Render trajectories inside the 3D game.

Possible tools:

- Python.
- NumPy.
- SciPy.
- Existing coral settlement model implementations.
- Mesh processing tools.
- Three.js / React Three Fiber.
- Precomputed reference scenarios.
- PostgreSQL/Tiger Data for experiment data.

## Scientific validation milestone

Before promising scientifically meaningful comparisons, evaluate reference geometries.

Examples:

- Flat substrate.
- Ridged substrate.
- Sheltered cavity.
- Curved or helix-like geometry, where the model and data support it.

Test whether the simulation reproduces published experimental trends under relevant comparable conditions.

**Do not hardcode favorable results for ridges, spirals, or cavities.**

If the model does not validate, it must be labeled exploratory.

This is the most important technical risk in the project.

---

# 10. AI and Sponsor Integration Strategy

HackNC allows General or Beginner entrants to select additional tracks without a stated numerical limit.

ReefForge should target multiple awards with a single coherent product.

## Primary Tracks

### General

The complete game, physics simulation, scientific output, and multiplayer experience.

### Frutiger Aero Tech

A glossy, optimistic ocean aesthetic that combines technology, nature, and environmental sustainability.

### Community

Players collaborate on environmental engineering challenges and share discoveries.

### Best Use of Gemini

Create a scientific design assistant that:

- Interprets experiment data.
- Explains failures.
- Suggests scientifically plausible modifications.
- Retrieves research context.
- Helps players compare alternative strategies.

Gemini must not invent physics scores.

### Best Use of Tiger Data

Track:

- Player construction iterations.
- Experiment history.
- Simulation metrics.
- Regional performance.
- Leaderboards.
- Design comparisons.
- Time-series engineering experiments.

Use meaningful database features, rather than adding Tiger Data only as basic storage.

## Secondary Tracks

### ElevenLabs

An underwater AI companion delivers dynamic voice narration and explains experiments.

### Photon / Spectrum

An iMessage agent can:

- Invite teammates.
- Coordinate room sessions.
- Send challenge links.
- Retrieve results.
- Compare designs.
- Notify players when shared challenges are completed.

A qualifying implementation must actually integrate Spectrum.

### Snowflake API

Provide research-grounded scientific exploration through supported Snowflake models.

### Best .Tech Domain

Deploy ReefForge with a polished public website and memorable domain.

### DEV Writing Challenge

Publish an engineering article explaining the game, fluid model, research references, technical trade-offs, and lessons.

### Commit Fellowship

Position ReefForge as an early-stage platform connecting entertainment-driven creativity with scientific design exploration.

## Lower-priority tracks

Solana may support transparent design provenance, but should only be integrated if the feature provides meaningful value.

Capital One Nessie and Ig Turing should not be forced into this product.

**Recommended core submission targets: General, Frutiger Aero, Community, Gemini, and Tiger Data.**

Additional categories should be pursued only after the central game is stable.

---

# 11. Exact Three-Minute Judging Demo

## 0:00–0:20 — The Problem

Display real coral reef imagery and engineered settlement structures.

Explain that researchers have demonstrated the importance of geometry for coral settlement.

Introduce the insight:

"Millions of people love inventing things in sandbox games. What if their creativity could help researchers find new coral restoration designs?"

## 0:20–0:35 — Choose a Real Reef

Open the global ocean map.

Select Kāneʻohe Bay, Oʻahu.

Zoom toward the real mapped reef region: "This is where researchers tested the helix design."

Transition into the underwater workshop.

Briefly show the selected environmental scenario.

## 0:35–1:15 — Build Together

Two judges join the same multiplayer challenge.

Each builds an underwater structure using modular tools.

Show intuitive construction, rotation, and material constraints.

## 1:15–1:45 — Release the Larvae

Press TEST.

Hundreds of luminous simulated coral larvae move around the structures.

Show flow patterns, encounters, and modeled settlement events.

Explain that the two designs use identical evaluation conditions.

## 1:45–2:10 — Compare Results

Display the two designs and their actual simulation outputs.

Reveal:

- Settlement metrics.
- Material usage.
- Performance differences.
- Why geometry changed the modeled results.

## 2:10–2:40 — Scientific Reveal

Open Research Mode.

Show:

- Engineering geometry.
- Simulation record.
- Model configuration.
- Reproducible results.
- Experiment export.
- Reference scientific research.

Explain that the created structure is an engineering candidate suitable for further screening, not an experimentally proven improvement.

## 2:40–3:00 — The Bigger Vision

Return to the global ocean map.

Show additional reef missions.

Explain how thousands of player designs could form a distributed scientific design-exploration platform.

Close:

**"You just spent three minutes playing a game. But what you built didn't disappear when the game ended. It became a reproducible engineering candidate that scientists could examine and potentially test in the real ocean."**

---

# 12. Hackathon Scope

The project must prioritize one complete vertical slice over a large collection of incomplete features.

## Must Build

- Public landing page.
- Global reef selection map.
- Kāneʻohe Bay as the fully data-backed opening reef, plus Florida Keys, Great Barrier Reef, and Maldives scenarios. Like Mayday Mayor's city packs, these can show as "coming next" if time runs short.
- One fully functional underwater construction arena.
- Four reliable construction components.
- Placement, rotation, deletion, undo, and camera controls.
- Functional larval simulation.
- Reproducible experiment evaluation.
- Two-player competitive challenge.
- Results comparison.
- Scientific research view.
- Geometry and experiment export.
- Gemini integration.
- Tiger Data integration.
- Polished Frutiger Aero interface.

## Stretch Goals

- ElevenLabs narration.
- Photon iMessage agent.
- Shared collaborative construction.
- Community design gallery.
- More reef locations.
- Advanced construction parts.
- Detailed hydrodynamic visualization.
- Rich scientific literature assistant.
- Expanded robustness challenges.

## Deliberately Excluded From MVP

- Fully accurate global underwater digital twins.
- Arbitrary 3D CFD for unrestricted geometries.
- Prediction of actual multi-year coral survival.
- Claims of real-world conservation outcomes.
- Fabrication partnerships that have not been established.
- Real-money conservation transactions.
- Blockchain features without a clear need.

---

# 13. Implementation Roadmap

## Phase 0 — Repository and Scientific Audit

Inspect Pocket Rivals, Mayday Mayor, scientific papers, and settlement simulation repositories.

Produce:

- Architecture audit.
- Code reuse plan.
- Data inventory.
- Simulation feasibility report.
- Technical risk register.

## Phase 1 — Physics Proof

Implement the smallest defensible larval simulation.

Test reference geometries.

Establish deterministic results and model limitations.

This is the primary go/no-go checkpoint for scientific claims.

## Phase 2 — Construction Vertical Slice

Build the underwater environment and geometry editor.

Connect construction directly to the simulation.

Ensure the complete loop works:

Build → Test → Results → Modify → Retest.

## Phase 3 — Multiplayer

Adapt reusable Pocket Rivals networking.

Implement room creation, joining, synchronized challenges, submissions, and score comparison.

Test with two real browser clients.

## Phase 4 — Global Map and Data

Reuse appropriate Mayday Mayor mapping patterns.

Integrate real reef geography and environmental context.

Implement Kāneʻohe Bay first (verified seafloor depth and heat-stress data), then Florida, Great Barrier Reef, and Maldives scenarios with documented data provenance. See `scientific-data-audit.md`.

## Phase 5 — Research Dashboard

Build the experiment history, comparisons, reproducibility records, and export system.

## Phase 6 — Sponsor Integrations

Implement Gemini and Tiger Data.

Add ElevenLabs and Photon only if the core game is working reliably.

## Phase 7 — Final Polish

Improve the interface, animations, onboarding, gameplay timing, responsiveness, and deployment stability.

Prepare the demo, architecture diagram, scientific citations, and submission materials.

---

# 14. Engineering and Scientific Risks

| Risk | Consequence | Mitigation |
|---|---|---|
| Physics does not generalize to creative shapes | Scores may mislead players | Constrain geometry; validate against experiments |
| No directly usable research dataset | Weak scientific grounding | Audit sources before building the evaluator |
| Global datasets lack local current details | False site-specific precision | Separate observed data from modeled conditions |
| 3D editor becomes too complex | Unfinished core gameplay | Start with modular primitives |
| Multiplayer instability | Broken judge experience | Reuse tested infrastructure and provide reliable recovery |
| AI hallucinates explanations | Scientific credibility suffers | Ground explanations in structured simulation outputs |
| Sponsor integrations consume development time | Core product becomes incomplete | Implement integrations by priority |
| No research partner | No real laboratory validation | Present outputs as candidate designs, not implemented solutions |
| Published designs have IP restrictions | Fabrication/reuse limitations | Review licensing, design independently, and document provenance |

---

# 15. Success Criteria

## Gameplay

A first-time user can:

- Select a reef.
- Understand the objective.
- Build a structure.
- Run an experiment.
- Interpret the results.
- Make an improvement.

All without scientific training.

## Multiplayer

Two players can independently construct and test designs in one challenge using identical evaluation conditions.

## Science

The engine can:

- Process valid geometry.
- Simulate reproducible larval trajectories.
- Report transparent metrics.
- Compare experiments.
- Document assumptions.
- Demonstrate appropriate reference-model validation or clearly state that validation remains incomplete.

## Research Output

A player-created experiment can be exported and inspected without the game client.

## Hackathon

The complete experience can be convincingly demonstrated in approximately three minutes.

## Long-Term Scientific Ambition

The most promising designs can eventually be fabricated, tested with real coral larvae, and incorporated into an iterative experimental feedback loop.

---

# 16. Longer-Term Roadmap

### Stage 1 — HackNC Prototype

Build and demonstrate the playable scientific construction game.

### Stage 2 — Community Design Platform

Introduce persistent profiles, shared creations, design remixing, multiplayer competitions, and global reef challenges.

### Stage 3 — Scientific Partnerships

Work with coral researchers to obtain appropriate geometry datasets, test model predictions, and select promising designs.

### Stage 4 — Experimental Feedback

Incorporate fabrication and laboratory test outcomes into the platform.

Use actual observed settlement and survival results to refine models.

### Stage 5 — Distributed Discovery

Enable large communities to explore environmental and engineering design challenges around the world.

Potential adjacent domains include:

- Marine habitat engineering.
- Coastal protection structures.
- Sustainable materials.
- Environmental fluid dynamics.
- Mechanical design optimization.

Any expansion should retain the core requirement that gameplay produces an objectively useful and independently evaluable output.

---

# 17. Key Scientific and Data Resources

**Coral settlement physics**

Levenstein et al. (2022), PLOS ONE  
https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0274088

**Engineered helix settlement structures**

Biological Conservation (2025)  
https://www.sciencedirect.com/science/article/pii/S0006320725004446

**Open-source coral settlement modeling**

https://github.com/mollymaebaker/Modelling-coral-settlement

**Global reef habitat mapping**

Allen Coral Atlas  
https://allencoralatlas.org/

**Global bathymetry**

GEBCO  
https://www.gebco.net/

**Coral temperature and heat stress**

NOAA Coral Reef Watch  
https://coralreefwatch.noaa.gov/

**Regional ocean-floor surveys**

NOAA Bathymetric Data Viewer  
https://www.ncei.noaa.gov/maps/bathymetry/

**Kāneʻohe Bay seafloor depth (opening reef)**

NOAA NCEI Oʻahu coastal elevation model, 1/3 arc-second (`oahu_13_mhw_2011.nc`)
https://www.ngdc.noaa.gov/thredds/catalog/regional/catalog.html

**Kāneʻohe Bay circulation**

Lowe et al. (2009), *Journal of Physical Oceanography*: wave-driven reef-flat currents, typically under 20 cm/s

**Coral restoration research and deployment**

Australian Institute of Marine Science  
https://www.aims.gov.au/

**Previous game projects**

Pocket Rivals  
https://github.com/darshrank/pocket-rivals

Mayday Mayor  
https://maydaymayor.us/

---

# 18. The Final Product Identity

**Pocket Rivals taught us how to make multiplayer games immediately entertaining.**

**Mayday Mayor taught us how to connect game decisions to real geographic environments and real-world outputs.**

**ReefForge combines those lessons with a different genre: creative engineering and scientific experimentation.**

It is not a reskin of Mayday Mayor.

It is a new game built on a similar underlying philosophy.

Mayday Mayor turns entertainment into potential planning intelligence.

ReefForge turns entertainment into potential engineering discoveries.

The global ocean is our map.

Real coral reefs are our missions.

Physical structures are our creations.

Hydrodynamics is our challenge.

Scientific experiments are our output.

**The bigger vision is a world where playing games doesn't just entertain us—it helps us discover things we couldn't have found alone.**

### REEFFORGE
**Build for fun. Discover for real.**