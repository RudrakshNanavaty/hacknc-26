// Beginner Mode (rules BEGINNER_RULES_VERSION): the same engine, numbers, map and stories as Advanced,
// cut down to what a first-time player can hold in their head.
//
// - One conflict a round: one project, proposed by one stakeholder, in one highlighted district. A
//   documented civic story is used only when its own place and its own deal fit (a project from the
//   story's hands that the real zoning and FEMA layers allow there); otherwise the round says it is an
//   authored scenario.
// - Two or three cards a player, all aimed at that district, picked so each acts on the conflict; the
//   stakeholder who proposes it plays the project itself. No influence: one card and one table move a round.
// - The table: Support (+1 support), Oppose (+1 opposition), Suggest a Change (a condition the owner may
//   accept, rules C5/O8 in the engine). Funding, upkeep, combos and delayed effects settle on their own.
// - The end: is the city viable, did it survive the storm, and which stakeholder goals were met, from the
//   final city and the outcomes. The weighted game score is still computed (finalResult) and shown apart.
import {
  CARDS, PERSONAS, PERSONA_INFO, PROJECTS, STORM_TEST, SUGGESTED_CHANGES, VIABILITY_FLOOR, handOf,
  type CardId, type Indicator, type Indicators, type NegotiationMove, type PersonaId, type ProjectKind,
} from './content';
import { cardEligibility, districtById } from './districts';
import { crisisFor, type Board, type Compromise, type Outcome, type Resolution } from './engine';
import type { Crisis, CrisisKind } from './scenario';
import { plainParts } from './simple';

export type GameMode = 'beginner' | 'advanced';
export const GAME_MODES: readonly GameMode[] = ['beginner', 'advanced'];
export const isGameMode = (v: unknown): v is GameMode => v === 'beginner' || v === 'advanced';

/** The table moves in Beginner Mode, one per player per round, free. */
export const BEGINNER_MOVES = ['back', 'oppose', 'suggest'] as const satisfies readonly NegotiationMove[];
export type BeginnerMove = (typeof BEGINNER_MOVES)[number];
/** Cards in a beginner hand. */
export const BEGINNER_HAND = { min: 2, max: 3 } as const;

export interface Conflict {
  round: number;
  district: string;
  /** The project card on the table, and who proposes it. */
  card: CardId;
  project: ProjectKind;
  owner: PersonaId;
  /** story: a documented civic story whose place and deal fit; scenario: written live from today's readings; authored: the game's own. */
  source: 'story' | 'scenario' | 'authored';
  /** The crisis the round is played under (the story's, or the authored one when the story does not fit). */
  crisis: Crisis;
}

/** Which projects answer which kind of crisis, best first. */
const ANSWERS: Record<CrisisKind, ProjectKind[]> = {
  flood: ['drainage', 'elevate', 'seawall', 'shoreline', 'housing'],
  storm: ['seawall', 'drainage', 'elevate', 'dune', 'shoreline'],
  erosion: ['dune', 'shoreline', 'seawall'],
  development: ['hotel', 'housing', 'marina'],
  budget: ['drainage', 'housing', 'elevate', 'shoreline', 'dune'],
};

/** The game's own conflicts, one per round, each checked against the real layers (beginner.test.ts). */
export const AUTHORED_CONFLICTS: readonly { district: string; card: CardId }[] = [
  { district: 'west-avenue', card: 'drainage-upgrade' },
  { district: 'collins-mid-beach', card: 'hotel-development' },
  { district: 'north-beach-oceanside', card: 'dune-restoration' },
];

const projectCard = (kind: ProjectKind): CardId => (Object.values(CARDS).find((c) => c.project === kind)!).id;

/** Words a documented story must use for a project to be what it is about (its title, summary and facts). */
const SUBJECT: Record<ProjectKind, RegExp> = {
  drainage: /\b(drain\w*|pumps?|pump station|stormwater|sewer\w*|outfall\w*)\b/i,
  seawall: /\b(sea ?walls?|bulkheads?)\b/i,
  hotel: /\b(hotels?|resorts?|towers?|condo\w*|high-rise\w*)\b/i,
  marina: /\b(marinas?|boat slips?|docks?)\b/i,
  elevate: /\b(elevat\w*|raised? (?:homes?|houses?|buildings?))\b/i,
  housing: /\b(housing|affordab\w*|apartments?|workforce)\b/i,
  shoreline: /\b(living shoreline\w*|mangroves?|oyster\w*|reefs?)\b/i,
  dune: /\b(dunes?|renourish\w*|beach sand|erosion)\b/i,
};
/** Does the documented story itself talk about this kind of project? */
export function storyIsAbout(story: NonNullable<Crisis['story']>, kind: ProjectKind): boolean {
  return SUBJECT[kind].test([story.title, story.summary, ...(story.facts ?? [])].join(' '));
}

/**
 * The round's conflict. Deterministic: the same crisis and table always give the same conflict. Its
 * proposer is always someone at the table (`seated`), or there would be nothing to decide.
 */
export function beginnerConflict(round: number, crisis: Crisis | null, seated: readonly PersonaId[] = PERSONAS): Conflict {
  const c = crisis ?? crisisFor(round);
  // A documented story fits only with its own deal; other crises may use any card of the deck.
  const decks = (p: PersonaId): CardId[] => (c.story ? c.hands?.[p] ?? [] : handOf(p));
  for (const district of c.spotlight) {
    for (const kind of ANSWERS[c.kind]) {
      const card = projectCard(kind);
      const owner = CARDS[card].persona;
      if (!seated.includes(owner) || !decks(owner).includes(card) || !cardEligibility(card, district).ok) continue;
      // A documented story is used only for a project it is actually about.
      if (c.story && !storyIsAbout(c.story, kind)) continue;
      // One place: the crisis (and its bonus, rule K1) is about this district only.
      const conflict: Conflict = { round, district, card, project: kind, owner, source: c.story ? 'story' : c.source === 'gemini' ? 'scenario' : 'authored', crisis: { ...c, spotlight: [district] } };
      if (PERSONAS.every((p) => beginnerHand(p, conflict).length >= BEGINNER_HAND.min || p === owner)) return conflict;
    }
  }
  // The authored conflict for this round, or the next one whose proposer is at the table.
  const n = AUTHORED_CONFLICTS.length;
  const start = Math.min(Math.max(round, 1), n) - 1;
  const a = [0, 1, 2].map((k) => AUTHORED_CONFLICTS[(start + k) % n]!).find((x) => seated.includes(CARDS[x.card].persona))
    ?? fallbackFor(seated);
  const ac = crisisFor(round);
  return {
    round, district: a.district, card: a.card, project: CARDS[a.card].project!, owner: CARDS[a.card].persona, source: 'authored',
    // The authored crisis, centred on the conflict's district (its crisis bonus applies there).
    crisis: { ...ac, spotlight: [a.district] },
  };
}

/** No authored proposer at the table: the first project a seated stakeholder can put somewhere real. */
function fallbackFor(seated: readonly PersonaId[]): { district: string; card: CardId } {
  for (const p of seated) {
    for (const card of handOf(p).filter((id) => CARDS[id].project)) {
      const district = ['west-avenue', 'collins-mid-beach', 'north-beach-oceanside', 'south-pointe'].find((d) => cardEligibility(card, d).ok);
      if (district) return { district, card };
    }
  }
  return AUTHORED_CONFLICTS[0]!;
}

/**
 * A player's cards this round: the owner holds the project; everyone else gets 2-3 cards that act on it
 * (one for it, one against it, one condition on it, else another project the place allows), story cards first.
 */
export function beginnerHand(persona: PersonaId, conflict: Conflict): CardId[] {
  if (persona === conflict.owner) return [conflict.card];
  const story = conflict.source === 'story' ? conflict.crisis.hands?.[persona] ?? [] : [];
  const deck = [...story.filter((id) => CARDS[id].persona === persona), ...handOf(persona).filter((id) => !story.includes(id))];
  const acts = (id: CardId) => (CARDS[id].acts ?? []).includes(conflict.project);
  const forIt = deck.filter((id) => CARDS[id].category === 'support' && acts(id));
  const against = deck.filter((id) => CARDS[id].category === 'opposition' && acts(id));
  const condition = deck.filter((id) => CARDS[id].category === 'negotiation' && acts(id));
  const alt = deck.filter((id) => CARDS[id].project && id !== conflict.card && cardEligibility(id, conflict.district).ok);
  const out: CardId[] = [];
  const add = (id: CardId | undefined) => id && !out.includes(id) && out.length < BEGINNER_HAND.max && out.push(id);
  // One of each way to answer it first (for it, against it, a condition on it), then another project, then the rest.
  add(forIt[0]);
  add(against[0]);
  add(condition[0]);
  add(alt[0]);
  for (const id of [...forIt, ...against, ...condition]) add(id);
  // Still short: cards with their own small effect where nothing fits (every card here is legal).
  for (const id of deck.filter((x) => !CARDS[x].project && CARDS[x].fallback)) if (out.length < BEGINNER_HAND.min) add(id);
  return out;
}

/** Why this card cannot be played this round, or null. The district is always the conflict's. */
export function checkBeginnerPlay(persona: PersonaId, card: unknown, conflict: Conflict): string | null {
  if (typeof card !== 'string' || !Object.hasOwn(CARDS, card)) return 'Pick a card.';
  if (!beginnerHand(persona, conflict).includes(card as CardId)) return `${CARDS[card as CardId].name} is not one of your cards this round.`;
  const where = cardEligibility(card as CardId, conflict.district);
  return where.ok ? null : where.reason;
}

/** Why this table move is not allowed, or null (one move a round is the room's rule). */
export function checkBeginnerMove(board: Board, seat: number, move: unknown, proposalId: unknown): string | null {
  if (!BEGINNER_MOVES.includes(move as BeginnerMove)) return 'Support, oppose, or suggest a change.';
  const p = board.proposals.find((x) => x.id === proposalId);
  if (!p) return 'That project is not on the table.';
  if (move !== 'back' && p.seat === seat) return move === 'oppose' ? 'You cannot oppose your own project.' : 'You cannot put a condition on your own project.';
  if (move === 'suggest' && board.compromises.some((c) => c.kind === 'change' && c.proposalId === p.id && c.offeredBy === seat)) return 'You already suggested a change here.';
  return null;
}

/** The condition a Suggest a Change puts on the table (its owner accepts it, or it counts against). */
export function suggestion(board: Board, proposalId: string, seat: number): Compromise {
  const p = board.proposals.find((x) => x.id === proposalId)!;
  const change = SUGGESTED_CHANGES[p.kind];
  const { good, bad } = plainParts(change.ifBuilt);
  return {
    id: `s${board.round}-${seat}-${p.id}`, kind: 'change', proposalId: p.id, offeredBy: seat, owner: p.seat, accepted: false,
    title: change.title,
    text: `Accept: +1 support; if built ${[...good, ...bad].join(', ')} (illustrative). Not accepted: +1 opposition.`,
  };
}

/**
 * Where each stakeholder stands on each kind of project, authored from their goals (PERSONA_INFO): the
 * Mayor guards the budget, the Activist nature, the Resort Owner business and taxes, the Resident homes,
 * safety and the beach. Bots argue this agenda, so a table is contested and one human card or vote can
 * swing it. It is how bots play, not a rule: people may do anything legal.
 */
export type Agenda = 'for' | 'against' | 'change';
export const AGENDA: Record<ProjectKind, Record<PersonaId, Agenda>> = {
  drainage: { mayor: 'for', activist: 'change', resort: 'against', resident: 'for' },
  seawall: { mayor: 'for', activist: 'against', resort: 'change', resident: 'for' },
  hotel: { mayor: 'change', activist: 'against', resort: 'for', resident: 'change' },
  marina: { mayor: 'change', activist: 'against', resort: 'for', resident: 'change' },
  elevate: { mayor: 'change', activist: 'for', resort: 'against', resident: 'for' },
  housing: { mayor: 'for', activist: 'change', resort: 'against', resident: 'for' },
  shoreline: { mayor: 'change', activist: 'for', resort: 'against', resident: 'for' },
  dune: { mayor: 'for', activist: 'for', resort: 'against', resident: 'change' },
};

/**
 * A bot's card: the project if it owns it; for it, a card that backs it; against it, a card that opposes
 * it; asking for a change, a card that puts a condition on it. Null: nothing in hand fits its agenda (it
 * keeps its card and argues at the table instead).
 */
export function beginnerBotPlay(persona: PersonaId, conflict: Conflict): CardId | null {
  if (persona === conflict.owner) return conflict.card;
  const hand = beginnerHand(persona, conflict);
  const acts = (id: CardId) => (CARDS[id].acts ?? []).includes(conflict.project);
  const a = AGENDA[conflict.project][persona];
  const want = a === 'for' ? 'support' : a === 'against' ? 'opposition' : 'negotiation';
  return hand.find((id) => acts(id) && CARDS[id].category === want) ?? null;
}

/** A bot's table move: back it, oppose it, or suggest a change, by its agenda (the owner backs its own). */
export function beginnerBotMove(persona: PersonaId, seat: number, board: Board, conflict: Conflict): { move: BeginnerMove; proposalId: string } | null {
  const p = board.proposals.find((x) => x.kind === conflict.project && x.district === conflict.district) ?? board.proposals[0];
  if (!p) return null;
  if (p.seat === seat) return { move: 'back', proposalId: p.id };
  const a = AGENDA[p.kind][persona];
  const move: BeginnerMove = a === 'for' ? 'back' : a === 'against' ? 'oppose' : 'suggest';
  return checkBeginnerMove(board, seat, move, p.id) ? null : { move, proposalId: p.id };
}

// ---------- The end of the match ----------

export interface GoalLine {
  persona: PersonaId;
  achieved: boolean;
  /** What they wanted, in a few words. */
  goal: string;
  /** What happened, with the numbers that decided it. */
  line: string;
}
export interface BeginnerEnd {
  viable: boolean;
  /** Indicators that ended under the viability floor. */
  failing: Indicator[];
  storm: { flood: number; held: boolean; loss: number } | null;
  goals: GoalLine[];
}

const builtKinds = (rounds: Resolution[], kinds: ProjectKind[]) => rounds.flatMap((r) => r.outcomes).filter((o) => o.status === 'approved' && kinds.includes(o.kind)).length;

/** City viability, the storm, and each stakeholder's goal, from the final city and the outcomes. */
export function beginnerEnd(start: Indicators, end: Indicators, rounds: Resolution[], personas: PersonaId[]): BeginnerEnd {
  const failing = (['flood', 'economy', 'environment', 'access'] as Indicator[]).filter((k) => end[k] < VIABILITY_FLOOR);
  const s9 = rounds.at(-1)?.events.find((e) => e.rule === 'S9');
  const loss = s9 ? -(s9.delta?.economy ?? 0) : 0;
  const storm = s9 ? { flood: rounds.at(-1)!.after.flood + 0, held: loss <= 0, loss } : null;
  const devs = builtKinds(rounds, ['hotel', 'marina']);
  const homes = builtKinds(rounds, ['elevate', 'housing']);
  const goal = (persona: PersonaId): GoalLine => {
    switch (persona) {
      case 'mayor': return { persona, goal: 'Safe from the storm, money left', achieved: end.flood >= STORM_TEST.threshold && end.budget > 0, line: `Flood safety ${end.flood} (the storm needs ${STORM_TEST.threshold}) · $${end.budget}M left` };
      case 'activist': return { persona, goal: 'More nature than at the start', achieved: end.environment > start.environment, line: `Nature ${start.environment} → ${end.environment}` };
      case 'resort': return { persona, goal: 'More jobs, or a hotel or marina built', achieved: end.economy >= start.economy + 5 || devs > 0, line: `Jobs & business ${start.economy} → ${end.economy} · ${devs} hotel or marina built` };
      case 'resident': return { persona, goal: 'Safer homes, the beach still reachable', achieved: end.flood >= start.flood + 5 && end.access >= start.access, line: `Flood safety ${start.flood} → ${end.flood} · beach access ${start.access} → ${end.access}${homes ? ` · ${homes} home program built` : ''}` };
    }
  };
  return { viable: failing.length === 0, failing, storm, goals: personas.map(goal) };
}

/** The real decision the postgame question asks about: the most contested project of the match. */
export function keyDecision(rounds: { resolution: Resolution }[]): Outcome | null {
  const all = rounds.flatMap((r) => r.resolution.outcomes);
  return [...all].sort((a, b) => b.support + b.opposition - (a.support + a.opposition))[0] ?? null;
}

export const personalQuestion = (o: Pick<Outcome, 'kind' | 'district'>, persona: PersonaId) =>
  `Personally, not as the ${PERSONA_INFO[persona].name}: should Miami Beach build the ${PROJECTS[o.kind].name.toLowerCase()} in ${districtById(o.district).name}?`;
