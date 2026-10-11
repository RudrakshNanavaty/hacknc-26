// What the room tells the table in the Planning Edition, and what a match record keeps of it.
import type { PersonaId } from '../content';
import { PLAN_RULES_VERSION, type AmendmentOffer, type PersonalPick, type PlanConfig, type PlanRound, type Stance } from './types';

/** The part of the match everyone at the table may see. Cards stay hidden until they are revealed. */
export interface PlanPublic {
  round: number;
  scenarioId: string;
  budget: number;
  /** Every seat's card, from the moment they are revealed (null while players are still choosing). */
  picks: Record<number, string> | null;
  leading: PlanRound['leading'] | null;
  /** Current support / oppose, by seat. */
  stances: Record<number, Stance>;
  offers: AmendmentOffer[];
  accepted: PlanRound['accepted'];
  /** Who has voted (how they voted is secret until the result). */
  voted: number[];
  /** Resolved rounds, oldest first. */
  rounds: PlanRound[];
  final: PlanFinal | null;
  /** At the end only: the table's voluntary personal picks per scenario (option ids or 'none'), without names. Not role-play. */
  personal: Record<string, string[]> | null;
}

export interface PlanTotal {
  seat: number;
  persona: PersonaId;
  mandate: number;
  deal: number;
  feasibility: number;
  total: number;
}

/** The end of the match: the plan the table built (one configuration per round, in order) and the 3+2+1 totals. */
export interface PlanFinal {
  plan: PlanConfig[];
  totals: PlanTotal[];
  winners: PersonaId[];
}

/** Your own hidden answers, sent only to you. */
export interface PlanMine {
  pick: string | null;
  stance: Stance | null;
  vote: boolean | null;
  /** Your voluntary personal pick for this round, before the deal and after the result. */
  before: string | null;
  after: { option: string | null; reason: string | null; moved: boolean | null } | null;
}

/** What a plan match adds to the saved record. */
export interface PlanRecord {
  version: typeof PLAN_RULES_VERSION;
  scenarios: string[];
  rounds: PlanRound[];
  /** Voluntary answers outside the role. Never scored, never merged with in-role play. */
  personal: PersonalPick[];
  final: PlanFinal | null;
  /** The adopted plan's modelled results under the three futures (the cacheable simulator output). */
  simulated?: { key: string; cost: number; feasible: boolean; flood: number[]; access: number; worstFlood: number; stormHeld: boolean } | null;
}
