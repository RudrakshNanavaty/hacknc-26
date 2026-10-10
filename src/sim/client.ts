/**
 * UI-side handle on the simulation worker. Sends WorkerRequests, receives
 * WorkerResponses. Frames go to subscribers (the canvas) without touching React state.
 */
import type { ExperimentRecord, Profile, SimConfig, SimFrame, WorkerResponse } from "../contracts";
import { createMockSimWorker, type SimWorkerLike } from "./mockWorker";

export interface RunHandlers {
  onProgress(step: number, totalSteps: number, stage: SimFrame["stage"] | undefined): void;
  onDone(record: ExperimentRecord): void;
  onError(message: string): void;
}

type FrameListener = (frame: SimFrame) => void;

const useMock = import.meta.env.VITE_USE_MOCK_SIM === "true";

function createWorker(): SimWorkerLike {
  if (useMock) return createMockSimWorker();
  return new Worker(new URL("./worker.ts", import.meta.url), { type: "module" }) as unknown as SimWorkerLike;
}

let worker: SimWorkerLike | null = null;
let currentRun: string | null = null;
let handlers: RunHandlers | null = null;
let counter = 0;
const frameListeners = new Set<FrameListener>();
let lastFrame: SimFrame | null = null;

function ensureWorker(): SimWorkerLike {
  if (worker) return worker;
  worker = createWorker();
  worker.onmessage = ({ data }: { data: WorkerResponse }) => {
    if (data.runId !== currentRun || !handlers) return; // stale run
    if (data.type === "progress") {
      if (data.frame) {
        lastFrame = data.frame;
        frameListeners.forEach((l) => l(data.frame!));
      }
      handlers.onProgress(data.step, data.totalSteps, data.frame?.stage);
    } else if (data.type === "done") {
      currentRun = null;
      handlers.onDone(data.record);
    } else {
      currentRun = null;
      handlers.onError(data.message);
    }
  };
  return worker;
}

/** Start a run, cancelling any run in flight. */
export function startRun(profile: Profile, config: SimConfig, h: RunHandlers): string {
  const w = ensureWorker();
  if (currentRun) w.postMessage({ type: "cancel", runId: currentRun });
  const runId = `run-${++counter}`;
  currentRun = runId;
  handlers = h;
  w.postMessage({ type: "run", runId, profile, config });
  return runId;
}

export function subscribeFrames(l: FrameListener): () => void {
  frameListeners.add(l);
  if (lastFrame) l(lastFrame);
  return () => frameListeners.delete(l);
}

export const isMockSim = useMock;
