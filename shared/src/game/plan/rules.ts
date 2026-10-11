// The Planning Edition rules: pure functions, no I/O, no randomness. The room (server/src/rooms.ts) records what
// people did and calls these to decide; the UI calls the same functions for previews. A model never decides
// anything here: the vote, the verdict and every point come from this file.
//
// Round: everyone picks a card -> the Mayor puts one forward -> support / oppose and one amendment -> a vote
// (3 of 4 approve) -> verdict and 3+2+1 points (mandate 0-3, deal-making 0-2, city feasibility 0-1).
import type { PersonaId } from '../content';
import {
  ROUND_BUDGET, VOTES_TO_APPROVE,
  type Amendment, type Constraint, type Mandate, type AmendmentOffer, type PlanConfig, type PlanOption, type PlanRound, type PlanScenario, type RoundScore,
  type PlanScorePart, type SimProfile, type Stance, type PlanVerdict,
} from './types';

export const STATUS_QUO: PlanConfig = { option: null, amendment: null };

export const optionOf = (sc: PlanScenario, id: string | null | undefined): PlanOption | null => sc.options.find((o) => o.id === id) ?? null;
export const amendmentOf = (sc: PlanScenario, id: string | null | undefined): Amendment | null => sc.amendments.find((a) => a.id === id) ?? null;
export const isStatusQuo = (c: PlanConfig) => c.option === null;

/** Illustrative game units a configuration costs (the status quo costs nothing). */
export function configCost(sc: PlanScenario, c: PlanConfig): number {
  const o = optionOf(sc, c.option);
  if (!o) return 0;
  return o.cost + (amendmentOf(sc, c.amendment)?.cost ?? 0);
}

export function configTags(sc: PlanScenario, c: PlanConfig): string[] {
  const o = optionOf(sc, c.option);
  if (!o) return [];
  return [...o.tags, ...(amendmentOf(sc, c.amendment)?.addTags ?? [])];
}

/** The simulator profile of a configuration: the option's, plus the amendment's changes. */
export function configProfile(sc: PlanScenario, c: PlanConfig): SimProfile {
  const o = optionOf(sc, c.option);
  if (!o) return { raiseFt: 0, drainage: 0, elevate: 0, access: 0 };
  const a = amendmentOf(sc, c.amendment)?.sim ?? {};
  const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
  return {
    raiseFt: Math.max(0, o.sim.raiseFt + (a.raiseFt ?? 0)),
    drainage: clamp01(o.sim.drainage + (a.drainage ?? 0)),
    elevate: clamp01(o.sim.elevate + (a.elevate ?? 0)),
    access: o.sim.access + (a.access ?? 0),
  };
}

/** Every configuration a scenario allows: the status quo, each option, and each option with each amendment that applies. */
export function allConfigs(sc: PlanScenario): PlanConfig[] {
  const out: PlanConfig[] = [STATUS_QUO];
  for (const o of sc.options) {
    out.push({ option: o.id, amendment: null });
    for (const a of sc.amendments) if (a.appliesTo.includes(o.id)) out.push({ option: o.id, amendment: a.id });
  }
  return out;
}

export const configKey = (c: PlanConfig) => (c.option ? (c.amendment ? `${c.option}+${c.amendment}` : c.option) : 'status-quo');

/** The constraint that stops this configuration from going ahead, or null. */
export function unmetConstraint(sc: PlanScenario, c: PlanConfig): Constraint | null {
  if (!c.option) return null;
  const tags = configTags(sc, c);
  return sc.constraints.find((k) => k.option === c.option && !tags.includes(k.requires)) ?? null;
}

/** Feasible: inside the round's budget and meeting the scenario's constraints. */
export const isFeasible = (sc: PlanScenario, c: PlanConfig, budget = ROUND_BUDGET) => !!c.option && configCost(sc, c) <= budget && !unmetConstraint(sc, c);

// ---------- Mandates ----------

export interface MandatePoints {
  points: number;
  parts: PlanScorePart[];
}

/** A stakeholder's mandate for a configuration: option table (0-2) plus the bonus (+1): an inspectable payoff table. */
export function mandatePoints(sc: PlanScenario, persona: PersonaId, c: PlanConfig, budget = ROUND_BUDGET): MandatePoints {
  const m: Mandate = sc.mandates[persona];
  const o = optionOf(sc, c.option);
  if (!o) return { points: 0, parts: [{ points: 0, because: `${sc.statusQuo.name}: nothing was built, so no objective is met.` }] };
  const parts: PlanScorePart[] = [];
  const base = m.base[o.id] ?? 0;
  parts.push({ points: base, because: `${o.name} ${base === 2 ? 'fits' : base === 1 ? 'partly fits' : 'does not fit'} the goal: ${m.objective}` });
  const hit = m.bonus.amendment ? c.amendment === m.bonus.amendment : m.bonus.headroom !== undefined ? budget - configCost(sc, c) >= m.bonus.headroom : false;
  if (hit) parts.push({ points: 1, because: m.bonus.label });
  return { points: Math.min(3, parts.reduce((s, p) => s + p.points, 0)), parts };
}

// ---------- Offers and the vote ----------

/** Why an amendment cannot be offered now, or null. The amended proposal must still fit the budget. */
export function checkOffer(sc: PlanScenario, leadingOption: string, amendment: unknown, seat: number, sponsorSeat: number, offers: AmendmentOffer[], budget = ROUND_BUDGET): string | null {
  const a = amendmentOf(sc, typeof amendment === 'string' ? amendment : null);
  if (!a) return 'That is not an amendment for this situation.';
  if (seat === sponsorSeat) return 'The sponsor accepts amendments; they do not offer them.';
  if (!a.appliesTo.includes(leadingOption)) return `${a.name} does not fit this project.`;
  if (offers.some((x) => x.seat === seat)) return 'You have already made your offer this round.';
  if (offers.some((x) => x.state === 'accepted')) return 'An amendment was already accepted this round.';
  const o = optionOf(sc, leadingOption);
  if (!o) return 'No proposal is on the table.';
  if (o.cost + a.cost > budget) return `${o.name} with ${a.name} costs ${o.cost + a.cost} and the round has ${budget}.`;
  return null;
}

export const votesFor = (votes: Record<number, boolean>) => Object.values(votes).filter(Boolean).length;
export const votePasses = (votes: Record<number, boolean>) => votesFor(votes) >= VOTES_TO_APPROVE;

export interface RoundInput {
  scenario: PlanScenario;
  players: { seat: number; persona: PersonaId }[];
  leading: { option: string; sponsorSeat: number } | null;
  offers: AmendmentOffer[];
  votes: Record<number, boolean>;
  budget?: number;
}

export interface RoundOutcome {
  verdict: PlanVerdict;
  adopted: PlanConfig;
  accepted: { amendment: string; bySeat: number } | null;
  cost: number;
  feasible: boolean;
  blockedBy: string | null;
  scores: RoundScore[];
}

/** Decide the round: the verdict, the plan that stands, and everyone's 3+2+1. */
export function resolvePlanRound(input: RoundInput): RoundOutcome {
  const { scenario: sc, players, leading, offers, votes } = input;
  const budget = input.budget ?? ROUND_BUDGET;
  const acceptedOffer = offers.find((o) => o.state === 'accepted') ?? null;
  const accepted = acceptedOffer ? { amendment: acceptedOffer.amendment, bySeat: acceptedOffer.seat } : null;
  const proposed: PlanConfig = leading ? { option: leading.option, amendment: accepted?.amendment ?? null } : STATUS_QUO;
  const cost = configCost(sc, proposed);

  let verdict: PlanVerdict = 'approved';
  let blockedBy: string | null = null;
  if (!leading || !votePasses(votes)) verdict = 'rejected';
  else if (cost > budget) {
    verdict = 'no-money';
    blockedBy = `It costs ${cost} and the round has ${budget}.`;
  } else {
    const k = unmetConstraint(sc, proposed);
    if (k) {
      verdict = 'delayed';
      blockedBy = k.because;
    }
  }
  const adopted = verdict === 'approved' ? proposed : STATUS_QUO;
  const feasible = verdict === 'approved';

  const scores = players.map<RoundScore>(({ seat, persona }) => {
    const mandate = mandatePoints(sc, persona, adopted, budget);
    const deal: PlanScorePart[] = [];
    if (verdict === 'approved' && accepted) {
      const a = amendmentOf(sc, accepted.amendment)!;
      if (accepted.bySeat === seat) {
        const mine = sc.mandates[persona].concern === a.addresses;
        deal.push({ points: mine ? 2 : 0, because: mine ? `You secured ${a.name}, which answers your concern (${a.addresses}).` : `${a.name} does not answer your own concern (${sc.mandates[persona].concern}), so it earns nothing.` });
      } else if (leading && leading.sponsorSeat === seat) {
        deal.push({ points: 1, because: `You sponsored the deal that added ${a.name} and kept the plan on budget.` });
      }
    }
    if (!deal.length) deal.push({ points: 0, because: verdict !== 'approved' ? 'No plan was adopted, so no deal counted.' : accepted ? 'You were not part of the deal.' : 'No amendment was adopted.' });
    const feas: PlanScorePart[] = [
      feasible
        ? { points: 1, because: `The plan costs ${cost} of ${budget} units and meets the scenario's constraints.` }
        : { points: 0, because: verdict === 'rejected' ? 'The vote did not reach 3 of 4, so nothing was approved.' : blockedBy ?? 'Not feasible.' },
    ];
    const dealPts = Math.min(2, deal.reduce((s, p) => s + p.points, 0));
    const feasPts = feas.reduce((s, p) => s + p.points, 0);
    return {
      seat, persona, mandate: mandate.points, deal: dealPts, feasibility: feasPts, total: mandate.points + dealPts + feasPts,
      parts: { mandate: mandate.parts, deal, feasibility: feas },
    };
  });
  return { verdict, adopted, accepted, cost, feasible, blockedBy, scores };
}

/** What a player would score if this configuration passed: the card preview. */
export function previewScore(sc: PlanScenario, persona: PersonaId, c: PlanConfig, budget = ROUND_BUDGET): { mandate: number; feasible: boolean; cost: number; blockedBy: string | null } {
  const k = unmetConstraint(sc, c);
  const cost = configCost(sc, c);
  return {
    mandate: mandatePoints(sc, persona, c, budget).points,
    feasible: !!c.option && cost <= budget && !k,
    cost,
    blockedBy: !c.option ? null : cost > budget ? `It costs ${cost} and the round has ${budget}.` : k?.because ?? null,
  };
}

// ---------- Bots: they play their own mandate, nothing cleverer ----------

const byBase = (sc: PlanScenario, persona: PersonaId) => (a: PlanOption, b: PlanOption) => (sc.mandates[persona].base[b.id] ?? 0) - (sc.mandates[persona].base[a.id] ?? 0) || a.cost - b.cost || a.id.localeCompare(b.id);

export function botPick(sc: PlanScenario, persona: PersonaId): string {
  return [...sc.options].sort(byBase(sc, persona))[0]!.id;
}

/** The Mayor's choice among the submitted cards: their own mandate first, then how many players picked it, then cost. */
export function botMayorChoice(sc: PlanScenario, picks: Record<number, string>): string | null {
  const ids = [...new Set(Object.values(picks))];
  if (!ids.length) return null;
  const count = (id: string) => Object.values(picks).filter((x) => x === id).length;
  return ids.map((id) => optionOf(sc, id)!).sort((a, b) => (sc.mandates.mayor.base[b.id] ?? 0) - (sc.mandates.mayor.base[a.id] ?? 0) || count(b.id) - count(a.id) || a.cost - b.cost || a.id.localeCompare(b.id))[0]!.id;
}

/** The amendment a bot would ask for: the one in its own mandate, or one that unblocks the project. */
export function botOffer(sc: PlanScenario, persona: PersonaId, leadingOption: string, budget = ROUND_BUDGET): string | null {
  const wanted = sc.mandates[persona].bonus.amendment;
  const unblock = sc.constraints.find((k) => k.option === leadingOption);
  const fixes = unblock ? sc.amendments.find((a) => a.addTags.includes(unblock.requires) && a.appliesTo.includes(leadingOption)) : undefined;
  const candidates = [wanted, fixes?.id].filter((x): x is string => !!x);
  for (const id of candidates) {
    const a = amendmentOf(sc, id);
    const o = optionOf(sc, leadingOption);
    if (a && o && a.appliesTo.includes(leadingOption) && o.cost + a.cost <= budget) return id;
  }
  return null;
}

/** A sponsor bot accepts an amendment that fits the budget and does not lower its own mandate, or that clears a blocker. */
export function botAccepts(sc: PlanScenario, sponsor: PersonaId, leadingOption: string, amendment: string, budget = ROUND_BUDGET): boolean {
  const o = optionOf(sc, leadingOption);
  const a = amendmentOf(sc, amendment);
  if (!o || !a || !a.appliesTo.includes(leadingOption) || o.cost + a.cost > budget) return false;
  const without: PlanConfig = { option: leadingOption, amendment: null };
  const withIt: PlanConfig = { option: leadingOption, amendment };
  if (unmetConstraint(sc, without) && !unmetConstraint(sc, withIt)) return true;
  return mandatePoints(sc, sponsor, withIt, budget).points >= mandatePoints(sc, sponsor, without, budget).points;
}

export const botStance = (sc: PlanScenario, persona: PersonaId, c: PlanConfig): Stance => (mandatePoints(sc, persona, c).points >= 2 ? 'support' : 'oppose');
/** A bot votes yes when the plan gives it anything at all (the table needs 3 of 4, so a plan one side loves and another side hates can still pass). */
export const botVote = (sc: PlanScenario, persona: PersonaId, c: PlanConfig): boolean => mandatePoints(sc, persona, c).points >= 1;

/** For a record: a one-line summary of a round's adopted plan. */
export const describeConfig = (sc: PlanScenario, c: PlanConfig): string => {
  const o = optionOf(sc, c.option);
  if (!o) return sc.statusQuo.name;
  const a = amendmentOf(sc, c.amendment);
  return a ? `${o.name} + ${a.name}` : o.name;
};

export type { PlanRound };
