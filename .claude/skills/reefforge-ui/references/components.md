# Component catalog

Check this list before you build anything new. Update it in the same PR whenever you add a component or a variant.

Status key: ☐ planned · ◐ in progress · ✅ done. Change the status as you work.

## Shell and layout
ReefForge 2.0 (D-021) supersedes the permanent rail/results/dock layout below. `AppShell` now owns Build, Simulate and Results modes. Existing components remain available; legacy `MetricsPanel`, `ChallengeBar`, `Dock` and `OnboardingOverlay` are not mounted by the gameplay shell.

| Current component | Status | Role |
|---|---|---|
| `AppShell` v2.0 | done | Mission selection, mode-specific panels, inline onboarding, research/library dialogs and footer actions |
| `BuildControls` | done | Reuses horizontal ShapePalette and GhostButton; dimensions, keyboard placement, selection/delete/reset, surface and shaped-area meters |
| `Stage` v2.0 | done | Authoritative 2D canvas, honest condition label, progress, flow toggle and sampled-animation speed |
| `SimView` v2.0 | done | Budget-aware previews, snapped placement, sampled larvae, settlement glow and horizontal map; no scene writes to scoring |
| `Modal` | extended | Focus trap, Escape and focus return |
| `Toggle` | fixed | Label-sized checkbox hit target with non-intercepting decoration |

| Component | Status | Props / variants | Notes |
|---|---|---|---|
| `AppShell` | ✅ | — | Owns the regions and the CSS grid (rail · stage · results, dock row). Nothing else positions top-level regions. Also hosts all dialogs. |
| `ChallengeBar` | ✅ | `title`, `benchmarkStatus: "pass" \| "fail" \| "pending"`, `ciText`, `onBadgeClick` | Top region: brand, one-line challenge, benchmark badge. Conditions moved to `Stage`. |
| `Stage` | ✅ | `buildEnabled` | Centre region: profile name, conditions, legend, flow toggle, `SimView`, progress line. |
| `MetricsPanel` | ✅ | `showExtrusion?`, `onOpenBenchmark`, `onOpenRecord` | Right region ("Results"): score → baselines → pre-registered test card → `CriticCard` → collapsible Run details. In a `Modal` on mobile. |
| `BottomSheet` | ☐ | `open`, `snap: "peek" \| "half" \| "full"` | Mobile only. Not built: mobile uses `Modal` for Results/Presets. |

## Surfaces
| Component | Status | Props / variants | Notes |
|---|---|---|---|
| `GlassPanel` | ✅ | `variant: "default" \| "strong"`, `title?` | The only component allowed to use `backdrop-filter`. |
| `TitleBar` | ✅ | `title`, `onCollapse?` | Used inside `GlassPanel`. No traffic-light buttons. |
| `Toast` | ✅ | `tone: "info" \| "pass" \| "fail"` | Bottom-center, auto-dismisses after 3 s. |

## Controls
| Component | Status | Props / variants | Notes |
|---|---|---|---|
| `AquaButton` | ✅ | `size: "md" \| "lg"`, `disabled`, `loading` | **Primary actions only:** Run, Save. |
| `GhostButton` | ✅ | `size`, `icon?` | Every secondary action. |
| `Dock` | ✅ | `items: DockItem[]`, `primary?` | Floating pill: Run + Presets · Save · Library · Leaderboard · Help. Hover lift is gated to fine pointers. |
| `GlossIcon` | ✅ | `icon`, `tone` | Restrained gloss tile around an inline SVG icon (`icons.tsx`; no icon dependency). |
| `ShapePalette` | ✅ | `selected`, `onSelect`, `onUndo`, `onRedo`, `canUndo`, `canRedo` | The left rail: 4 shape tools + Undo/Redo. Rendered inside a `GlassPanel`. |
| `Segmented` | ✅ | `value`, `options`, `onChange`, `label` | Instant (no animation) switch, for example in the Library dialog. |
| `Toggle` | ✅ | `checked`, `label` | Used for reduced motion and showing flow arrows. |

## Data display
| Component | Status | Props / variants | Notes |
|---|---|---|---|
| `ScoreReadout` | ✅ | `pct`, `label = "Simulated settlement"`, `delta?` | The largest number on screen. Counts up over `--dur-slow`. |
| `BaselineBars` | ✅ | `flat`, `ridge`, `recess`, `yours` | Fixed order and fixed colors (see SKILL.md). |
| `BenchmarkBadge` | ✅ | `status`, `ciText` | Clicking it opens `AssumptionsList`. |
| `AssumptionsList` | ✅ | `items: string[]` | Fed from `ExperimentRecord.assumptions`. |
| `CriticCard` | ✅ | `record` | Gemini output, always labeled "AI explanation". Hidden without `VITE_GEMINI_API_KEY`. Flags numbers not in the record. |
| `SimView` | ✅ | `buildEnabled` | Canvas (geometry, flow, larvae, placement preview) + settlement strip aligned to the x-axis. Frames via refs, never React state. |

## Overlays
| Component | Status | Props / variants | Notes |
|---|---|---|---|
| `LeaderboardView` | ✅ | `profile`, `onLoad` | Local "Beat the Recess" board inside a `Modal`; surface-budget meter, 5-seed evaluation in a second worker. |
| `Modal` | ✅ | `title`, `onClose`, `wide?` | Centered dialog over a scrim; Escape / scrim click closes. Hosts presets, library (this run / saved), benchmark, leaderboard, onboarding and mobile results. |
| `OnboardingOverlay` | ✅ | `step` | 3 steps: what you see, what the score means, why to trust it. |
