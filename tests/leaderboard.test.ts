import { describe, expect, it } from "vitest";
import type { ExperimentRecord, SimConfig } from "../src/contracts";
import { eligibility, NAME_MAX, paramsKey, rank, SURFACE_BUDGET_MM, toEntry, type LeaderboardEntry } from "../src/experiment/leaderboard";
import { applyTool, preset } from "../src/geometry";
import { BASE_PARAMS, DEFAULT_GRID, PROFILE_HEADROOM, SIM_VERSION } from "../src/sim/params";

const limits = { nx: DEFAULT_GRID.nx, ny: DEFAULT_GRID.ny, headroom: PROFILE_HEADROOM };
const config: SimConfig = { grid: DEFAULT_GRID, params: { ...BASE_PARAMS, cueAttachProb: 0.2, attachMaxSpeedMmS: 10 }, seed: 201, simVersion: SIM_VERSION };

describe("leaderboard eligibility", () => {
  it("rejects exact preset copies", () => {
    const e = eligibility(preset("ridge"));
    expect(e.ok).toBe(false);
  });

  it("accepts a player design within the surface budget", () => {
    const p = applyTool(preset("flat"), limits, "ridge", 60);
    const e = eligibility(p);
    expect(e.ok).toBe(true);
    expect(e.exposedLengthMm).toBeLessThanOrEqual(SURFACE_BUDGET_MM);
  });

  it("rejects designs that buy score with extra wall area", () => {
    let p = preset("flat");
    for (const x of [10, 30, 50, 70, 90, 110]) p = applyTool(p, limits, "ridge", x); // 6 ridges = 64 mm
    const e = eligibility(p);
    expect(e.ok).toBe(false);
    if (!e.ok) expect(e.reason).toMatch(/budget/);
  });
});

describe("leaderboard entries and ranking", () => {
  const rec = (pct: number) => ({ results: { settlementPct: pct, exposedLength: 44 } }) as unknown as ExperimentRecord;

  it("aggregates seeds into a mean with a CI and clamps long names", () => {
    const e = toEntry("x".repeat(80), preset("flat"), [rec(20), rec(22), rec(24)], config);
    expect(e.meanPct).toBeCloseTo(22);
    expect(e.ciLo).toBeLessThan(22);
    expect(e.name).toHaveLength(NAME_MAX);
    expect(toEntry("   ", preset("flat"), [rec(1)], config).name).toBe("Anonymous reef");
  });

  it("ranks by mean and drops entries made with other parameters", () => {
    const key = paramsKey(config);
    const mk = (id: string, meanPct: number, pk = key): LeaderboardEntry =>
      ({ id, meanPct, createdAt: id, simVersion: SIM_VERSION, paramsKey: pk }) as LeaderboardEntry;
    const ranked = rank([mk("a", 10), mk("b", 30), mk("c", 99, "other")], key);
    expect(ranked.map((e) => e.id)).toEqual(["b", "a"]);
  });
});
