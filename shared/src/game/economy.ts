// Trade-offs you can read at a glance: what a project would change if approved, what the city owes
// next round, and short warnings. Pure and derived from the same rules the engine applies, so the
// previews can never disagree with a resolution (cards.test.ts and economy.test.ts pin that).
import { CARDS, INDICATORS, PROJECTS, type CardId, type Delta, type Indicators, type PersonaId } from './content';
import { districtById } from './districts';
import { crisisFor, resolveRound, treasuryOf, type AgreementResult, type Board, type CityState, type Funding, type NegotiationAction, type OutcomeStatus, type PendingEffect } from './engine';
import { Books, chargeUpkeep, cloneTreasury, debtOutstanding, inMillions, millions, settleObligations, usd, walletOf, WALLET_INFO, type Cents, type LedgerEntry, type Obligation, type WalletId } from './money';
import type { Crisis } from './scenario';

export interface ProjectPreview {
  /** Effect on the city if approved as it stands (project + crisis bonus), before conditions or combos. */
  delta: Delta;
  /** Public cost now and upkeep per later round ($M, hypothetical). */
  cost: number;
  /** Private cost paid by the proposer's own capital ($M, hypothetical). */
  privateCost: number;
  upkeep: number;
  /** The wallet that pays if nobody else does. */
  payer: WalletId;
  /** The crisis spotlight is on this area: rule K1 adds its bonus. */
  spotlight: boolean;
  /** Whether the payer can pay after this round's bill (upkeep, installments, delayed consequences). */
  fundable: boolean;
  before: Indicators;
  after: Indicators;
  warnings: string[];
}

/** What the next resolution charges before any project, run on a copy of the books exactly as the engine will. */
export function billFor(city: CityState, round: number): { indicators: Indicators; entries: LedgerEntry[]; balances: Record<WalletId, Cents> } {
  const indicators = { ...city.indicators };
  const t = cloneTreasury(treasuryOf(city));
  const books = new Books(t, round, indicators);
  for (const p of (city.pending ?? []).filter((x) => x.dueRound <= round)) {
    for (const k of INDICATORS) if (p.delta[k] && k !== 'budget') indicators[k] = Math.max(0, Math.min(100, indicators[k] + p.delta[k]!));
    if (p.delta.budget && p.delta.budget < 0) books.charge('builders', millions(-p.delta.budget), { rule: 'L1', kind: 'repair', text: p.text });
  }
  settleObligations(books, round);
  const built = Object.values(city.districts).flatMap((d) => d.features).filter((f) => f.kind in PROJECTS).map((f) => ({ kind: f.kind as keyof typeof PROJECTS, proposalId: f.proposalId }));
  chargeUpkeep(books, built);
  return { indicators, entries: books.entries, balances: t.balances };
}

/** The bill as a change to the meters (budget included), for the HUD. */
export function billDelta(city: CityState, round: number): Delta {
  const after = billFor(city, round).indicators;
  const d: Delta = {};
  for (const k of INDICATORS) if (after[k] !== city.indicators[k]) d[k] = after[k] - city.indicators[k];
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
  const bill = billFor(city, round);
  const base = bill.indicators;
  const payer: WalletId = p.privateCost > 0 ? walletOf(CARDS[card].persona) : 'city';
  const cost = p.privateCost > 0 ? p.privateCost : p.budgetCost;
  const has = inMillions(bill.balances[payer]);
  const fundable = cost <= has;
  const after = fundable ? applied(applied(base, payer === 'city' ? { budget: -cost } : {}), delta) : base;
  const warnings: string[] = [];
  const billed = base.budget !== before.budget && payer === 'city' ? ` after this round's bill` : '';
  if (!fundable) {
    warnings.push(payer === 'city'
      ? `The budget will have $${has}M${billed} and this needs $${cost}M: a grant, a bond, a partner or a player must pay, or it stays unfunded.`
      : `${WALLET_INFO[payer].name} has $${has}M and this needs $${cost}M of its own capital: it would stay unfunded.`);
  } else if (payer === 'city' && cost > 0 && has - cost < 4) warnings.push(`Paying for this leaves $${has - cost}M${billed} for everything else.`);
  else if (payer !== 'city') warnings.push(`Paid from ${WALLET_INFO[payer].name}: $${cost}M of private capital, no public money.`);
  if (p.upkeep) warnings.push(`Upkeep: $${p.upkeep}M every later round.`);
  for (const [k, v] of Object.entries(delta)) {
    const key = k as keyof Indicators;
    if (v! < 0 && key !== 'budget' && after[key] < 30) warnings.push(`${key} would drop to ${after[key]}, under the viability floor of 30.`);
  }
  if (spotlight) warnings.push(`${districtById(district).name} is in this round's spotlight: the crisis bonus applies.`);
  return { delta, cost: p.budgetCost, privateCost: p.privateCost, upkeep: p.upkeep, payer, spotlight, fundable, before, after, warnings };
}

export interface Upcoming {
  /** Upkeep the next resolution charges for what is already built (before reserves). */
  upkeep: number;
  /** Delayed consequences already scheduled. */
  pending: PendingEffect[];
  /** Scheduled payments (bond installments, partnership availability payments). */
  obligations: Obligation[];
  /** Still owed to the lender ($M). */
  debt: number;
}

/** What the city already owes at the next resolution. */
export function upcomingCosts(city: CityState): Upcoming {
  const upkeep = Object.values(city.districts).flatMap((d) => d.features).reduce((s, f) => s + (f.kind in PROJECTS ? PROJECTS[f.kind as keyof typeof PROJECTS].upkeep : 0), 0);
  const t = treasuryOf(city);
  return { upkeep, pending: [...(city.pending ?? [])], obligations: [...t.obligations], debt: inMillions(debtOutstanding(t)) };
}

/** "Can the city afford this?" in words, from the books (the Director may only reword it). */
export function affordability(city: CityState, round: number, kind: keyof typeof PROJECTS, persona: PersonaId): { answer: string; facts: string[] } {
  const p = PROJECTS[kind];
  const bill = billFor(city, round);
  const facts: string[] = [];
  if (p.privateCost > 0) {
    const w = walletOf(persona);
    const has = inMillions(bill.balances[w]);
    facts.push(`${p.name} costs $${p.privateCost}M of private capital`, `${WALLET_INFO[w].name} holds $${has}M`);
    return { answer: has >= p.privateCost ? `Yes: ${WALLET_INFO[w].name} can pay the $${p.privateCost}M itself; no public money is used.` : `No: ${WALLET_INFO[w].name} holds $${has}M and the ${p.name.toLowerCase()} needs $${p.privateCost}M.`, facts };
  }
  const budget = bill.indicators.budget;
  facts.push(`${p.name} costs $${p.budgetCost}M of public money`, `the budget will hold $${budget}M after this round's bill`);
  if (p.upkeep) facts.push(`upkeep is $${p.upkeep}M every later round`);
  if (budget >= p.budgetCost) return { answer: `Yes: the budget can pay the $${p.budgetCost}M, leaving $${budget - p.budgetCost}M.${p.upkeep ? ` Upkeep adds $${p.upkeep}M every later round.` : ''}`, facts };
  return { answer: `Not from the budget: it will hold $${budget}M and this needs $${p.budgetCost}M. An emergency grant, a resilience bond, a partnership or a player's own funds would have to pay.`, facts };
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


export interface AgreementPreview {
  /** The proposal's verdict with this agreement refused, and with it accepted (the table otherwise as it stands). */
  without: OutcomeStatus;
  withIt: OutcomeStatus;
  /** Who would pay the project with it accepted, and the money that would move under it (simulated). */
  funding: Funding;
  entries: LedgerEntry[];
  /** What it would become: executed, void (payer short), not needed (paid already), not built. */
  result: AgreementResult['status'] | null;
  /** Its effect on the meters if built with it. */
  delta: Delta;
}

/** Accept or refuse? The real resolution run both ways: the impact preview on the agreement card. */
export function agreementPreview(board: Board, actions: NegotiationAction[], city: CityState, compromiseId: string): AgreementPreview | null {
  const c = board.compromises.find((x) => x.id === compromiseId);
  if (!c?.terms) return null;
  const run = (accepted: boolean) => resolveRound({ ...board, compromises: board.compromises.map((x) => (x.id === c.id ? { ...x, accepted } : x)) }, actions, city);
  const no = run(false);
  const yes = run(true);
  const o = yes.outcomes.find((x) => x.proposalId === c.proposalId);
  return {
    without: no.outcomes.find((x) => x.proposalId === c.proposalId)?.status ?? 'rejected',
    withIt: o?.status ?? 'rejected',
    funding: o?.funding ?? null,
    entries: yes.ledger.filter((e) => e.agreementId === c.id || (e.proposalId === c.proposalId && c.terms!.covers && e.rule === c.terms!.rule)),
    result: yes.agreements.find((a) => a.compromiseId === c.id)?.status ?? null,
    delta: o?.delta ?? {},
  };
}
