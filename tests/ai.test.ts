import { describe, expect, it } from "vitest";
import { findUngroundedNumbers } from "../src/ai/critic";
import { settlementZones } from "../src/experiment/summary";
import { preset } from "../src/geometry";
import { DEFAULT_GRID } from "../src/sim/params";

describe("critic grounding check", () => {
  const facts = { settlementPct: 30.2, settled: 604, flow: { peakVelocityCmS: 4.5 }, zones: { nearFeatureBase: 312 } };

  it("accepts numbers that appear in the facts (with rounding tolerance)", () => {
    expect(findUngroundedNumbers("Settlement was 30.2%, 604 larvae, flow 4.5 cm/s, 312 near the base.", facts)).toEqual([]);
    expect(findUngroundedNumbers("about 30.19%", facts)).toEqual([]);
  });

  it("flags numbers that are not in the facts", () => {
    expect(findUngroundedNumbers("This would grow 80-fold more coral, reaching 55%.", facts)).toEqual(["80", "55"]);
  });

  it("ignores small counts used in ordinary language", () => {
    expect(findUngroundedNumbers("Add 2 ridges about 1 mm apart.", facts)).toEqual([]);
  });
});

describe("settlementZones", () => {
  it("classifies settlers by the surface under them", () => {
    // ridge preset: first ridge occupies columns 15..18; recess preset: first cavity 12..21
    const ridge = settlementZones(preset("ridge"), DEFAULT_GRID, [16.5, 20.2, 70.0]);
    expect(ridge).toEqual({ onRaisedFeature: 1, nearFeatureBase: 1, insideRecess: 0, openFlat: 1 });
    const recess = settlementZones(preset("recess"), DEFAULT_GRID, [15, 22.5, 0.5]);
    expect(recess.insideRecess).toBe(1);
    expect(recess.nearFeatureBase).toBe(1);
  });
});
