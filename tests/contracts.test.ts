import { describe, expect, it } from "vitest";
import sampleRecordJson from "../fixtures/sample-record.json";
import presetsJson from "../fixtures/presets.json";
import { CONTRACT_VERSION, type ExperimentRecord, type Profile } from "../src/contracts";
import { validateProfile } from "../src/geometry/profile";
import { DEFAULT_GRID, PROFILE_HEADROOM } from "../src/sim/params";

// Assignments are checked by `npm run typecheck`: the fixtures must match the contract shapes.
const sampleRecord: ExperimentRecord = sampleRecordJson as ExperimentRecord;
const presets: Profile[] = presetsJson.presets as Profile[];
const limits = { nx: DEFAULT_GRID.nx, ny: DEFAULT_GRID.ny, headroom: PROFILE_HEADROOM };

describe("fixtures match contracts", () => {
  it("is contract v2", () => expect(CONTRACT_VERSION).toBe(2));

  it("sample record is internally consistent", () => {
    const r = sampleRecord.results;
    expect(r.settlementPct).toBeCloseTo((r.settled / r.released) * 100, 6);
    expect(sampleRecord.assumptions[0]).toMatch(/FIXTURE/);
    expect(validateProfile(sampleRecord.profile, limits)).toEqual([]);
  });

  it("presets are valid profiles covering the grid", () => {
    expect(presets.map((p) => p.id)).toEqual(["preset-flat", "preset-ridge", "preset-recess", "preset-step"]);
    for (const p of presets) expect(validateProfile(p, limits)).toEqual([]);
  });
});
