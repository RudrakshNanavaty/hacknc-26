/// <reference lib="webworker" />
/**
 * Simulation Web Worker. Drives the same generator pipeline the benchmark uses,
 * in short time slices so `cancel` messages are handled between slices.
 * Frames are for visualization only and are throttled; they never affect results.
 *
 * Scheduling only (never arithmetic): flow cycles are cached in memory and in
 * IndexedDB, and the preset flows are pre-computed while the worker is idle.
 */
import type { Profile, SimConfig, WorkerRequest, WorkerResponse } from "../contracts";
import { PRESETS } from "../geometry/presets";
import { profileToMask } from "../geometry/mask";
import { computeFlowCycle, type FlowCycle } from "./flow";
import { loadFlow, saveFlow } from "./flowStore";
import { flowCacheKey, runExperiment } from "./pipeline";

declare const self: DedicatedWorkerGlobalScope;

const SLICE_MS = 30;
const FRAME_INTERVAL_MS = 60;
const FLOW_CACHE_LIMIT = 12;

const flowCache = new Map<string, FlowCycle>();
let active: string | null = null;
let lastConfig: SimConfig | null = null;

/** Yield to the event loop without setTimeout's 4 ms clamp. */
const channel = new MessageChannel();
const queue: (() => void)[] = [];
channel.port1.onmessage = () => queue.shift()?.();
const yieldThen = (fn: () => void) => {
  queue.push(fn);
  channel.port2.postMessage(0);
};

function post(msg: WorkerResponse) {
  if (msg.type === "progress" && msg.frame) {
    const f = msg.frame;
    self.postMessage(msg, [f.ux.buffer, f.uy.buffer, f.larvae.buffer]);
  } else {
    self.postMessage(msg);
  }
}

function remember(key: string, flow: FlowCycle) {
  flowCache.delete(key);
  flowCache.set(key, flow);
  while (flowCache.size > FLOW_CACHE_LIMIT) flowCache.delete(flowCache.keys().next().value!);
}

async function warmFromDisk(profile: Profile, config: SimConfig) {
  const key = flowCacheKey(profile, config);
  if (flowCache.has(key)) return;
  const stored = await loadFlow(key);
  if (stored) remember(key, stored);
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const req = event.data;
  if (req.type === "cancel") {
    if (active === req.runId) active = null;
    return;
  }

  const { runId, profile, config } = req;
  active = runId;
  lastConfig = config;
  await warmFromDisk(profile, config);
  if (active !== runId) return;

  const key = flowCacheKey(profile, config);
  const hadFlow = flowCache.has(key);
  const gen = runExperiment(profile, config, { frames: true, flowCache });
  let lastFrame = 0;
  const t0 = performance.now();
  let tLarvae = hadFlow ? t0 : 0;

  const slice = () => {
    if (active !== runId) return; // cancelled or superseded
    const start = performance.now();
    try {
      while (performance.now() - start < SLICE_MS) {
        const r = gen.next();
        if (r.done) {
          active = null;
          const t1 = performance.now();
          console.debug(
            `[sim] ${runId}: ${hadFlow ? "flow cached" : `flow ${Math.round(tLarvae - t0)} ms`}, larvae ${Math.round(t1 - tLarvae)} ms`,
          );
          post({ type: "done", runId, record: r.value });
          const flow = flowCache.get(key);
          if (!hadFlow && flow) {
            remember(key, flow);
            saveFlow(key, flow);
          }
          yieldThen(prewarmNext);
          return;
        }
        const now = performance.now();
        const p = r.value;
        if (!tLarvae && p.stage === "larvae") tLarvae = now;
        if (p.frame && now - lastFrame >= FRAME_INTERVAL_MS) {
          lastFrame = now;
          post({ type: "progress", runId, step: p.step, totalSteps: p.totalSteps, frame: p.frame });
        }
      }
    } catch (err) {
      active = null;
      post({ type: "error", runId, message: err instanceof Error ? err.message : String(err) });
      return;
    }
    yieldThen(slice);
  };
  slice();
};

/** While idle, compute the preset flows so switching presets is instant. Any run pre-empts it. */
let prewarming = false;
async function prewarmNext() {
  if (prewarming || active || !lastConfig) return;
  const config = lastConfig;
  for (const p of PRESETS) {
    const key = flowCacheKey(p, config);
    if (flowCache.has(key)) continue;
    const stored = await loadFlow(key);
    if (active) return;
    if (stored) {
      remember(key, stored);
      continue;
    }
    prewarming = true;
    const gen = computeFlowCycle(profileToMask(p, config.grid), config.grid.nx, config.grid.ny, config.params);
    const step = () => {
      if (active) {
        prewarming = false; // pre-empted; resumes after the run
        return;
      }
      const start = performance.now();
      while (performance.now() - start < SLICE_MS) {
        const r = gen.next();
        if (r.done) {
          prewarming = false;
          if (!r.value.diagnostics.diverged) {
            remember(key, r.value);
            saveFlow(key, r.value);
          }
          yieldThen(prewarmNext);
          return;
        }
      }
      yieldThen(step);
    };
    step();
    return;
  }
}
