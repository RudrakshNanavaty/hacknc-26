import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import sampleRecordJson from "../fixtures/sample-record.json";
import { createMockSimWorker, MOCK_TICK_MS, MOCK_TICKS } from "../src/sim/mockWorker";
import type { ExperimentRecord, WorkerResponse } from "../src/contracts";

const record = sampleRecordJson as ExperimentRecord;

describe("mock worker", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("emits progress frames then a done record", () => {
    const w = createMockSimWorker();
    const got: WorkerResponse[] = [];
    w.onmessage = (e) => got.push(e.data);
    w.postMessage({ type: "run", runId: "r1", profile: record.profile, config: record.config });
    vi.advanceTimersByTime(MOCK_TICK_MS * (MOCK_TICKS + 2));
    expect(got.filter((m) => m.type === "progress")).toHaveLength(MOCK_TICKS);
    const done = got.at(-1);
    expect(done?.type).toBe("done");
    if (done?.type === "done") expect(done.record.assumptions[0]).toMatch(/MOCK/);
  });

  it("cancel stops a run before done", () => {
    const w = createMockSimWorker();
    const got: WorkerResponse[] = [];
    w.onmessage = (e) => got.push(e.data);
    w.postMessage({ type: "run", runId: "r2", profile: record.profile, config: record.config });
    vi.advanceTimersByTime(MOCK_TICK_MS * 3);
    w.postMessage({ type: "cancel", runId: "r2" });
    vi.advanceTimersByTime(MOCK_TICK_MS * (MOCK_TICKS + 2));
    expect(got.some((m) => m.type === "done")).toBe(false);
  });
});
