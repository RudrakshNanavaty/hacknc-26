// Planning Edition (rules planning-1.0.0): the shapes shared by the scenarios, the rules and the simulator.
// A "plan" is one configuration per scenario: a project option, plus at most one amendment, or the status quo.
// Everything here is authored game design; costs are ILLUSTRATIVE game units, never real budgets.
import type { PersonaId } from '../content';
import type { StorySource, StoryVerification } from '../story';

export const PLAN_RULES_VERSION = 'coastal-clash-rules/planning-1.0.0';
export const PLAN_ROUNDS = 3;
/** Illustrative budget units available to each round's project. */
export const ROUND_BUDGET = 10;
/** Votes needed to approve (of four). */
export const VOTES_TO_APPROVE = 3;

export type PersonalReason = 'safety' | 'cost' | 'environment' | 'access';
export const PERSONAL_REASONS: readonly PersonalReason[] = ['safety', 'cost', 'environment', 'access'];
export const REASON_LABEL: Record<PersonalReason, string> = { safety: 'Safety', cost: 'Cost', environment: 'Environment', access: 'Community access' };

/** How a project behaves in the simulator (see sim-assumptions.ts for what each number means and where it comes from). */
export interface SimProfile {
  /** Feet the street or wall is raised. */
  raiseFt: number;
  /** 0..1 share of rain runoff the drainage handles. */
  drainage: number;
  /** 0..1 relief for buildings that are themselves raised. */
  elevate: number;
  /** Points of public access / community impact (can be negative). */
  access: number;
}

export interface PlanOption {
  id: string;
  name: string;
  /** One sentence: what it does. */
  does: string;
  /** Illustrative game units. */
  cost: number;
  benefit: string;
  tradeoff: string;
  /** Plain-language tags the constraints and the mandates read. */
  tags: string[];
  sim: SimProfile;
}

export interface Amendment {
  id: string;
  name: string;
  text: string;
  /** Extra game units (negative: it saves money and costs something else). */
  cost: number;
  /** The documented concern it answers (one of the story's concerns). */
  addresses: string;
  /** What it gives up. */
  tradeoff: string;
  appliesTo: string[];
  addTags: string[];
  /** Added to the option's simulator profile. */
  sim: Partial<SimProfile>;
}

/** What a stakeholder wants from this situation, as an inspectable table (0..2 for the option, +1 for a bonus: max 3). */
export interface Mandate {
  objective: string;
  /** The documented concern this stakeholder carries (a deal that answers it earns deal-making points). */
  concern: string;
  /** Where the objective comes from: the story's own concerns, or marked as an inference for the role. */
  grounding: string;
  inferred: boolean;
  base: Record<string, 0 | 1 | 2>;
  /** +1 when this amendment is part of the plan, or when the plan leaves this much budget unspent. */
  bonus: { amendment?: string; headroom?: number; label: string };
}

export interface Constraint {
  /** Which option it concerns, and what must be in the plan for it to be allowed to proceed. */
  option: string;
  requires: string;
  /** Why: grounded in the story. */
  because: string;
}

export interface PlanScenario {
  id: string;
  storyId: string;
  district: string;
  title: string;
  /** Two sentences: what happened and why it matters. Every number comes from `facts`. */
  situation: string;
  question: string;
  /** The facts the situation may use, as shown to a planner. */
  facts: string[];
  concerns: string[];
  /** Other verified stories about the same place that ground a mandate. */
  linkedStories: string[];
  sources: StorySource[];
  verification: StoryVerification;
  options: [PlanOption, PlanOption, PlanOption];
  amendments: Amendment[];
  mandates: Record<PersonaId, Mandate>;
  constraints: Constraint[];
  /** What happens if nothing is approved. */
  statusQuo: { name: string; text: string };
}

/** One area's decision: a project, maybe amended, or the status quo (option null). */
export interface PlanConfig {
  option: string | null;
  amendment: string | null;
}

export type PlanVerdict = 'approved' | 'rejected' | 'delayed' | 'no-money';

export interface PlanScorePart {
  points: number;
  because: string;
}
export interface RoundScore {
  seat: number;
  persona: PersonaId;
  mandate: number;
  deal: number;
  feasibility: number;
  total: number;
  parts: { mandate: PlanScorePart[]; deal: PlanScorePart[]; feasibility: PlanScorePart[] };
}

export type Stance = 'support' | 'oppose';
export interface AmendmentOffer {
  seat: number;
  amendment: string;
  /** Why it was not offered or accepted, when it was not. */
  state: 'open' | 'accepted' | 'declined';
}

/** What the table did in one round: everything the record keeps. */
export interface PlanRound {
  round: number;
  scenarioId: string;
  district: string;
  budget: number;
  /** Each seat's private card. */
  picks: Record<number, string>;
  /** The proposal the Mayor put forward and who sponsors it. */
  leading: { option: string; sponsorSeat: number; chosenBySeat: number } | null;
  /** Support / oppose before and after the amendment (so a concession that moved someone shows). */
  stancesBefore: Record<number, Stance>;
  stancesAfter: Record<number, Stance>;
  offers: AmendmentOffer[];
  accepted: { amendment: string; bySeat: number } | null;
  votes: Record<number, boolean>;
  verdict: PlanVerdict;
  /** What was adopted this round (status quo when nothing passed). */
  adopted: PlanConfig;
  cost: number;
  feasible: boolean;
  /** Why a vote that passed still did not proceed (delayed), or null. */
  blockedBy: string | null;
  scores: RoundScore[];
}

/** A voluntary answer outside the role. Never scored, never mixed with in-role play. */
export interface PersonalPick {
  seat: number;
  persona: PersonaId;
  participant: 'human' | 'bot';
  round: number;
  scenarioId: string;
  district: string;
  /** Before hearing the deal (null if they skipped it) and after the result. */
  before: string | null;
  after: string | null;
  reason: PersonalReason | null;
  /** The accepted amendment moved their pick. */
  movedByAmendment: boolean | null;
  comment: string | null;
  at: string;
}
