/** Engineering probe: larva stage timing and determinism on the flat preset. Not calibration. */
import { preset } from "../src/geometry/presets";
import { runExperimentSync } from "../src/sim/pipeline";
import { BASE_PARAMS, DEFAULT_GRID, SIM_VERSION } from "../src/sim/params";
import type { FlowCycle } from "../src/sim/flow";

const cache = new Map<string, FlowCycle>();
const cfg = (seed: number) => ({ grid: DEFAULT_GRID, params: { ...BASE_PARAMS, cueAttachProb: 0.2, attachMaxSpeedMmS: 10 }, seed, simVersion: SIM_VERSION });
let t = performance.now();
const a = runExperimentSync(preset("flat"), cfg(1), { flowCache: cache, now: () => "x" });
console.log(`first run (flow + larvae): ${((performance.now() - t) / 1000).toFixed(2)} s, settled ${a.results.settlementPct.toFixed(2)}%`);
t = performance.now();
const b = runExperimentSync(preset("flat"), cfg(1), { flowCache: cache, now: () => "x" });
console.log(`cached-flow run: ${((performance.now() - t) / 1000).toFixed(2)} s; identical record: ${JSON.stringify(a) === JSON.stringify(b)}`);
