# Checkout implementation and verification notes

The [Devpost project context](devpost.md) is the primary source for the project's public narrative. This document records the scope of the code in this checkout for developers, separately from the broader project submission. A documentation update does not implement additional services.

## Current game

The default is Planning Edition, rules `coastal-clash-rules/planning-1.0.0`. Its three committed scenarios are tested against the local civic corpus. The server does not generate fresh Planning Edition scenarios at match start. Gemini narrates facts and engine outcomes; the rules decide votes, verdicts, and scores.

The earlier card game remains available through the room protocol for legacy play and records. [Planning Edition rules](planning-edition.md) and [the earlier architecture](coastal-clash.md) cover the two versions.

## Research, ledger, and incentives

- The Devpost submission describes the team's multi-agent civic research desk. This checkout packages its research corpus, Snowflake loader, Gemini casting script, validation, and story feed. It does not package the autonomous scout orchestration as a standalone service.
- The current Solana civic service requires a legacy `final` result. Planning Edition records use a different shape and are skipped by that service. The Devpost's project-level public-ledger description should not be read as verification that Planning Edition records are anchored by this checkout.
- The contribution-card design and devnet prototype described in the submission originate in Mayday Mayor. Contribution-card minting is not present in this tree. The submission explicitly excludes Solana from the live demo and describes a simulated authority rather than a live city program.
- Tiger Data persists match records and decision rows. Planning Edition Atlas aggregation in this checkout reads saved match records; it does not directly query the decision-row table for its four views.
- A chain proof detects changes to the fields covered by the fingerprint. It does not establish participation representativeness or the truth of underlying civic claims.

## Verification

As of October 11, 2026:

- `bun run typecheck`: all workspaces pass.
- `bun run test`: 215 tests across 20 files pass.
- `bun run build`: passes with the existing bundle-size advisory.
- Landing, selection, and lobby were checked in Chromium at 1440×900, 1280×720, 768×1024, and 390×844, including a second client joining, role switching, bot controls, map controls, motion preferences, and game start.
- The game board remains desktop-oriented. Pre-game mobile checks do not establish a complete phone gameplay experience.
- Live vendor availability depends on credentials, quotas, and network access; integration tests do not certify live service availability.

See [UI verification](progress/ui-polish.md), [the handoff](progress/simple-clash.md), and [setup instructions](contributing.md) for further detail.
