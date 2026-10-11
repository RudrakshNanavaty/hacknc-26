// Trade-offs you can read at a glance: what a project would change if approved, what the city owes
// next round, and short warnings. Pure and derived from the same rules the engine applies, so the
// previews can never disagree with a resolution (cards.test.ts and economy.test.ts pin that).
import { CARDS, INDICATORS, PROJECTS, type CardId, type Delta, type Indicators } from './content';
import { districtById } from './districts';
import { crisisFor, type CityState, type PendingEffect } from './engine';

export interface ProjectPreview {
  /** Effect on the city if approved as it stands (project + crisis bonus), before conditions or combos. */
  delta: Delta;
  /** Public cost now and upkeep per later round ($M, hypothetical). */
  cost: number;
  upkeep: number;
  /** The crisis spotlight is on this area: rule K1 adds its bonus. */
  spotlight: boolean;
  before: Indicators;
  after: Indicators;
  warnings: string[];
}

const add = (a: Delta, b: Delta): Delta => {
  const out: Delta = { ...a };
  for (const k of INDICATORS) if (b[k]) out[k] = (out[k] ?? 0) + b[k]!;
  return out;
};

function applied(ind: Indicators, d: Delta): Indicators {
  const out = { ...ind };
  for (const k of INDICATORS) {
    if (!d[k]) continue;
    out[k] = k === 'budget' ? Math.max(0, out[k] + d[k]!) : Math.max(0, Math.min(100, out[k] + d[k]!));
  }
  return out;
}

/** What playing this project card here would do if it passed unopposed and unassisted. Null for non-project cards. */
export function projectPreview(card: CardId, district: string, round: number, city: CityState): ProjectPreview | null {
  const kind = CARDS[card].project;
  if (!kind) return null;
  const p = PROJECTS[kind];
  const crisis = crisisFor(round);
  const spotlight = crisis.spotlight.includes(district);
  const delta = spotlight ? add(p.delta, crisis.bonus) : { ...p.delta };
  const before = city.indicators;
  const after = applied(applied(before, delta), { budget: -p.budgetCost });
  const warnings: string[] = [];
  if (p.budgetCost > before.budget) warnings.push(`The budget has $${before.budget}M and this needs $${p.budgetCost}M: someone must cover it, or it stays unfunded.`);
  else if (p.budgetCost > 0 && before.budget - p.budgetCost < 8) warnings.push(`Paying for this leaves $${before.budget - p.budgetCost}M for everything else.`);
  if (p.upkeep) warnings.push(`Upkeep: $${p.upkeep}M every later round.`);
  for (const [k, v] of Object.entries(delta)) {
    const key = k as keyof Indicators;
    if (v! < 0 && key !== 'budget' && after[key] < 30) warnings.push(`${key} would drop to ${after[key]}, under the viability floor of 30.`);
  }
  if (spotlight) warnings.push(`${districtById(district).name} is in this round's spotlight: the crisis bonus applies.`);
  return { delta, cost: p.budgetCost, upkeep: p.upkeep, spotlight, before, after, warnings };
}

export interface Upcoming {
  /** Upkeep the next resolution charges for what is already built. */
  upkeep: number;
  /** Delayed consequences already scheduled. */
  pending: PendingEffect[];
}

/** What the city already owes at the next resolution. */
export function upcomingCosts(city: CityState): Upcoming {
  const upkeep = Object.values(city.districts).flatMap((d) => d.features).reduce((s, f) => s + (f.kind in PROJECTS ? PROJECTS[f.kind as keyof typeof PROJECTS].upkeep : 0), 0);
  return { upkeep, pending: [...(city.pending ?? [])] };
}
