# Component catalog

Check this list before you build anything new. Update it in the same PR whenever you add a component or a variant.

Status key: ☐ planned · ◐ in progress · ✅ done. Change the status as you work.

## Shell and layout
| Component | Status | Props / variants | Notes |
|---|---|---|---|
| `AppShell` | ✅ | `children` | Owns the 5 regions and the CSS grid. Nothing else positions top-level regions. |
| `ChallengeBar` | ✅ | `title`, `benchmarkStatus: "pass" \| "fail" \| "pending"` | Top region. |
| `MetricsPanel` | ✅ | `collapsed`, `onToggle` | Right region. On mobile it becomes a `BottomSheet`. |
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
| `Dock` | ✅ | `items: DockItem[]` | Bottom region. Icons magnify 1.15× on hover (transform only). |
| `GlossIcon` | ✅ | `icon`, `tone` | Wraps Lucide icons in a glossy tile. |
| `ShapePalette` | ✅ | `selected`, `onSelect` | Owned by stream B. Shapes: flat, ridge, recess, step. |
| `Toggle` | ✅ | `checked`, `label` | Used for reduced motion and showing flow arrows. |

## Data display
| Component | Status | Props / variants | Notes |
|---|---|---|---|
| `ScoreReadout` | ✅ | `pct`, `label = "Simulated settlement"`, `delta?` | The largest number on screen. Counts up over `--dur-slow`. |
| `BaselineBars` | ✅ | `flat`, `ridge`, `recess`, `yours` | Fixed order and fixed colors (see SKILL.md). |
| `BenchmarkBadge` | ✅ | `status`, `ciText` | Clicking it opens `AssumptionsList`. |
| `AssumptionsList` | ✅ | `items: string[]` | Fed from `ExperimentRecord.assumptions`. |
| `CriticCard` | ✅ | `text`, `loading` | Gemini output. Always labeled "AI explanation". |

## Overlays
| Component | Status | Props / variants | Notes |
|---|---|---|---|
| `LeaderboardView` | ✅ | `profile`, `onLoad` | Local "Beat the Recess" board inside a `Modal`; surface-budget meter, 5-seed evaluation in a second worker. |
| `Modal` | ✅ | `title`, `onClose`, `wide?` | Centered dialog over a scrim; Escape / scrim click closes. Hosts presets, records, benchmark, onboarding and mobile results. |
| `OnboardingOverlay` | ✅ | `step` | 3 steps: what you see, what the score means, why to trust it. |
