/** Engineering probe: solver stability, mass drift and timing per preset. Not a benchmark. */
import { preset, type PresetKey } from "../src/geometry/presets";
import { profileToMask } from "../src/geometry/mask";
import { computeFlowCycle } from "../src/sim/flow";
import { BASE_PARAMS, DEFAULT_GRID } from "../src/sim/params";
import { physicalMapping } from "../src/sim/units";
import type { SimParams } from "../src/contracts";

const params: SimParams = { ...BASE_PARAMS, cueAttachProb: 0, attachMaxSpeedMmS: 0 };
console.log("physical mapping", physicalMapping(DEFAULT_GRID, params));
for (const key of ["flat", "ridge", "recess"] as PresetKey[]) {
  const t0 = performance.now();
  const gen = computeFlowCycle(profileToMask(preset(key), DEFAULT_GRID), DEFAULT_GRID.nx, DEFAULT_GRID.ny, params);
  let r = gen.next();
  while (!r.done) r = gen.next();
  const ms = performance.now() - t0;
  const fluid = profileToMask(preset(key), DEFAULT_GRID).filter((v) => v === 0).length;
  const steps = (params.spinupPeriods + 1) * params.periodSteps;
  const d = r.value.diagnostics;
  // free-stream speed at the lid at peak phase (1/4 period) in cm/s
  const q = r.value.ux[12]!;
  const top = q[(DEFAULT_GRID.ny - 1) * DEFAULT_GRID.nx + 5]!;
  console.log(
    `${key.padEnd(7)} ${(ms / 1000).toFixed(2)} s  ${((steps * fluid) / ms / 1000).toFixed(1)} MLUPS  ` +
      `maxU=${d.maxVelocity.toFixed(4)} drift=${d.massDriftPct.toExponential(2)}%  diverged=${d.diverged}  ` +
      `lid u(T/4)=${top.toFixed(4)} (${((top * 4.5) / 0.1).toFixed(2)} cm/s)`,
  );
}
