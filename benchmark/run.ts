/**
 * Headless benchmark runner (docs/PHASE_A.md §3).
 *
 *   npm run benchmark -- calibrate   flat vs ridge grid → benchmark/calibration.json
 *   npm run benchmark -- freeze      write benchmark/preregistration.json (commit it next!)
 *   npm run benchmark -- heldout     30-seed recess test → benchmark/results.json
 *   npm run benchmark:regress        same seed still gives the same output
 *
 * The held-out mode refuses to run unless preregistration.json is committed and unmodified.
 */
import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { ExperimentRecord, Profile, SimConfig, SimParams } from "../src/contracts";
import { pairedDiffCI, meanCI, type MeanCI } from "../src/experiment/stats";
import { preset, PRESETS } from "../src/geometry/presets";
import type { FlowCycle } from "../src/sim/flow";
import { BASE_PARAMS, DEFAULT_GRID, SIM_VERSION } from "../src/sim/params";
import { runExperimentSync } from "../src/sim/pipeline";

const dir = fileURLToPath(new URL(".", import.meta.url));
const PATHS = {
  calibration: `${dir}calibration.json`,
  prereg: `${dir}preregistration.json`,
  results: `${dir}results.json`,
  regression: `${dir}regression.json`,
};

const CAL_SEEDS = Array.from({ length: 10 }, (_, i) => 1001 + i);
const BENCH_SEEDS = Array.from({ length: 30 }, (_, i) => i + 1);
const GRID_ATTACH_PROB = [0.05, 0.1, 0.2, 0.4];
const GRID_ATTACH_SPEED = [2, 5, 10, 20];
const TARGET_RATIO = 1.87; // Levenstein 2022 particle model: 14.2% / 7.6%

const flowCache = new Map<string, FlowCycle>();
const fixedTime = () => "benchmark";

function config(params: SimParams, seed: number): SimConfig {
  return { grid: DEFAULT_GRID, params, seed, simVersion: SIM_VERSION };
}

function runSeeds(profile: Profile, params: SimParams, seeds: number[]): ExperimentRecord[] {
  return seeds.map((seed) => {
    const r = runExperimentSync(profile, config(params, seed), { flowCache, now: fixedTime });
    if (r.diagnostics.diverged) throw new Error(`solver diverged on ${profile.id} seed ${seed}`);
    return r;
  });
}

const pct = (rs: ExperimentRecord[]) => rs.map((r) => r.results.settlementPct);
const round = (x: number, d = 4) => Math.round(x * 10 ** d) / 10 ** d;
const roundCI = (c: MeanCI) => ({ n: c.n, mean: round(c.mean), sd: round(c.sd), lo: round(c.lo), hi: round(c.hi) });

function calibrate() {
  const rows = [];
  for (const cueAttachProb of GRID_ATTACH_PROB) {
    for (const attachMaxSpeedMmS of GRID_ATTACH_SPEED) {
      const params: SimParams = { ...BASE_PARAMS, cueAttachProb, attachMaxSpeedMmS };
      const flat = pct(runSeeds(preset("flat"), params, CAL_SEEDS));
      const ridge = pct(runSeeds(preset("ridge"), params, CAL_SEEDS));
      const f = meanCI(flat);
      const r = meanCI(ridge);
      const diff = pairedDiffCI(ridge, flat);
      const ratio = f.mean > 0 ? r.mean / f.mean : Infinity;
      const eligible = diff.lo > 0 && f.mean >= 1 && f.mean <= 50;
      const row = { cueAttachProb, attachMaxSpeedMmS, flat: roundCI(f), ridge: roundCI(r), ridgeMinusFlat: roundCI(diff), ratio: round(ratio), eligible };
      rows.push(row);
      console.log(`p=${cueAttachProb} vmax=${attachMaxSpeedMmS}mm/s  flat ${f.mean.toFixed(2)}%  ridge ${r.mean.toFixed(2)}%  ratio ${ratio.toFixed(2)}  ${eligible ? "eligible" : "-"}`);
    }
  }
  const chosen = rows
    .filter((r) => r.eligible)
    .sort((a, b) => {
      const da = Math.abs(Math.log(a.ratio / TARGET_RATIO));
      const db = Math.abs(Math.log(b.ratio / TARGET_RATIO));
      return da - db || a.cueAttachProb - b.cueAttachProb;
    })[0];
  const out = {
    rule: "eligible: ridge>flat with paired 95% CI excluding 0 and flat in [1,50]%; choose ratio closest (log) to 1.87; ties → lower cueAttachProb",
    seeds: CAL_SEEDS,
    simVersion: SIM_VERSION,
    baseParams: BASE_PARAMS,
    grid: rows,
    chosen: chosen ? { cueAttachProb: chosen.cueAttachProb, attachMaxSpeedMmS: chosen.attachMaxSpeedMmS } : null,
  };
  writeFileSync(PATHS.calibration, JSON.stringify(out, null, 2) + "\n");
  console.log(chosen ? `chosen: ${JSON.stringify(out.chosen)}` : "H6 GATE FAILED: no eligible parameters");
}

function freeze() {
  if (existsSync(PATHS.prereg)) throw new Error("preregistration.json already exists and is frozen; refusing to overwrite");
  const cal = JSON.parse(readFileSync(PATHS.calibration, "utf8"));
  if (!cal.chosen) throw new Error("calibration has no chosen parameters");
  const params: SimParams = { ...BASE_PARAMS, ...cal.chosen };
  const prereg = {
    frozenAt: new Date().toISOString(),
    simVersion: SIM_VERSION,
    codeCommit: execSync("git rev-parse HEAD").toString().trim(),
    grid: DEFAULT_GRID,
    params,
    seeds: BENCH_SEEDS,
    profiles: Object.fromEntries(PRESETS.map((p) => [p.id, p])),
    metric: "settlementPct = settled / released × 100 (ridge and recess have equal exposed length)",
    prediction: "mean settlementPct(recess) > mean settlementPct(ridge)",
    passRule: "paired per-seed difference (recess − ridge) has a 95% t-interval (df = 29) entirely above 0",
    alsoReported: "effect size in percentage points, ratio, and whether the difference exceeds 1 percentage point",
  };
  writeFileSync(PATHS.prereg, JSON.stringify(prereg, null, 2) + "\n");
  console.log("wrote benchmark/preregistration.json — commit it before running `heldout`");
}

function loadCommittedPrereg() {
  if (!existsSync(PATHS.prereg)) throw new Error("no preregistration.json; run calibrate + freeze first");
  try {
    execSync("git ls-files --error-unmatch benchmark/preregistration.json", { stdio: "ignore" });
  } catch {
    throw new Error("preregistration.json is not committed; commit it before the held-out run");
  }
  if (execSync("git status --porcelain benchmark/preregistration.json").toString().trim()) {
    throw new Error("preregistration.json has uncommitted changes; the frozen file must not be edited");
  }
  return JSON.parse(readFileSync(PATHS.prereg, "utf8"));
}

function heldout() {
  const prereg = loadCommittedPrereg();
  const params: SimParams = prereg.params;
  const seeds: number[] = prereg.seeds;
  const profiles = prereg.profiles as Record<string, Profile>;
  const runs: Record<string, ExperimentRecord[]> = {};
  for (const id of ["preset-flat", "preset-ridge", "preset-recess"]) {
    const t0 = performance.now();
    runs[id] = runSeeds(profiles[id]!, params, seeds);
    console.log(`${id}: ${meanCI(pct(runs[id]!)).mean.toFixed(2)}%  (${((performance.now() - t0) / 1000).toFixed(0)} s)`);
  }
  const flat = pct(runs["preset-flat"]!);
  const ridge = pct(runs["preset-ridge"]!);
  const recess = pct(runs["preset-recess"]!);
  const diff = pairedDiffCI(recess, ridge);
  const pass = diff.lo > 0;
  const results = {
    ranAt: new Date().toISOString(),
    simVersion: SIM_VERSION,
    preregistrationCommit: execSync("git log -n 1 --format=%H -- benchmark/preregistration.json").toString().trim(),
    seeds,
    settlementPct: {
      flat: roundCI(meanCI(flat)),
      ridge: roundCI(meanCI(ridge)),
      recess: roundCI(meanCI(recess)),
    },
    perSeed: { flat: flat.map((x) => round(x)), ridge: ridge.map((x) => round(x)), recess: recess.map((x) => round(x)) },
    recessMinusRidge: roundCI(diff),
    ratioRecessToRidge: round(meanCI(recess).mean / meanCI(ridge).mean),
    exceedsOnePoint: diff.mean > 1,
    calibrationCheck: { ridgeMinusFlat: roundCI(pairedDiffCI(ridge, flat)) },
    diagnostics: Object.fromEntries(Object.entries(runs).map(([k, rs]) => [k, rs[0]!.diagnostics])),
    status: pass ? "PASS" : "FAIL",
  };
  writeFileSync(PATHS.results, JSON.stringify(results, null, 2) + "\n");
  console.log(`recess − ridge = ${diff.mean.toFixed(2)} pp, 95% CI [${diff.lo.toFixed(2)}, ${diff.hi.toFixed(2)}] → ${results.status}`);
}

function regress() {
  const prereg = existsSync(PATHS.prereg) ? JSON.parse(readFileSync(PATHS.prereg, "utf8")) : null;
  const params: SimParams = prereg ? prereg.params : { ...BASE_PARAMS, cueAttachProb: 0.2, attachMaxSpeedMmS: 10 };
  const rec = runExperimentSync(preset("ridge"), config(params, 7), { now: fixedTime });
  const snapshot = { params, seed: 7, settled: rec.results.settled, settledX: rec.results.settledX, diagnostics: rec.diagnostics };
  if (!existsSync(PATHS.regression)) {
    writeFileSync(PATHS.regression, JSON.stringify(snapshot, null, 2) + "\n");
    console.log(`regression snapshot written (settled ${rec.results.settled})`);
    return;
  }
  const expected = readFileSync(PATHS.regression, "utf8");
  if (expected !== JSON.stringify(snapshot, null, 2) + "\n") {
    console.error("REGRESSION: same seed and parameters produced a different result");
    process.exit(1);
  }
  console.log(`regression OK (settled ${rec.results.settled})`);
}

const mode = process.argv.includes("--regress") ? "regress" : (process.argv[2] ?? "help");
const modes: Record<string, () => void> = { calibrate, freeze, heldout, regress };
if (!modes[mode]) {
  console.log("usage: npm run benchmark -- <calibrate|freeze|heldout>   |   npm run benchmark:regress");
} else {
  modes[mode]!();
}
