/**
 * Gemini design critic. It explains a finished ExperimentRecord; it never computes,
 * changes or ranks a score. Output is structured JSON so the UI can lay it out, and
 * every number in the reply is checked against the facts we sent (grounding check).
 *
 * The API key is read from VITE_GEMINI_API_KEY at build time, so it is visible to
 * anyone who can open the page: use it only on a local demo machine (D-016).
 */
import type { ExperimentRecord } from "../contracts";
import { recordFacts } from "../experiment/summary";

export interface Critique {
  why: string;
  flowFeatures: string;
  limits: string;
  tryNext: string;
}

export interface CriticResult {
  critique: Critique;
  /** Numbers in the critique that do not appear anywhere in the facts sent. */
  ungroundedNumbers: string[];
  model: string;
}

export interface BenchmarkContext {
  baselines: { flat: number; ridge: number; recess: number } | null;
  status: "PASS" | "FAIL" | null;
  recessMinusRidge: { mean: number; lo: number; hi: number } | null;
}

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
export const CRITIC_MODEL = import.meta.env.VITE_GEMINI_MODEL || "gemini-3.8-flash";
export const criticAvailable = Boolean(API_KEY);

const SYSTEM = `You are the design critic inside ReefForge, a 2D toy simulator of coral larval settlement.
You EXPLAIN a finished simulation record. You never compute or change scores.
Rules:
- Ground every statement in the JSON facts provided. Only use numbers that appear in the facts. If you are unsure, say so.
- "settlementPct" is SIMULATED settlement in a toy model. Never claim real-world settlement, survival, growth or restoration value.
- Explain mechanisms in terms of the oscillating flow, recirculation near features, larval swimming, and where larvae settled (settlementZones).
- "limits": name the assumptions that most limit this conclusion.
- "tryNext": 1-2 concrete edits using only the builder's shapes (ridge, recess, step, flatten), as hypotheses to test, not promises.
- Each field: at most 2 short sentences. Plain language for a hackathon judge.`;

const SCHEMA = {
  type: "OBJECT",
  properties: {
    why: { type: "STRING" },
    flowFeatures: { type: "STRING" },
    limits: { type: "STRING" },
    tryNext: { type: "STRING" },
  },
  required: ["why", "flowFeatures", "limits", "tryNext"],
};

/** Numbers (with decimals) that appear in `text` but nowhere in `facts`. */
export function findUngroundedNumbers(text: string, facts: unknown): string[] {
  const factNumbers = new Set<number>();
  JSON.stringify(facts).replace(/-?\d+(\.\d+)?/g, (m) => {
    factNumbers.add(Number(m));
    return m;
  });
  const out: string[] = [];
  for (const m of text.match(/-?\d+(\.\d+)?/g) ?? []) {
    const n = Number(m);
    if (Math.abs(n) <= 4) continue; // small counts ("2 ridges", "1 mm") are ordinary language
    let ok = false;
    for (const f of factNumbers) {
      if (Math.abs(f - n) <= Math.max(0.051, Math.abs(f) * 0.01)) {
        ok = true;
        break;
      }
    }
    if (!ok && !out.includes(m)) out.push(m);
  }
  return out;
}

const cache = new Map<string, CriticResult>();

export async function critique(record: ExperimentRecord, bench: BenchmarkContext, signal?: AbortSignal): Promise<CriticResult> {
  if (!API_KEY) throw new Error("No Gemini key configured (VITE_GEMINI_API_KEY)");
  const facts = { record: recordFacts(record), baselinesSettlementPct: bench.baselines, heldOutBenchmark: bench };
  const cacheKey = JSON.stringify(facts);
  const hit = cache.get(cacheKey);
  if (hit) return hit;

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${CRITIC_MODEL}:generateContent`, {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json", "x-goog-api-key": API_KEY },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents: [{ role: "user", parts: [{ text: `Facts (JSON):\n${JSON.stringify(facts)}\n\nExplain this result.` }] }],
      generationConfig: { responseMimeType: "application/json", responseSchema: SCHEMA, temperature: 0.3, maxOutputTokens: 800 },
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Gemini request failed (${res.status})${body ? `: ${body.slice(0, 160)}` : ""}`);
  }
  const data = await res.json();
  const text: string | undefined = data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("");
  if (!text) throw new Error("Gemini returned no text");
  let parsed: Critique;
  try {
    parsed = JSON.parse(text) as Critique;
  } catch {
    throw new Error("Gemini reply was not valid JSON");
  }
  const result: CriticResult = {
    critique: parsed,
    ungroundedNumbers: findUngroundedNumbers(Object.values(parsed).join(" "), facts),
    model: CRITIC_MODEL,
  };
  cache.set(cacheKey, result);
  return result;
}
