/** Post-hoc diagnosis of the held-out FAIL (PHASE_A §3.6). Reads frozen params; changes nothing. */
import { readFileSync } from "node:fs";
import type { Profile, SimParams } from "../src/contracts";
import { surfaceHeights } from "../src/geometry/mask";
import { DEFAULT_GRID, SIM_VERSION } from "../src/sim/params";
import { runExperimentSync } from "../src/sim/pipeline";

const prereg = JSON.parse(readFileSync(new URL("./preregistration.json", import.meta.url), "utf8"));
const params: SimParams = prereg.params;
for (const id of ["preset-ridge", "preset-recess"]) {
  const profile: Profile = prereg.profiles[id];
  const s = surfaceHeights(profile, DEFAULT_GRID.nx);
  const rec = runExperimentSync(profile, { grid: DEFAULT_GRID, params, seed: 1, simVersion: SIM_VERSION });
  const xs = rec.results.settledX;
  const onFeature = xs.filter((x) => s[Math.floor(x)] !== profile.baseHeight).length;
  // within 1 mm (4 cells) of a feature edge, on the base level
  const nearFeature = xs.filter((x) => {
    const c = Math.floor(x);
    if (s[c] !== profile.baseHeight) return false;
    for (let d = -4; d <= 4; d++) if (s[(c + d + DEFAULT_GRID.nx) % DEFAULT_GRID.nx] !== profile.baseHeight) return true;
    return false;
  }).length;
  console.log(`${id}: settled ${rec.results.settlementPct.toFixed(1)}% | on/in feature columns ${((onFeature / xs.length) * 100).toFixed(0)}% | on base within 1 mm of a feature ${((nearFeature / xs.length) * 100).toFixed(0)}%`);
}
