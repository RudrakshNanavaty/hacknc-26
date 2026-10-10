/// <reference lib="webworker" />
/**
 * Simulation Web Worker. Drives the same generator pipeline the benchmark uses,
 * in short time slices so `cancel` messages are handled between slices.
 * Frames are for visualization only and are throttled; they never affect results.
 */
import type { WorkerRequest, WorkerResponse } from "../contracts";
import type { FlowCycle } from "./flow";
import { runExperiment } from "./pipeline";

declare const self: DedicatedWorkerGlobalScope;

const SLICE_MS = 30;
const FRAME_INTERVAL_MS = 60;
const FLOW_CACHE_LIMIT = 12;

const flowCache = new Map<string, FlowCycle>();
let active: string | null = null;

function post(msg: WorkerResponse) {
  if (msg.type === "progress" && msg.frame) {
    const f = msg.frame;
    self.postMessage(msg, [f.ux.buffer, f.uy.buffer, f.larvae.buffer]);
  } else {
    self.postMessage(msg);
  }
}

function trimCache() {
  while (flowCache.size > FLOW_CACHE_LIMIT) flowCache.delete(flowCache.keys().next().value!);
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const req = event.data;
  if (req.type === "cancel") {
    if (active === req.runId) active = null;
    return;
  }

  const { runId, profile, config } = req;
  active = runId;
  const gen = runExperiment(profile, config, { frames: true, flowCache });
  let lastFrame = 0;

  const slice = () => {
    if (active !== runId) return; // cancelled or superseded
    const start = performance.now();
    try {
      while (performance.now() - start < SLICE_MS) {
        const r = gen.next();
        if (r.done) {
          trimCache();
          active = null;
          post({ type: "done", runId, record: r.value });
          return;
        }
        const now = performance.now();
        const p = r.value;
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
    setTimeout(slice, 0);
  };
  slice();
};
