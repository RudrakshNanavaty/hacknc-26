import { afterEach, describe, expect, it, vi } from "vitest";
import sampleRecordJson from "../fixtures/sample-record.json";
import type { ExperimentRecord } from "../src/contracts";

const record = sampleRecordJson as ExperimentRecord;

describe("critique() request/response (stubbed fetch, no real API call)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("sends the key as a header, asks for schema'd JSON, and flags ungrounded numbers", async () => {
    vi.stubEnv("VITE_GEMINI_API_KEY", "test-key");
    const reply = { why: "14.2% settled.", flowFeatures: "Recirculation behind ridges.", limits: "2D only.", tryNext: "Grows 80-fold more coral." };
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(reply) }] } }] }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    const { critique } = await import("../src/ai/critic");

    const out = await critique(record, { baselines: null, status: null, recessMinusRidge: null });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/generativelanguage\.googleapis\.com\/v1beta\/models\/.+:generateContent$/);
    expect(url).not.toContain("test-key"); // key travels in a header, never in the URL
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe("test-key");
    const body = JSON.parse(init.body as string);
    expect(body.generationConfig.responseMimeType).toBe("application/json");
    expect(body.contents[0].parts[0].text).toContain("settlementPct");
    expect(out.critique).toEqual(reply);
    expect(out.ungroundedNumbers).toEqual(["80"]);
  });

  it("surfaces API errors instead of inventing an explanation", async () => {
    vi.stubEnv("VITE_GEMINI_API_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 403, text: async () => "API key not valid" })));
    const { critique } = await import("../src/ai/critic");
    await expect(critique(record, { baselines: null, status: null, recessMinusRidge: null })).rejects.toThrow(/403/);
  });
});
