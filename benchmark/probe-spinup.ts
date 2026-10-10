/** Engineering probe: does the oscillatory flow converge after 1 spin-up period? */
import { preset } from "../src/geometry/presets";
import { profileToMask } from "../src/geometry/mask";
import { computeFlowCycle } from "../src/sim/flow";
import { BASE_PARAMS, DEFAULT_GRID } from "../src/sim/params";

const run = (spinupPeriods: number) => {
  const gen = computeFlowCycle(profileToMask(preset("ridge"), DEFAULT_GRID), DEFAULT_GRID.nx, DEFAULT_GRID.ny, {
    ...BASE_PARAMS, spinupPeriods, cueAttachProb: 0, attachMaxSpeedMmS: 0,
  });
  let r = gen.next();
  while (!r.done) r = gen.next();
  return r.value;
};
const a = run(1), b = run(3);
let num = 0, den = 0, numBL = 0, denBL = 0;
for (let p = 0; p < a.phases; p++) for (let i = 0; i < a.ux[p]!.length; i++) {
  const d = (a.ux[p]![i]! - b.ux[p]![i]!) ** 2 + (a.uy[p]![i]! - b.uy[p]![i]!) ** 2;
  const m = b.ux[p]![i]! ** 2 + b.uy[p]![i]! ** 2;
  num += d; den += m;
  if (Math.floor(i / DEFAULT_GRID.nx) < 30) { numBL += d; denBL += m; }
}
console.log(`relative L2 difference, spin-up 1 vs 3 periods: whole field ${(Math.sqrt(num / den) * 100).toFixed(2)}%, near-bed (y<7.5mm) ${(Math.sqrt(numBL / denBL) * 100).toFixed(2)}%`);
