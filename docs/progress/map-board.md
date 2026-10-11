# `rdx/map-board`: where things stand

> History for this folder. The current handoff for `simple-clash/` is [`simple-clash.md`](simple-clash.md).

The working notes for this branch. Read this after `AGENTS.md` and before you change anything; update it at the end of each piece
of work. The older notes for milestones M1-M5 are in [`coastal-clash-evolution.md`](coastal-clash-evolution.md) (history only).

## Where to work

- Branch `rdx/map-board`, checked out in the `map-board/` folder (a git worktree of `github.com/RudrakshNanavaty/hacknc-26`).
- Work only here. Do not pull, merge or push other branches unless asked.

## What this branch is

`rdx/map-board` starts from `pratham/coastal-clash` (`8790e0e`, the five milestones and the merge of `aum/coastal-clash`) and adds
40 commits on top. In order:

1. **The map is the whole board** (desktop only): crisis on the map (`CrisisFx`, `CrisisAlert`, FEMA water clipped per area by
   `pipeline/flood-by-area.ts`), `DistrictPopover`, `CaseFile`, `ResultOverlay`, the hand fanned along the bottom (`HandDeck`), negotiation
   pings (protocol change in `room.ts`), the news as a crawl plus an anchor card (`NewsTV`). Phone layouts, the deck tray and
   drag-to-deploy were removed.
2. **Real civic stories** (merged `aum/civic-stories`): the 38-story cited corpus, the Snowflake loader, the Gemini casting agent, story
   hands, names and scripts.
3. **Public record on Solana** (merged `aum/solana-record`): match fingerprints, Merkle batches, devnet memos, `/verify/:matchId`.
4. **Tiger Data for the whole app**: gameplay timeline, match summaries, city snapshots, studio history, the civic record.
5. **Turn-based play**: no phase clock or pace; steps move on when everyone present is ready; the host can move on without someone.
   Story sources and verification are shown on the crisis card, the results and the final screen.
6. **Cards**: trading-card layout with a picture painted by Gemini in one matte clay-diorama house style, painted ahead of play from the lobby.
7. **Civic Atlas** replaces Planning Studio (`/atlas`; `/studio` still opens it), with `server/scripts/simulate.ts` for sandbox matches.
8. **3D characters**: five GLB figures rendered into portraits for the map, player bubbles, lobby seats and the news anchor.
9. **Voice**: ElevenLabs voices per character, one speech queue, the anchor nods to the real audio.
10. The Fisherman is no longer on the map or a speaker.
11. **First-time players and Sprint** (2026-10-11, not yet committed): see the section below.

## Status (2026-10-11)

- **Rules:** `coastal-clash-rules/2.0.0`, the same rules and the same `districts.json` as `pratham/coastal-clash` at `8790e0e`.
  `pratham/coastal-clash` has since moved to a money/agreements rules 3.0.0 that this branch does **not** have.
- **Tests:** `bun run test` passes on 2026-10-11: 17 files, all green (Bun 1.4.3, Node 22.23 via fnm; the default Node 22.11 crashes the
  WebSocket test, so put fnm's Node first on PATH). `bun run typecheck` is clean.
- **Toolchain:** Bun 1.4.2 workspaces (`bun.lock`); TypeScript 7, Vite 8, Vitest 5. `npm` instructions in older notes no longer apply.
- **Docs:** brought up to date on 2026-10-11 (this file, `README.md`, `AGENTS.md`, `docs/contributing.md`, `docs/coastal-clash.md`, the skill).

## First-time players and Sprint (2026-10-11)

Goal: a beginner understands the game quickly and can finish a match in under four minutes. Rules unchanged (still 2.0.0).

- **Three steps a round**, tracked at the top of the map (`app/src/game/Steps.tsx`, `STEP_OF` in `shared/src/room.ts`): Play a Card
  (crisis + select), Make a Deal (reveal + negotiate), See What Happens (resolve). The tracker also shows the storm goal (flood vs 50).
- **Cards in plain words** (`shared/src/game/simple.ts`, tested in `simple.test.ts`): ✅ good, ⚠️ bad, 💲 city money on every hand card;
  the area popover shows a plain card and "City money $30M → $22M" from `projectPreview` (`app/src/game/Plain.tsx`). The full card and
  its rules are under "More detail".
- **Negotiation as Support / Oppose / Make a Deal** (`app/src/game/moves.ts`): Make a Deal accepts the compromise offered on your own
  proposal (free), otherwise pays the proposal's bill (`fund`). Same engine moves; the case file and hints use the same words.
- **Verdicts and the storm** (`app/src/game/Climax.tsx`): one big APPROVED / REJECTED (/ DELAYED / NO MONEY) stamp per proposal in the
  middle of the screen, then after round 3 the storm scene (rain, thunder, flood gauge against the 50 line, "The city held!" or the damage);
  if the city falls short, the real FEMA flood zones fill across every area. The old instant storm overlay in `LivingLayer` is gone.
- **Sprint pace** (protocol change: `RoomState.pace`, `ClientMsg {t:'pace'}`, `MatchRecord.pace`): host picks it in the lobby; each phase
  gets a server deadline (`SPRINT_MS`, 60 s a round, +6 s for the storm). Turn-by-turn stays the default and never times out.
- Lobby: pace picker and a "How to play" box. Statuses read "Rejected" (was "Voted down").
- Verified: typecheck, 159 tests (incl. new sprint/turns room tests, `simple.test.ts`, `dealFor` tests); a bot-filled match played in the browser
  turn by turn at 1440×900 and as a sprint at 1280×720 (141 s start to podium, the timers advancing every step).
- Not verified: the storm-damage branch (flood under 50) on screen; every test match ended with flood 52-62. The code path is the
  crisis map effect with kind `flood` on all areas.

## Known loose ends in the code

- Fixed 2026-10-11: `MemoryCivicStore` wrote to `/dev/null/coastal-clash-civic-memory.json`, which on Windows is the real file
  `C:\dev\null\coastal-clash-civic-memory.json`, so test runs shared state and `db.test.ts` / `civic.test.ts` failed from the
  second run on. It now keeps no file. A leftover copy of that file from earlier runs is harmless and can be deleted.

- `app/src/api.ts` and the Atlas exports still call the `/api/studio*` routes (they work; the names are historical).
- `render.yaml` does not list `SNOWFLAKE_*` or `SOLANA_*`; set them by hand on the host if the deployment should use them.

## Open questions for humans

- The Gemini key: on 2026-10-11 it returned HTTP 402 ("prepayment credits are depleted"). Check it before a demo; everything falls back to templates.
- Balance numbers for the cards, combo bonuses, upkeep and twist magnitudes are first guesses (illustrative values) and need playtesting.
- Whether `rdx/map-board` should take the rules 3.0.0 money work from `pratham/coastal-clash`. Not decided; do not merge without asking.

## Next steps

1. Playtest the beginner flow with someone new: can they finish a sprint without help? Watch the deal step most.
2. Play a bot-filled match at 1440×900 and 1280×720 with and without keys (Gemini, ElevenLabs, Snowflake), and note what each fallback looks like.
3. Fix the loose ends above.
