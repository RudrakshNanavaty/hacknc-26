/**
 * Mock simulation worker for UI work without the solver (VITE_USE_MOCK_SIM=true).
 * Emits fake `progress` frames, then a `done` record built from
 * fixtures/sample-record.json. Nothing here is a simulation result.
 */
import sampleRecord from "../../fixtures/sample-record.json";
import type { ExperimentRecord, SimFrame, WorkerRequest, WorkerResponse } from "../contracts";

/** The subset of the Worker interface the UI uses, so the mock and the real worker are swappable. */
export interface SimWorkerLike {
  postMessage(request: WorkerRequest): void;
  onmessage: ((event: { data: WorkerResponse }) => void) | null;
  terminate(): void;
}

export const MOCK_TICKS = 10;
export const MOCK_TICK_MS = 50;
const FRAME_NX = 34;
const FRAME_NY = 16;
const MOCK_LARVAE = 200;

function mockFrame(tick: number, inflow: number, nx: number, ny: number): SimFrame {
  const cells = FRAME_NX * FRAME_NY;
  const ux = new Float32Array(cells).fill(inflow * Math.sin(tick / 3));
  const uy = new Float32Array(cells);
  const larvae = new Float32Array(MOCK_LARVAE * 3);
  for (let i = 0; i < MOCK_LARVAE; i++) {
    // Deterministic drift pattern: evenly spaced rows moving sideways.
    larvae[i * 3] = (i * 7 + tick * 4) % nx;
    larvae[i * 3 + 1] = ny - 1 - ((i * 13) % 20);
    larvae[i * 3 + 2] = 0;
  }
  return { stage: "larvae", fnx: FRAME_NX, fny: FRAME_NY, ux, uy, larvae };
}

export function createMockSimWorker(): SimWorkerLike {
  const timers = new Map<string, ReturnType<typeof setTimeout>>();

  const worker: SimWorkerLike = {
    onmessage: null,
    postMessage(request) {
      const emit = (data: WorkerResponse) => worker.onmessage?.({ data });

      if (request.type === "cancel") {
        clearTimeout(timers.get(request.runId));
        timers.delete(request.runId);
        return;
      }

      const { runId, profile, config } = request;
      let tick = 0;
      const step = () => {
        tick++;
        if (tick <= MOCK_TICKS) {
          emit({
            type: "progress",
            runId,
            step: tick,
            totalSteps: MOCK_TICKS,
            frame: mockFrame(tick, config.params.peakVelocity, config.grid.nx, config.grid.ny),
          });
          timers.set(runId, setTimeout(step, MOCK_TICK_MS));
          return;
        }
        timers.delete(runId);
        const record: ExperimentRecord = {
          ...(sampleRecord as ExperimentRecord),
          createdAt: new Date().toISOString(),
          profile,
          config,
          assumptions: ["MOCK WORKER — not a real simulation result", ...sampleRecord.assumptions],
        };
        emit({ type: "done", runId, record });
      };
      timers.set(runId, setTimeout(step, MOCK_TICK_MS));
    },
    terminate() {
      timers.forEach((t) => clearTimeout(t));
      timers.clear();
    },
  };
  return worker;
}
