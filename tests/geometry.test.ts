import { describe, expect, it } from "vitest";
import {
  applyTool,
  exposedLengthMm,
  historyInit,
  historyPush,
  historyRedo,
  historyUndo,
  preset,
  profileToHeights,
  profileToMask,
  validateProfile,
} from "../src/geometry";
import { DEFAULT_GRID, PROFILE_HEADROOM } from "../src/sim/params";

const limits = { nx: DEFAULT_GRID.nx, ny: DEFAULT_GRID.ny, headroom: PROFILE_HEADROOM };

describe("profileToMask", () => {
  it("flat preset fills exactly baseHeight rows", () => {
    const mask = profileToMask(preset("flat"), DEFAULT_GRID);
    const solid = mask.reduce((a, b) => a + b, 0);
    expect(solid).toBe(DEFAULT_GRID.nx * preset("flat").baseHeight);
  });

  it("ridge adds and recess removes material at the feature columns", () => {
    const { nx } = DEFAULT_GRID;
    const ridge = profileToMask(preset("ridge"), DEFAULT_GRID);
    const recess = profileToMask(preset("recess"), DEFAULT_GRID);
    expect(ridge[(12 + 5) * nx + 16]).toBe(1); // inside the first ridge
    expect(recess[(12 - 5) * nx + 16]).toBe(0); // inside the first cavity
    expect(recess[0 * nx + 16]).toBe(1); // cavity never cuts the floor
  });
});

describe("exposed length", () => {
  it("is equal for ridge and recess by construction, and larger than flat", () => {
    const flat = exposedLengthMm(preset("flat"), DEFAULT_GRID);
    const ridge = exposedLengthMm(preset("ridge"), DEFAULT_GRID);
    const recess = exposedLengthMm(preset("recess"), DEFAULT_GRID);
    expect(flat).toBeCloseTo(34);
    expect(ridge).toBeCloseTo(54);
    expect(recess).toBeCloseTo(ridge);
  });
});

describe("applyTool", () => {
  it("stamps a ridge and keeps the profile valid", () => {
    const p = applyTool(preset("flat"), limits, "ridge", 60);
    expect(validateProfile(p, limits)).toEqual([]);
    const h = profileToHeights(p, DEFAULT_GRID.nx);
    expect(h[60]).toBe(10);
    expect(p.source).toBe("player");
  });

  it("clamps heights so features never reach the release band or cut the floor", () => {
    const tall = applyTool(preset("flat"), limits, "ridge", 30, { height: 999 });
    const deep = applyTool(preset("flat"), limits, "recess", 30, { height: -999 });
    expect(validateProfile(tall, limits)).toEqual([]);
    expect(validateProfile(deep, limits)).toEqual([]);
  });

  it("absorbs slivers narrower than 2 cells", () => {
    let p = applyTool(preset("flat"), limits, "ridge", 50, { width: 4 });
    p = applyTool(p, limits, "ridge", 53, { width: 4, height: 6 });
    expect(validateProfile(p, limits)).toEqual([]);
  });
});

describe("history", () => {
  it("undoes and redoes", () => {
    let h = historyInit(1);
    h = historyPush(h, 2);
    h = historyPush(h, 3);
    h = historyUndo(h);
    expect(h.present).toBe(2);
    h = historyRedo(h);
    expect(h.present).toBe(3);
    h = historyUndo(historyUndo(historyUndo(h)));
    expect(h.present).toBe(1);
  });
});
