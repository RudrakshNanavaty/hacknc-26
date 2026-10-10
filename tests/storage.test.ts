import { describe, expect, it } from "vitest";
import fixture from "../fixtures/sample-record.json";
import { parseRecord } from "../src/experiment/storage";
import { applyTool, preset } from "../src/geometry";
import { BUILD_LIMITS } from "../src/experiment/missions";
import { SIM_VERSION } from "../src/sim/params";

describe("scientific record import", () => {
  it("preserves the exact data and accepts equivalent grid key ordering", () => {
    const record = structuredClone(fixture);
    record.config.simVersion = SIM_VERSION;
    record.config.grid = { cellSizeMm:0.25, ny:64, nx:136 };
    expect(parseRecord(JSON.stringify(record))).toEqual(record);
  });
  it("rejects records that cannot be rendered or reproduced by this build", () => {
    const record = structuredClone(fixture);
    record.config.grid.nx = 256;
    expect(() => parseRecord(JSON.stringify(record))).toThrow("grid or simulator version");
    expect(() => parseRecord('{"results":{}}')).toThrow("Not a ReefForge");
  });
  it("applies the same shaping budget to imported geometry", () => {
    const record = { ...fixture, profile:applyTool(preset("flat"),BUILD_LIMITS,"step",68,{width:136,height:10}) };
    expect(() => parseRecord(JSON.stringify(record))).toThrow("shaping area");
  });
});
