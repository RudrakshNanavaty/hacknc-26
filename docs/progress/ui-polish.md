# Pre-game UI polish verification

2026-10-11 · `pratham/seascape-bubbles` · `simple-clash/`

## Shared components and materials

- `app/src/ui/CoastalShell.tsx`: a common header, compact/large glossy branding, seascape and responsive content wrapper.
- `app/src/ui/coastal.css`: scoped pre-game tokens for glass layers, blur, borders, shadows, radii, controls and spacing.
  Desktop content occupies 78% of the viewport up to 1440px; tablet/mobile use fixed outer gutters. Game HUD styles retain their own scale.
- `app/src/ui/Stakeholder.tsx`: 48px portraits, role names and supporting text shared by all three screens.
- `Landing.tsx`: existing map, district details, layer controls, host/join, Atlas, cards and sources inside the shared shell.
- `Lobby.tsx`: matching selection and seat cards, accessible role-specific bot/switch button labels, compact QR panel and full-width guide.
- `Invite.tsx`: 184px QR with a four-module white quiet zone and clearly separated room code.
- Original `background_seascape.png`, `bubbles.png`, extracted sprites, animation timing, multiplayer protocol and game rules are unchanged.

## Browser checks

Used installed Playwright/Chromium because the Browser plugin reported no available browser. No dependency was added to this project.
App/API used isolated ports 5186/8796 and optional external integrations were disabled for test rooms.

| Viewport | Landing | Stakeholder selection | Lobby |
| --- | --- | --- | --- |
| 1440×900 | Pass | Pass | Pass |
| 1280×720 | Pass | Pass | Pass |
| 768×1024 | Pass | Pass | Pass |
| 390×844 | Pass | Pass | Pass |

Captured all screens at the same viewport sizes and reviewed the side-by-side comparison. Corrected map-legend corner clipping and
excessive lobby-card height during visual review. All screen headers align with content; background filters and primary glass gradients
match exactly; no page has horizontal overflow. The mobile flow scrolls vertically and retains all actions. No browser runtime errors.

Verified creating a room, selecting a stakeholder, adding/removing bots, a second browser context joining, guest role switching,
host updates, and start at both desktop sizes (including automatic filling of empty seats). Map district selection and layer toggles
still respond. Bubbles float with normal motion and stop under reduced motion. QR rendering and its white scan margin were checked;
physical camera scanning and a complete multiplayer match on phones were not tested. The game stage remains desktop-oriented.

Local, git-ignored artifacts: `server/.cache/ui-polish/` contains `comparison.html`, `comparison.png`, individual full-page PNGs,
`report.json`, and the verification scripts. The HTML displays landing/onboarding/lobby side by side for each viewport.

## Build checks

- `bun run typecheck`: all three workspaces pass.
- `bun run test`: 215 tests in 20 files pass.
- `bun run build`: pass, with the existing bundle-size advisory for map/3D code.

No screenshots were attached to the request; the original live screens supplied the branding/material references.
