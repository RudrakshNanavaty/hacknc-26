// The Planning Edition's simulator, enumerated once and cached: every city plan (a project, maybe amended, or
// nothing, in each of three areas) under three futures. The game and the Civic Atlas compute the same numbers
// from the same code at run time (they take a few milliseconds); this file is the cache that can be loaded into
// Snowflake or a notebook, and plan-sim.test.ts fails if it goes stale. The run is deterministic: nothing is sampled.
//
//   npx tsx pipeline/plan-sim.ts
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ASSUMPTIONS, FUTURES, MODEL, PLAN_RULES_VERSION, PLAN_SCENARIOS, SIM_DISCLAIMER, cacheRows } from '../shared/src/index';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'shared', 'src', 'data', 'plan-sim.json');

export const buildCache = () => ({
  rulesVersion: PLAN_RULES_VERSION,
  disclaimer: SIM_DISCLAIMER,
  futures: FUTURES,
  model: MODEL,
  assumptions: ASSUMPTIONS,
  scenarios: PLAN_SCENARIOS.map((s) => ({ id: s.id, storyId: s.storyId, district: s.district })),
  /** k: plan key (one configuration per scenario, in play order); c: cost; f: feasible; fl: mean flood exposure per future; ac: access index. */
  columns: { k: 'plan key', c: 'cost units', f: 'feasible', fl: 'flood exposure by future (ordinary, high-tide-rain, extreme)', ac: 'public access index (ordinary)' },
  plans: cacheRows(),
});

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const cache = buildCache();
  writeFileSync(OUT, JSON.stringify(cache) + '\n');
  console.log(`wrote ${cache.plans.length} plans x ${FUTURES.length} futures to ${OUT}`);
}
