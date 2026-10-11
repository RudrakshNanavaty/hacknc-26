// Trade-offs you can read at a glance: what a project would change if approved, what the city owes
// next round, and short warnings. Pure and derived from the same rules the engine applies, so the
// previews can never disagree with a resolution (cards.test.ts and economy.test.ts pin that).
import { CARDS, INDICATORS, PROJECTS, type CardId, type Delta, type Indicators, type PersonaId } from './content';
import { districtById } from './districts';
import { crisisFor, resolveRound, type Board, type CityState, type NegotiationAction, type OutcomeStatus, type PendingEffect } from './engine';
import type { Crisis } from './scenario';

export interface ProjectPreview {
  /** Effect on the city if approved as it stands (project + crisis bonus), before conditions or combos. */
  delta: Delta;
  /** Public cost now and upkeep per later round ($M, hypothetical). */
  cost: number;
  upkeep: number;
  /** The crisis spotlight is on this area: rule K1 adds its bonus. */
  spotlight: boolean;
  /** Whether the budget can pay for it after this round's bill (upkeep, delayed consequences). */
  fundable: boolean;
  before: Indicators;
  after: Indicators;
  warnings: string[];
}

/** What the next resolution charges before any project: upkeep (U1) and consequences due (L1). */
export function billDelta(city: CityState, round: number): Delta {
  const up = upcomingCosts(city);
  const d: Delta = up.upkeep ? { budget: -up.upkeep } : {};
  for (const p of up.pending.filter((x) => x.dueRound <= round)) for (const k of INDICATORS) if (p.delta[k]) d[k] = (d[k] ?? 0) + p.delta[k]!;
  return d;
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

/**
 * What playing this project card here would do if it passed unopposed and unassisted. Null for
 * non-project cards. `crisis` is the round's crisis as the match wrote it (the authored one if absent).
 */
export function projectPreview(card: CardId, district: string, round: number, city: CityState, crisis: Crisis = crisisFor(round)): ProjectPreview | null {
  const kind = CARDS[card].project;
  if (!kind) return null;
  const p = PROJECTS[kind];
  const spotlight = crisis.spotlight.includes(district);
  const delta = spotlight ? add(p.delta, crisis.bonus) : { ...p.delta };
  const before = city.indicators;
  // The engine charges this round's bill first, then pays for projects: so does the preview.
  const bill = billDelta(city, round);
  const base = applied(before, bill);
  const fundable = p.budgetCost <= base.budget;
  const after = fundable ? applied(applied(base, { budget: -p.budgetCost }), delta) : base;
  const warnings: string[] = [];
  const billed = base.budget !== before.budget ? ` after this round's bill` : '';
  if (!fundable) warnings.push(`The budget will have $${base.budget}M${billed} and this needs $${p.budgetCost}M: someone must cover it, or it stays unfunded.`);
  else if (p.budgetCost > 0 && base.budget - p.budgetCost < 8) warnings.push(`Paying for this leaves $${base.budget - p.budgetCost}M${billed} for everything else.`);
  if (p.upkeep) warnings.push(`Upkeep: $${p.upkeep}M every later round.`);
  for (const [k, v] of Object.entries(delta)) {
    const key = k as keyof Indicators;
    if (v! < 0 && key !== 'budget' && after[key] < 30) warnings.push(`${key} would drop to ${after[key]}, under the viability floor of 30.`);
  }
  if (spotlight) warnings.push(`${districtById(district).name} is in this round's spotlight: the crisis bonus applies.`);
  return { delta, cost: p.budgetCost, upkeep: p.upkeep, spotlight, fundable, before, after, warnings };
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

/**
 * What the engine would apply if this proposal passed as the table stands: the real resolution, run
 * with just enough extra backing to tip the vote. A block (R1) cannot be outvoted and stays a block.
 */
export function ifApproved(board: Board, actions: NegotiationAction[], city: CityState, proposalId: string): { status: OutcomeStatus; delta: Delta } | null {
  const now = resolveRound(board, actions, city);
  const o = now.outcomes.find((x) => x.proposalId === proposalId);
  if (!o) return null;
  const withCombos = (r: ReturnType<typeof resolveRound>, d: Delta) => {
    const out: Delta = { ...d };
    for (const c of r.combos.filter((x) => x.proposalIds.includes(proposalId))) for (const k of INDICATORS) if (c.delta[k]) out[k] = (out[k] ?? 0) + c.delta[k]!;
    return out;
  };
  if (o.status === 'approved' || o.status === 'blocked') return { status: o.status, delta: withCombos(now, o.delta) };
  const need = Math.max(1, o.opposition - o.ignored - o.support + 1);
  const phantom: NegotiationAction[] = Array.from({ length: need }, (_, i) => ({ seat: 1000 + i, persona: 'mayor' as PersonaId, move: 'back', proposalId }));
  const r = resolveRound(board, [...actions, ...phantom], city);
  const t = r.outcomes.find((x) => x.proposalId === proposalId)!;
  return { status: t.status, delta: withCombos(r, t.delta) };
}
