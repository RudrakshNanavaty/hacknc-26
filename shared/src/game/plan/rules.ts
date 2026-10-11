// The Planning Edition rules: pure functions, no I/O, no randomness. The room (server/src/rooms.ts) records what
// people did and calls these to decide; the UI calls the same functions for previews. A model never decides
// anything here: the vote, the verdict and every point come from this file.
//
// Round: everyone picks a card -> the Mayor puts one forward -> support / oppose and one amendment -> a vote
// (3 of 4 approve) -> verdict and 3+2+1 points (mandate 0-3, deal-making 0-2, city feasibility 0-1).
import type { PersonaId } from '../content';
import {
  ROUND_BUDGET, VOTES_TO_APPROVE,
  type Amendment, type Check, type Constraint, type Mandate, type AmendmentOffer, type PlanConfig, type PlanOption, type PlanRound, type PlanScenario, type RoundScore,
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

/** What happened, as far as a mandate is concerned: the plan that stands, which project was put forward, and how it ended. */
export interface MandateOutcome {
  /** The configuration that stands (the status quo when nothing went ahead). */
  stands: PlanConfig;
  /** The project that was put forward, if any (null: nothing was put forward). */
  proposed: string | null;
  verdict: PlanVerdict;
}

/** The outcome of a plan that is approved as it stands. */
export const approvedOutcome = (c: PlanConfig): MandateOutcome => ({ stands: c, proposed: c.option, verdict: c.option ? 'approved' : 'rejected' });
/** The outcome of putting `option` forward and having it fail (rejected, delayed or not funded): the status quo stands. */
export const blockedOutcome = (option: string | null): MandateOutcome => ({ stands: STATUS_QUO, proposed: option, verdict: 'rejected' });

/** Evaluate a check against what happened. */
export function checkHolds(sc: PlanScenario, check: Check, o: MandateOutcome): boolean {
  const tags = configTags(sc, o.stands);
  const prof = configProfile(sc, o.stands);
  if ('has' in check) return check.has.some((t) => tags.includes(t));
  if ('is' in check) return !!o.stands.option && check.is.includes(o.stands.option);
  if ('prof' in check) return !!o.stands.option && prof[check.prof[0]] >= check.prof[1];
  if ('cost' in check) return configCost(sc, o.stands) <= check.cost;
  if ('stopped' in check) return o.verdict !== 'approved' && !!o.proposed && check.stopped.includes(o.proposed);
  if ('amend' in check) return o.stands.amendment === check.amend;
  if ('built' in check) return !!o.stands.option;
  if ('not' in check) return !checkHolds(sc, check.not, o);
  if ('all' in check) return check.all.every((c) => checkHolds(sc, c, o));
  return check.any.some((c) => checkHolds(sc, c, o));
}

/** The amendment a stakeholder's objectives ask for, if one of them names an amendment. */
export function wantedAmendment(sc: PlanScenario, persona: PersonaId): string | null {
  const find = (c: Check): string | null => {
    if ('amend' in c) return c.amend;
    for (const x of 'all' in c ? c.all : 'any' in c ? c.any : []) {
      const f = find(x);
      if (f) return f;
    }
    return null;
  };
  for (const ob of sc.mandates[persona].objectives) {
    const f = find(ob.check);
    if (f) return f;
  }
  return null;
}

/**
 * A stakeholder's mandate for an outcome, 0 to 3: the objectives they met, unless their critical objective failed (then 0).
 * Every line says what was met or missed, so a player can see exactly why.
 */
export function outcomePoints(sc: PlanScenario, persona: PersonaId, o: MandateOutcome): MandatePoints {
  const m: Mandate = sc.mandates[persona];
  const parts: PlanScorePart[] = [];
  if (m.critical && !checkHolds(sc, m.critical.check, o)) {
    parts.push({ points: 0, because: `✘ Critical: ${m.critical.label}. Without it this goal scores 0.` });
    for (const ob of m.objectives) parts.push({ points: 0, because: `✘ ${ob.label}` });
    return { points: 0, parts };
  }
  if (m.critical) parts.push({ points: 0, because: `✔ Critical: ${m.critical.label}` });
  let total = 0;
  for (const ob of m.objectives) {
    const met = checkHolds(sc, ob.check, o);
    if (met) total += ob.points;
    parts.push({ points: met ? ob.points : 0, because: `${met ? '✔' : '✘'} ${ob.label}` });
  }
  return { points: Math.min(3, total), parts };
}

/** A stakeholder's mandate if this configuration is approved and goes ahead (a preview, and what bots weigh). */
export function mandatePoints(sc: PlanScenario, persona: PersonaId, c: PlanConfig): MandatePoints {
  return outcomePoints(sc, persona, approvedOutcome(c));
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
    const mandate = outcomePoints(sc, persona, { stands: adopted, proposed: leading?.option ?? null, verdict });
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
    mandate: mandatePoints(sc, persona, c).points,
    feasible: !!c.option && cost <= budget && !k,
    cost,
    blockedBy: !c.option ? null : cost > budget ? `It costs ${cost} and the round has ${budget}.` : k?.because ?? null,
  };
}

// ---------- Bots: they play their own objectives, nothing cleverer ----------

/** Every configuration of a project (plain, and with each amendment that fits) that could actually go ahead. */
function goable(sc: PlanScenario, option: string, budget: number): PlanConfig[] {
  return allConfigs(sc).filter((c) => c.option === option && isFeasible(sc, c, budget));
}

/** The best a stakeholder could do with this project: the highest mandate over the ways it could go ahead. */
export function botValue(sc: PlanScenario, persona: PersonaId, option: string, budget = ROUND_BUDGET): number {
  return Math.max(0, ...goable(sc, option, budget).map((c) => mandatePoints(sc, persona, c).points));
}

const byValue = (sc: PlanScenario, persona: PersonaId) => (a: PlanOption, b: PlanOption) => botValue(sc, persona, b.id) - botValue(sc, persona, a.id) || a.cost - b.cost || a.id.localeCompare(b.id);

export function botPick(sc: PlanScenario, persona: PersonaId): string {
  return [...sc.options].sort(byValue(sc, persona))[0]!.id;
}

/** The Mayor's choice among the submitted cards: what serves the Mayor's objectives best, then how many players picked it, then cost. */
export function botMayorChoice(sc: PlanScenario, picks: Record<number, string>): string | null {
  const ids = [...new Set(Object.values(picks))];
  if (!ids.length) return null;
  const count = (id: string) => Object.values(picks).filter((x) => x === id).length;
  return ids.map((id) => optionOf(sc, id)!).sort((a, b) => botValue(sc, 'mayor', b.id) - botValue(sc, 'mayor', a.id) || count(b.id) - count(a.id) || a.cost - b.cost || a.id.localeCompare(b.id))[0]!.id;
}

/** The amendment a bot would ask for: the one that lifts its own mandate most (it must lift it), else one that clears a blocker. */
export function botOffer(sc: PlanScenario, persona: PersonaId, leadingOption: string, budget = ROUND_BUDGET): string | null {
  const o = optionOf(sc, leadingOption);
  if (!o) return null;
  const base: PlanConfig = { option: leadingOption, amendment: null };
  const baseline = mandatePoints(sc, persona, base).points;
  const fits = sc.amendments.filter((a) => a.appliesTo.includes(leadingOption) && o.cost + a.cost <= budget);
  const wanted = wantedAmendment(sc, persona);
  const ranked = fits
    .map((a) => ({ a, gain: mandatePoints(sc, persona, { option: leadingOption, amendment: a.id }).points - baseline, wanted: a.id === wanted }))
    .filter((x) => x.gain > 0)
    .sort((x, y) => y.gain - x.gain || Number(y.wanted) - Number(x.wanted) || x.a.id.localeCompare(y.a.id));
  if (ranked[0]) return ranked[0].a.id;
  return fits.find((a) => !!unmetConstraint(sc, base) && !unmetConstraint(sc, { option: leadingOption, amendment: a.id }))?.id ?? null;
}

/** A sponsor bot accepts an amendment that fits the budget and does not lower its own mandate, or that clears a blocker. */
export function botAccepts(sc: PlanScenario, sponsor: PersonaId, leadingOption: string, amendment: string, budget = ROUND_BUDGET): boolean {
  const o = optionOf(sc, leadingOption);
  const a = amendmentOf(sc, amendment);
  if (!o || !a || !a.appliesTo.includes(leadingOption) || o.cost + a.cost > budget) return false;
  const without: PlanConfig = { option: leadingOption, amendment: null };
  const withIt: PlanConfig = { option: leadingOption, amendment };
  if (unmetConstraint(sc, without) && !unmetConstraint(sc, withIt)) return true;
  return mandatePoints(sc, sponsor, withIt).points >= mandatePoints(sc, sponsor, without).points;
}

/** What this stakeholder would score if the plan on the table were put forward and then stopped (the status quo stands). */
export const pointsIfStopped = (sc: PlanScenario, persona: PersonaId, option: string | null): number => outcomePoints(sc, persona, blockedOutcome(option)).points;

/** The honest comparison a voter makes: what the plan really gives them (nothing, if a constraint would delay it) against what stopping it gives. */
function voteEdge(sc: PlanScenario, persona: PersonaId, c: PlanConfig): { goes: number; stops: number } {
  const stops = pointsIfStopped(sc, persona, c.option);
  const goes = unmetConstraint(sc, c) || !c.option ? stops : mandatePoints(sc, persona, c).points;
  return { goes, stops };
}

export const botStance = (sc: PlanScenario, persona: PersonaId, c: PlanConfig): Stance => {
  const { goes, stops } = voteEdge(sc, persona, c);
  return goes > stops || (goes === stops && goes >= 2) ? 'support' : 'oppose';
};

/** A bot votes yes when going ahead serves it better than stopping would, or equally well and well enough. */
export const botVote = (sc: PlanScenario, persona: PersonaId, c: PlanConfig): boolean => botStance(sc, persona, c) === 'support';

/** For a record: a one-line summary of a round's adopted plan. */
export const describeConfig = (sc: PlanScenario, c: PlanConfig): string => {
  const o = optionOf(sc, c.option);
  if (!o) return sc.statusQuo.name;
  const a = amendmentOf(sc, c.amendment);
  return a ? `${o.name} + ${a.name}` : o.name;
};

export type { PlanRound };
