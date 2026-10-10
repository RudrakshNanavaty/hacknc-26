// The one place a design is evaluated, on the client (for the replay) and on the server (the
// stored, authoritative result). Today: material + the prototype flow metrics, settlement null.
// The validated settlement engine plugs in here and fills settlementRate.
import { type Design, type ExperimentResult, materialOf } from '../design';
import type { Flow } from '../reefs';
import { PROTOTYPE_MODEL, defaultParams, runPrototype } from './prototype';

export function evaluateDesign(design: Design, flow: Flow | null, seed: number): ExperimentResult {
  const prototype = flow ? runPrototype(design, defaultParams(flow, seed)).metrics : null;
  return { material: materialOf(design), settlementRate: null, prototype, model: flow ? PROTOTYPE_MODEL : 'none', seed };
}
