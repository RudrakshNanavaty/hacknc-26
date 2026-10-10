/**
 * "Beat the Recess": a local (this browser only) leaderboard of player designs.
 * Fairness rules (D-017):
 *  - every entry is evaluated on the same 5 leaderboard seeds with the frozen parameters
 *  - a design may expose at most as much surface as the ridge/recess presets (54 mm),
 *    so adding wall area cannot win by itself
 *  - exact copies of the reference presets are not accepted as entries
 */
import { createStore, del, entries, set } from "idb-keyval";
import type { ExperimentRecord, Profile, SimConfig } from "../contracts";
import { exposedLengthMm, PRESETS, validateProfile } from "../geometry";
import { DEFAULT_GRID, PROFILE_HEADROOM, SIM_VERSION } from "../sim/params";
import { meanCI } from "./stats";

export const LEADERBOARD_SEEDS = [201, 202, 203, 204, 205];
export const SURFACE_BUDGET_MM = 54;
export const NAME_MAX = 24;

export interface LeaderboardEntry {
  id: string;
  name: string;
  createdAt: string;
  profile: Profile;
  meanPct: number;
  ciLo: number;
  ciHi: number;
  perSeedPct: number[];
  exposedLengthMm: number;
  simVersion: string;
  paramsKey: string;
}

export type Eligibility = { ok: true; exposedLengthMm: number } | { ok: false; reason: string; exposedLengthMm: number };

const sameGeometry = (a: Profile, b: Profile) =>
  a.baseHeight === b.baseHeight &&
  a.segments.length === b.segments.length &&
  a.segments.every((s, i) => s.x === b.segments[i]!.x && s.width === b.segments[i]!.width && s.height === b.segments[i]!.height);

export function eligibility(profile: Profile): Eligibility {
  const exposed = exposedLengthMm(profile, DEFAULT_GRID);
  const errors = validateProfile(profile, { nx: DEFAULT_GRID.nx, ny: DEFAULT_GRID.ny, headroom: PROFILE_HEADROOM });
  if (errors.length) return { ok: false, reason: `Invalid profile: ${errors[0]}`, exposedLengthMm: exposed };
  const copy = PRESETS.find((p) => sameGeometry(p, profile));
  if (copy) return { ok: false, reason: `That is the ${copy.name} preset. Change it to make it yours.`, exposedLengthMm: exposed };
  if (exposed > SURFACE_BUDGET_MM + 1e-9) {
    return {
      ok: false,
      reason: `Uses ${exposed.toFixed(1)} mm of surface; the budget is ${SURFACE_BUDGET_MM} mm (same as ridge and recess). Remove or shorten a feature.`,
      exposedLengthMm: exposed,
    };
  }
  return { ok: true, exposedLengthMm: exposed };
}

export const paramsKey = (config: SimConfig) => JSON.stringify(config.params);

export function toEntry(name: string, profile: Profile, records: ExperimentRecord[], config: SimConfig): LeaderboardEntry {
  const pcts = records.map((r) => r.results.settlementPct);
  const ci = meanCI(pcts);
  return {
    id: `lb-${Date.now()}`,
    name: name.trim().slice(0, NAME_MAX) || "Anonymous reef",
    createdAt: new Date().toISOString(),
    profile,
    meanPct: ci.mean,
    ciLo: ci.lo,
    ciHi: ci.hi,
    perSeedPct: pcts,
    exposedLengthMm: records[0]?.results.exposedLength ?? 0,
    simVersion: SIM_VERSION,
    paramsKey: paramsKey(config),
  };
}

/** Highest mean first; entries from other simulator versions or parameters are excluded. */
export function rank(list: LeaderboardEntry[], currentParamsKey: string): LeaderboardEntry[] {
  return list
    .filter((e) => e.simVersion === SIM_VERSION && e.paramsKey === currentParamsKey)
    .sort((a, b) => b.meanPct - a.meanPct || a.createdAt.localeCompare(b.createdAt));
}

let store: ReturnType<typeof createStore> | null = null;
const db = () => (store ??= createStore("reefforge-leaderboard", "entries"));

export async function saveEntry(e: LeaderboardEntry) {
  await set(e.id, e, db());
}

export async function listEntries(): Promise<LeaderboardEntry[]> {
  return (await entries<string, LeaderboardEntry>(db())).map(([, v]) => v);
}

export const deleteEntry = (id: string) => del(id, db());
