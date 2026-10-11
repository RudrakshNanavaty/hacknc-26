// The deterministic rules engine. Pure functions, no I/O, no randomness: the server runs it, the
// tests pin it, and every effect it applies is written to an event log with the rule that caused it.
//
// A round:  plays (one card each, hidden)  ->  buildBoard (reveal: proposals, who acts on what,
//           compromises on the table)  ->  negotiation (back / oppose / fund, accept compromises)
//           ->  resolveRound (support vs opposition, geography, funding, effects)  ->  next round.
import {
  CARDS, COMBOS, INDICATORS, INFLUENCE_PER_ROUND, MAX_INFLUENCE, NEGOTIATION_COST, PERSONAS, PERSONA_INFO, PROJECTS,
  START_INDICATORS, STORM_TEST, TOTAL_ROUNDS, VIABILITY_FLOOR, handFor, handOf,
  type CardId, type ComboId, type Delta, type Indicator, type Indicators, type NegotiationMove, type PersonaId, type ProjectKind,
} from './content';
import { DISTRICTS, DISTRICT_IDS, cardEligibility, coastalHighHazard, districtById, startResilience } from './districts';
import { authoredScenario, type Crisis } from './scenario';

export interface Play {
  seat: number;
  persona: PersonaId;
  card: CardId;
  district: string;
}

export interface Proposal {
  id: string;
  /** The round it was first proposed in. */
  round: number;
  seat: number;
  persona: PersonaId;
  kind: ProjectKind;
  district: string;
  /** Delayed from an earlier round. */
  carried: boolean;
}

/** A support, opposition or negotiation card and the proposal it acts on (null: nothing to act on). */
export interface Attachment {
  seat: number;
  persona: PersonaId;
  card: CardId;
  district: string;
  proposalId: string | null;
}

export type CompromiseKind = 'access' | 'setback' | 'green';
export interface Compromise {
  id: string;
  kind: CompromiseKind;
  proposalId: string;
  /** Who offered it (the card's player) and who must accept (the proposal's owner). */
  offeredBy: number;
  owner: number;
  accepted: boolean;
  title: string;
  text: string;
}

export interface Board {
  round: number;
  crisis: Crisis;
  proposals: Proposal[];
  attachments: Attachment[];
  compromises: Compromise[];
}

export interface NegotiationAction {
  seat: number;
  persona: PersonaId;
  move: NegotiationMove;
  proposalId: string;
}

export type OutcomeStatus = 'approved' | 'blocked' | 'rejected' | 'delayed' | 'unfunded';

export interface Outcome {
  proposalId: string;
  kind: ProjectKind;
  district: string;
  seat: number;
  persona: PersonaId;
  status: OutcomeStatus;
  support: number;
  opposition: number;
  /** Opposition ignored by Fast-Track. */
  ignored: number;
  /** How the public cost was paid. */
  funding: 'budget' | 'covered' | 'free' | null;
  /** Effect on the city (approved only). */
  delta: Delta;
  conditions: string[];
  /** The rule events that decided it, in order. */
  rules: string[];
}

export interface RuleEvent {
  id: string;
  rule: string;
  text: string;
  seat?: number;
  proposalId?: string;
  district?: string;
  delta?: Delta;
}

export type MapFeatureKind = ProjectKind | 'access-corridor' | 'dune-setback' | 'eco-label';
export interface MapFeature {
  kind: MapFeatureKind;
  round: number;
  proposalId: string;
  label: string;
}

export interface DistrictState {
  resilience: number;
  features: MapFeature[];
}

/** A consequence due in a later round (delayed card effects, rule L1). */
export interface PendingEffect {
  id: string;
  dueRound: number;
  delta: Delta;
  text: string;
  card: CardId;
  seat: number;
}

export interface CityState {
  indicators: Indicators;
  districts: Record<string, DistrictState>;
  /** Delayed consequences still to come. */
  pending: PendingEffect[];
}

/** An authored combo that completed this round. */
export interface ComboHit {
  combo: ComboId;
  district: string;
  proposalIds: string[];
  delta: Delta;
  event: string;
}

export interface Resolution {
  round: number;
  before: Indicators;
  after: Indicators;
  outcomes: Outcome[];
  events: RuleEvent[];
  /** Influence handed back per seat (fizzled cards). */
  refunds: Record<number, number>;
  /** Proposals delayed into the next round. */
  carried: Proposal[];
  /** Authored combos completed this round. */
  combos: ComboHit[];
  city: CityState;
}

export class RuleError extends Error {}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const personaOrder = (p: PersonaId) => PERSONAS.indexOf(p);
const districtOrder = (id: string) => DISTRICT_IDS.indexOf(id);

export function startCity(): CityState {
  return {
    indicators: { ...START_INDICATORS },
    districts: Object.fromEntries(DISTRICTS.map((d) => [d.id, { resilience: startResilience(d), features: [] }])),
    pending: [],
  };
}

const AUTHORED = authoredScenario(null).crises;
/** The authored crisis for a round (a match normally brings its own scenario). */
export const crisisFor = (round: number): Crisis => AUTHORED[clamp(round, 1, AUTHORED.length) - 1]!;

/** Influence at the start of a round (round 1: the starting amount was already given). */
export const nextInfluence = (current: number) => Math.min(MAX_INFLUENCE, current + INFLUENCE_PER_ROUND);

/** The cards a persona holds this round: the story's deal, else the authored HANDS. */
export const dealtHand = (persona: PersonaId, round: number, crisis?: Crisis | null): CardId[] => crisis?.hands?.[persona] ?? handFor(persona, round);

/** Why this play is not allowed, or null. `round` (and the round's crisis) decide which hand is dealt. */
export function checkPlay(persona: PersonaId, influence: number, card: unknown, district: unknown, round: number, crisis?: Crisis | null): string | null {
  if (typeof card !== 'string' || !Object.hasOwn(CARDS, card)) return 'Pick a card.';
  const c = CARDS[card as CardId];
  if (c.persona !== persona) return `${c.name} is not in your hand.`;
  if (!dealtHand(persona, round, crisis).includes(c.id)) return `${c.name} is not in your hand this round (each crisis deals 4 of your 6 cards).`;
  if (c.cost > influence) return `${c.name} costs ${c.cost} influence; you have ${influence}.`;
  const where = cardEligibility(card as CardId, String(district ?? ''));
  if (!where.ok) return `${c.name} cannot go there: ${where.reason}`;
  return null;
}

/** Sort key: district order on the map, then persona order, carried proposals first. */
const proposalOrder = (a: Proposal, b: Proposal) =>
  districtOrder(a.district) - districtOrder(b.district) || Number(b.carried) - Number(a.carried) || personaOrder(a.persona) - personaOrder(b.persona);

/** The reveal: turn the round's plays (and proposals carried over) into the board everyone negotiates on. */
export function buildBoard(round: number, plays: Play[], carried: Proposal[] = [], crisis: Crisis = crisisFor(round)): Board {
  const sorted = [...plays].sort((a, b) => personaOrder(a.persona) - personaOrder(b.persona));
  const proposals: Proposal[] = [
    ...carried.map((p) => ({ ...p, carried: true })),
    ...sorted.flatMap((p) => {
      const kind = CARDS[p.card].project;
      return kind ? [{ id: `r${round}-${p.persona}-${kind}`, round, seat: p.seat, persona: p.persona, kind, district: p.district, carried: false }] : [];
    }),
  ].sort(proposalOrder);

  const attachments: Attachment[] = sorted
    .filter((p) => CARDS[p.card].category !== 'project')
    .map((p) => {
      const card = CARDS[p.card];
      const acts = card.acts ?? [];
      // Opposition and conditions only act on other players' proposals.
      const others = card.category === 'opposition' || card.category === 'negotiation';
      const candidates = proposals
        .filter((x) => x.district === p.district && acts.includes(x.kind) && (!others || x.seat !== p.seat))
        .sort((a, b) => acts.indexOf(a.kind) - acts.indexOf(b.kind) || Number(b.carried) - Number(a.carried) || personaOrder(a.persona) - personaOrder(b.persona));
      return { seat: p.seat, persona: p.persona, card: p.card, district: p.district, proposalId: candidates[0]?.id ?? null };
    });

  const compromises: Compromise[] = [];
  for (const a of attachments) {
    const target = proposals.find((x) => x.id === a.proposalId);
    if (!target) continue;
    if (a.card === 'public-access-guarantee') {
      compromises.push({
        id: `c${round}-access-${target.id}`, kind: 'access', proposalId: target.id, offeredBy: a.seat, owner: target.seat, accepted: false,
        title: 'Public beach access corridor',
        text: `Keep a public path to the beach through the ${PROJECTS[target.kind].name.toLowerCase()} site. Accept: +1 support, +4 access${target.kind === 'hotel' ? ', 2 less economy from the hotel' : ''}. Refuse: +1 opposition.`,
      });
    }
    const offer = CARDS[a.card].offer;
    if (offer) {
      compromises.push({
        id: `c${round}-${offer.kind}-${target.id}`, kind: offer.kind, proposalId: target.id, offeredBy: a.seat, owner: target.seat, accepted: false,
        title: offer.title, text: offer.text,
      });
    }
    if (a.card === 'environmental-challenge' && target.kind === 'hotel' && coastalHighHazard(districtById(target.district))) {
      compromises.push({
        id: `c${round}-setback-${target.id}`, kind: 'setback', proposalId: target.id, offeredBy: a.seat, owner: target.seat, accepted: false,
        title: 'Dune setback and elevated design',
        text: 'Build behind the dune line, elevated above base flood. Accept: the legal challenge is withdrawn, the hotel gives 3 less economy and 3 more environment. Refuse: the challenge blocks the hotel (rule R1).',
      });
    }
  }
  return { round, crisis, proposals, attachments, compromises };
}

/** Why this negotiation move is not allowed, or null. */
export function checkMove(board: Board, seat: number, influence: number, move: unknown, proposalId: unknown): string | null {
  if (move !== 'back' && move !== 'oppose' && move !== 'fund') return 'Pick back, oppose or fund.';
  const p = board.proposals.find((x) => x.id === proposalId);
  if (!p) return 'That proposal is not on the table.';
  const cost = NEGOTIATION_COST[move];
  if (cost > influence) return `That costs ${cost} influence; you have ${influence}.`;
  if (move === 'oppose' && p.seat === seat) return 'You cannot oppose your own proposal.';
  if (move === 'fund' && PROJECTS[p.kind].budgetCost === 0) return 'That proposal is privately funded already.';
  return null;
}

export function checkAccept(board: Board, seat: number, compromiseId: unknown): string | null {
  const c = board.compromises.find((x) => x.id === compromiseId);
  if (!c) return 'That compromise is not on the table.';
  if (c.owner !== seat) return 'Only the proposal\'s owner can accept that.';
  return null;
}

function addDelta(into: Delta, d: Delta) {
  for (const k of INDICATORS) if (d[k]) into[k] = (into[k] ?? 0) + d[k]!;
}

function applyDelta(ind: Indicators, d: Delta): Indicators {
  const out = { ...ind };
  for (const k of INDICATORS) {
    if (!d[k]) continue;
    out[k] = k === 'budget' ? Math.max(0, out[k] + d[k]!) : clamp(out[k] + d[k]!, 0, 100);
  }
  return out;
}

const deltaText = (d: Delta) =>
  INDICATORS.filter((k) => d[k]).map((k) => `${d[k]! > 0 ? '+' : '−'}${k === 'budget' ? '$' : ''}${Math.abs(d[k]!)}${k === 'budget' ? 'M' : ''} ${k}`).join(', ');

/** Resolve the round. Same inputs, same result, every time. */
export function resolveRound(board: Board, actions: NegotiationAction[], city: CityState): Resolution {
  const events: RuleEvent[] = [];
  const log = (e: Omit<RuleEvent, 'id'>) => {
    const ev = { id: `r${board.round}-e${events.length + 1}`, ...e };
    events.push(ev);
    return ev.id;
  };
  const before = { ...city.indicators };
  let indicators = { ...city.indicators };
  const districts: Record<string, DistrictState> = Object.fromEntries(
    Object.entries(city.districts).map(([id, s]) => [id, { resilience: s.resilience, features: [...s.features] }]),
  );
  let pending: PendingEffect[] = [...(city.pending ?? [])];
  const settle = (due: (p: PendingEffect) => boolean, when: string) => {
    for (const pe of pending.filter(due).sort((a, b) => a.seat - b.seat || a.id.localeCompare(b.id))) {
      indicators = applyDelta(indicators, pe.delta);
      log({ rule: 'L1', text: `${when}: ${pe.text}`, seat: pe.seat, delta: pe.delta });
    }
    pending = pending.filter((pe) => !due(pe));
  };
  settle((pe) => pe.dueRound <= board.round, 'Delayed consequence');

  // Upkeep on what earlier rounds built (rule U1).
  const upkeep = Object.values(districts).flatMap((ds) => ds.features).reduce((sum, f) => sum + (f.kind in PROJECTS ? PROJECTS[f.kind as ProjectKind].upkeep : 0), 0);
  if (upkeep > 0) {
    indicators = applyDelta(indicators, { budget: -upkeep });
    log({ rule: 'U1', text: `Upkeep on drains and seawalls already built: −$${upkeep}M (hypothetical).`, delta: { budget: -upkeep } });
  }
  const outcomes: Outcome[] = [];
  const carried: Proposal[] = [];
  const refunds: Record<number, number> = {};
  const accepted = new Set(board.compromises.filter((c) => c.accepted).map((c) => c.id));
  const compromiseFor = (proposalId: string, kind: CompromiseKind) => board.compromises.find((c) => c.proposalId === proposalId && c.kind === kind);
  const bySeat = (a: { seat: number }, b: { seat: number }) => a.seat - b.seat;

  for (const p of [...board.proposals].sort(proposalOrder)) {
    const project = PROJECTS[p.kind];
    const d = districtById(p.district);
    const rules: string[] = [];
    let support = 1;
    let opposition = 0;
    let ignore = 0;
    let fastTracked = false;
    let covered = false;
    let blocked = false;
    const mods: Delta = {};
    const conditions: string[] = [];
    const features: MapFeature[] = [];
    const laters: { a: Attachment; later: NonNullable<(typeof CARDS)[CardId]['delayed']> }[] = [];
    rules.push(log({ rule: 'P1', text: `${PERSONA_INFO[p.persona].name} proposes a ${project.name.toLowerCase()} in ${d.name}${p.carried ? ' (delayed from an earlier round)' : ''}: 1 support.`, seat: p.seat, proposalId: p.id, district: p.district }));

    for (const a of board.attachments.filter((x) => x.proposalId === p.id).sort(bySeat)) {
      const who = PERSONA_INFO[a.persona].name;
      switch (a.card) {
        case 'emergency-funding':
          support += 1;
          covered = true;
          rules.push(log({ rule: 'F1', text: `${who}'s Emergency Funding: +1 support, the public cost is covered by an emergency grant.`, seat: a.seat, proposalId: p.id }));
          break;
        case 'fast-track':
          support += 1;
          ignore += 1;
          fastTracked = true;
          rules.push(log({ rule: 'F2', text: `${who}'s Fast-Track Review: +1 support, 1 opposition ignored, a tie is decided now.`, seat: a.seat, proposalId: p.id }));
          break;
        case 'public-campaign':
          support += 2;
          rules.push(log({ rule: 'S1', text: `${who}'s Public Campaign: +2 support.`, seat: a.seat, proposalId: p.id }));
          break;
        case 'private-investment':
          support += 1;
          if (project.budgetCost > 0) covered = true;
          if (p.kind === 'hotel') addDelta(mods, { economy: 2 });
          rules.push(log({ rule: 'F3', text: `${who}'s Private Investment: +1 support${project.budgetCost > 0 ? ', the public cost is covered privately' : p.kind === 'hotel' ? ', +2 economy if built' : ''}.`, seat: a.seat, proposalId: p.id }));
          break;
        case 'tourism-campaign':
          support += 1;
          addDelta(mods, { economy: 3 });
          rules.push(log({ rule: 'S2', text: `${who}'s Tourism Campaign: +1 support, +3 economy if it is built.`, seat: a.seat, proposalId: p.id }));
          break;
        case 'environmental-challenge': {
          const setback = compromiseFor(p.id, 'setback');
          if (setback && accepted.has(setback.id)) {
            addDelta(mods, { economy: -3, environment: 3 });
            conditions.push(setback.title);
            features.push({ kind: 'dune-setback', round: board.round, proposalId: p.id, label: 'Dune setback' });
            rules.push(log({ rule: 'C2', text: `Compromise accepted: dune setback and elevated design. ${who}'s challenge is withdrawn; the hotel gives 3 less economy and 3 more environment.`, seat: a.seat, proposalId: p.id, delta: { economy: -3, environment: 3 } }));
          } else if (coastalHighHazard(d)) {
            blocked = true;
            rules.push(log({ rule: 'R1', text: `${who}'s Environmental Challenge: ${d.name} borders a FEMA VE coastal high hazard zone (${Math.round(d.veBandShare * 100)}% of the 100 m band). The hotel is blocked.`, seat: a.seat, proposalId: p.id, district: p.district }));
          } else {
            opposition += 2;
            rules.push(log({ rule: 'O1', text: `${who}'s Environmental Challenge: +2 opposition (${d.name} is not in a coastal high hazard area, so it cannot block outright).`, seat: a.seat, proposalId: p.id }));
          }
          break;
        }
        case 'neighborhood-petition':
          opposition += 2;
          rules.push(log({ rule: 'O2', text: `${who}'s Neighborhood Petition: +2 opposition.`, seat: a.seat, proposalId: p.id }));
          break;
        case 'public-access-guarantee': {
          const deal = compromiseFor(p.id, 'access');
          if (deal && accepted.has(deal.id)) {
            support += 1;
            const delta: Delta = p.kind === 'hotel' ? { access: 4, economy: -2 } : { access: 4 };
            addDelta(mods, delta);
            conditions.push(deal.title);
            features.push({ kind: 'access-corridor', round: board.round, proposalId: p.id, label: 'Public access corridor' });
            rules.push(log({ rule: 'C1', text: `Compromise accepted: public beach access corridor. +1 support, ${deltaText(delta)}.`, seat: a.seat, proposalId: p.id, delta }));
          } else {
            opposition += 1;
            rules.push(log({ rule: 'O3', text: `${who}'s Public Access Guarantee was not accepted: +1 opposition.`, seat: a.seat, proposalId: p.id }));
          }
          break;
        }
        default: {
          const card = CARDS[a.card];
          if (card.offer) {
            const deal = compromiseFor(p.id, card.offer.kind);
            if (deal && accepted.has(deal.id)) {
              support += card.offer.accepted.support;
              addDelta(mods, card.offer.accepted.ifBuilt);
              conditions.push(deal.title);
              features.push({ kind: 'eco-label', round: board.round, proposalId: p.id, label: deal.title });
              rules.push(log({ rule: 'C4', text: `Compromise accepted: ${deal.title.toLowerCase()}. +${card.offer.accepted.support} support; if built ${deltaText(card.offer.accepted.ifBuilt)}.`, seat: a.seat, proposalId: p.id, delta: card.offer.accepted.ifBuilt }));
            } else {
              opposition += card.offer.refused.opposition;
              rules.push(log({ rule: 'O7', text: `${who}'s ${card.name} was not accepted: +${card.offer.refused.opposition} opposition.`, seat: a.seat, proposalId: p.id }));
            }
          } else if (card.attach) {
            const at = card.attach;
            support += at.support ?? 0;
            opposition += at.opposition ?? 0;
            if (at.cover && project.budgetCost > 0) covered = true;
            if (at.ifBuilt) addDelta(mods, at.ifBuilt);
            const parts = [
              at.support ? `+${at.support} support` : '',
              at.opposition ? `+${at.opposition} opposition` : '',
              at.cover && project.budgetCost > 0 ? 'the public cost is covered' : '',
              at.ifBuilt ? `if built ${deltaText(at.ifBuilt)}` : '',
            ].filter(Boolean);
            rules.push(log({ rule: at.rule, text: `${who}'s ${card.name}: ${parts.join(', ')}.`, seat: a.seat, proposalId: p.id }));
          }
          break;
        }
      }
      const later = CARDS[a.card].delayed;
      if (later) laters.push({ a, later });
    }

    for (const n of actions.filter((x) => x.proposalId === p.id).sort(bySeat)) {
      const who = PERSONA_INFO[n.persona].name;
      if (n.move === 'back') {
        support += 1;
        rules.push(log({ rule: 'N1', text: `${who} backs it in negotiation: +1 support.`, seat: n.seat, proposalId: p.id }));
      } else if (n.move === 'oppose') {
        opposition += 1;
        rules.push(log({ rule: 'N2', text: `${who} opposes it in negotiation: +1 opposition.`, seat: n.seat, proposalId: p.id }));
      } else if (n.move === 'fund') {
        covered = true;
        rules.push(log({ rule: 'N3', text: `${who} offers funding: the public cost is covered.`, seat: n.seat, proposalId: p.id }));
      }
    }

    const counted = Math.max(0, opposition - ignore);
    const ignored = opposition - counted;
    const net = support - counted;
    let status: OutcomeStatus;
    if (blocked) status = 'blocked';
    else if (net > 0) status = 'approved';
    else if (net < 0) status = 'rejected';
    else if (fastTracked) status = 'approved';
    else if (p.carried || board.round >= TOTAL_ROUNDS) status = 'rejected';
    else status = 'delayed';

    if (!blocked) {
      const why =
        status === 'delayed' ? 'a tie: delayed to the next round'
          : status === 'rejected' && net === 0 ? 'a tie again with no time left: it stalls'
            : net === 0 ? 'a tie, decided by Fast-Track' : status;
      rules.push(log({ rule: 'V1', text: `Vote: ${support} support vs ${counted} opposition${ignored ? ` (${ignored} ignored)` : ''}: ${why}.`, proposalId: p.id }));
    }

    let funding: Outcome['funding'] = null;
    let delta: Delta = {};
    if (status === 'approved') {
      if (project.budgetCost === 0) funding = 'free';
      else if (covered) funding = 'covered';
      else if (indicators.budget >= project.budgetCost) {
        funding = 'budget';
        indicators = applyDelta(indicators, { budget: -project.budgetCost });
        rules.push(log({ rule: 'B2', text: `Paid from the public budget: −$${project.budgetCost}M (hypothetical).`, proposalId: p.id, delta: { budget: -project.budgetCost } }));
      } else {
        status = 'unfunded';
        rules.push(log({ rule: 'B1', text: `Not enough public budget ($${indicators.budget}M left, needs $${project.budgetCost}M) and nobody covered it: unfunded.`, proposalId: p.id }));
      }
    }

    if (status === 'approved') {
      delta = { ...project.delta };
      addDelta(delta, mods);
      if (board.crisis.spotlight.includes(p.district)) {
        addDelta(delta, board.crisis.bonus);
        rules.push(log({ rule: 'K1', text: `Crisis bonus (${board.crisis.title}): ${deltaText(board.crisis.bonus)}.`, proposalId: p.id, delta: board.crisis.bonus }));
      }
      indicators = applyDelta(indicators, delta);
      const ds = districts[p.district]!;
      ds.resilience = clamp(ds.resilience + project.resilience, 0, 100);
      ds.features.push({ kind: p.kind, round: board.round, proposalId: p.id, label: project.name }, ...features);
      rules.push(log({ rule: 'E1', text: `Built: ${deltaText(delta)}; ${d.name} resilience ${project.resilience >= 0 ? '+' : ''}${project.resilience}.`, proposalId: p.id, district: p.district, delta }));
    } else if (status === 'delayed') {
      carried.push({ ...p, carried: true });
    }

    // A delayed consequence comes due only if the proposal its card backed was built (rule L0 schedules it).
    if (status === 'approved') {
      for (const { a, later } of laters) {
        pending.push({ id: `r${board.round}-${a.persona}-${a.card}`, dueRound: board.round + 1, delta: later.delta, text: later.text, card: a.card, seat: a.seat });
        rules.push(log({ rule: 'L0', text: `${PERSONA_INFO[a.persona].name}'s ${CARDS[a.card].name} has a consequence next round: ${later.text}`, seat: a.seat, proposalId: p.id, delta: later.delta }));
      }
    }

    outcomes.push({
      proposalId: p.id, kind: p.kind, district: p.district, seat: p.seat, persona: p.persona, status, support, opposition, ignored,
      funding, delta, conditions: status === 'approved' ? conditions : [], rules,
    });
  }

  // Authored combos (rules M1-M5 and C3): the pairing is on the board and the projects were approved.
  const combos: ComboHit[] = [];
  const approved = (id: string) => outcomes.find((o) => o.proposalId === id)?.status === 'approved';
  const outcomeOf = (id: string) => outcomes.find((o) => o.proposalId === id)!;
  const hit = (combo: ComboId, district: string, proposalIds: string[]) => {
    const c = COMBOS[combo];
    indicators = applyDelta(indicators, c.bonus);
    const ds = districts[district]!;
    ds.resilience = clamp(ds.resilience + c.resilience, 0, 100);
    const ev = log({ rule: c.rule, text: `Combo: ${c.name}. ${c.recipe} Bonus ${deltaText(c.bonus)}${c.resilience ? `, ${districtById(district).name} resilience +${c.resilience}` : ''}.`, proposalId: proposalIds[0], district, delta: c.bonus });
    for (const id of proposalIds) outcomeOf(id).rules.push(ev);
    combos.push({ combo, district, proposalIds, delta: c.bonus, event: ev });
  };
  const ordered = [...board.proposals].sort(proposalOrder);
  for (const p of ordered.filter((x) => approved(x.id))) {
    const on = board.attachments.filter((a) => a.proposalId === p.id);
    if (p.kind === 'shoreline' && on.some((a) => a.card === 'emergency-funding')) hit('grant-match', p.district, [p.id]);
    if ((p.kind === 'drainage' || p.kind === 'seawall') && on.some((a) => a.card === 'private-investment')) hit('public-private-flood', p.district, [p.id]);
    if ((p.kind === 'hotel' || p.kind === 'marina') && board.compromises.some((c) => c.proposalId === p.id && c.accepted && (c.kind === 'setback' || c.kind === 'green'))) hit('eco-resort', p.district, [p.id]);
    if (p.kind === 'marina' && board.compromises.some((c) => c.proposalId === p.id && c.accepted && c.kind === 'access')) hit('working-waterfront', p.district, [p.id]);
  }
  for (const d of DISTRICT_IDS) {
    const here = ordered.filter((x) => x.district === d && approved(x.id));
    const wall = here.find((x) => x.kind === 'seawall');
    const green = here.find((x) => x.kind === 'shoreline' || x.kind === 'dune');
    if (wall && green) hit('hybrid-shoreline', d, [wall.id, green.id]);
    const homes = here.find((x) => x.kind === 'elevate');
    const grey = here.find((x) => x.kind === 'drainage' || x.kind === 'seawall');
    if (homes && grey) hit('resilience-package', d, [homes.id, grey.id]);
  }

  // Cards with nothing to act on fall back to their own small effect (or hand influence back).
  for (const a of board.attachments.filter((x) => x.proposalId === null).sort(bySeat)) {
    const card = CARDS[a.card];
    const fb = card.fallback;
    if (!fb) continue;
    if (Object.keys(fb.delta).length) {
      indicators = applyDelta(indicators, fb.delta);
      log({ rule: 'X1', text: `${PERSONA_INFO[a.persona].name}'s ${card.name} in ${districtById(a.district).name}: ${fb.text}`, seat: a.seat, district: a.district, delta: fb.delta });
    } else {
      refunds[a.seat] = (refunds[a.seat] ?? 0) + 1;
      log({ rule: 'X2', text: `${PERSONA_INFO[a.persona].name}'s ${card.name} in ${districtById(a.district).name}: ${fb.text}`, seat: a.seat, district: a.district });
    }
  }

  // The storm tests the city after the last round; anything still owed is settled first.
  if (board.round >= TOTAL_ROUNDS) {
    settle(() => true, 'Settled at the end of the session');
    const gap = STORM_TEST.threshold - indicators.flood;
    if (gap > 0) {
      const loss = Math.max(1, Math.round(gap * STORM_TEST.economyLossPerPoint));
      indicators = applyDelta(indicators, { economy: -loss });
      log({ rule: 'S9', text: `The storm hits. Flood resilience ${indicators.flood} is below ${STORM_TEST.threshold}: −${loss} economy from flood damage.`, delta: { economy: -loss } });
    } else {
      log({ rule: 'S9', text: `The storm hits. Flood resilience ${indicators.flood} holds (${STORM_TEST.threshold} needed): no flood damage.` });
    }
  }

  return { round: board.round, before, after: indicators, outcomes, events, refunds, carried, combos, city: { indicators, districts, pending } };
}

export interface ScorePart {
  label: string;
  points: number;
}
export interface PersonaScore {
  persona: PersonaId;
  total: number;
  parts: ScorePart[];
}
export interface FinalResult {
  indicators: Indicators;
  viable: boolean;
  /** Indicators below the floor. */
  failing: Indicator[];
  scores: PersonaScore[];
  winners: PersonaId[];
}

/** Final scores from the start and end of the city and every round's outcomes. */
export function finalResult(start: Indicators, end: Indicators, rounds: Resolution[], personas: PersonaId[]): FinalResult {
  const all = rounds.flatMap((r) => r.outcomes);
  const failing = (['flood', 'economy', 'environment', 'access'] as Indicator[]).filter((k) => end[k] < VIABILITY_FLOOR);
  const viable = failing.length === 0;
  const scores = personas.map((persona) => {
    const info = PERSONA_INFO[persona];
    const parts: ScorePart[] = [];
    for (const k of INDICATORS) {
      const w = info.weights[k];
      if (!w) continue;
      const change = end[k] - start[k];
      parts.push({ label: `${w}× ${k} change (${change >= 0 ? '+' : ''}${change})`, points: w * change });
    }
    if (persona === 'mayor') {
      parts.push({ label: `$${end.budget}M budget left`, points: Math.floor(end.budget / 2) });
      if (end.budget === 0) parts.push({ label: 'Budget ran dry', points: -10 });
    }
    if (persona === 'activist') {
      const n = all.filter((o) => (o.kind === 'hotel' || o.kind === 'marina') && o.status === 'blocked').length;
      if (n) parts.push({ label: `${n} development${n > 1 ? 's' : ''} stopped in a coastal high hazard area`, points: 4 * n });
    }
    if (persona === 'resort') {
      const n = all.filter((o) => (o.kind === 'hotel' || o.kind === 'marina') && o.status === 'approved').length;
      if (n) parts.push({ label: `${n} hotel${n > 1 ? 's' : ''} or marina${n > 1 ? 's' : ''} approved`, points: 4 * n });
    }
    if (persona === 'resident') {
      const n = all.filter((o) => (o.kind === 'elevate' || o.kind === 'housing') && o.status === 'approved').length;
      if (n) parts.push({ label: `${n} home-elevation or housing program${n > 1 ? 's' : ''} approved`, points: 3 * n });
    }
    let total = parts.reduce((s, p) => s + p.points, 0);
    if (!viable && total > 0) {
      const halved = Math.floor(total / 2);
      parts.push({ label: 'City not viable: score halved', points: halved - total });
      total = halved;
    }
    return { persona, total, parts };
  });
  const best = Math.max(...scores.map((s) => s.total));
  return { indicators: end, viable, failing, scores, winners: scores.filter((s) => s.total === best).map((s) => s.persona) };
}

/** A simple, deterministic stand-in player for empty seats (demo and tests). */
export function botPlay(persona: PersonaId, influence: number, round: number, crisis: Crisis = crisisFor(round)): { card: CardId; district: string } | null {
  const order = [...crisis.spotlight, ...DISTRICT_IDS.filter((d) => !crisis.spotlight.includes(d))];
  // A story's deal comes most-fitting first; otherwise the authored preference order.
  const prefs = crisis.hands?.[persona] ?? BOT_PREFS[persona][Math.min(round, 3) - 1]!;
  for (const card of prefs) {
    for (const district of order) if (!checkPlay(persona, influence, card, district, round, crisis)) return { card, district };
  }
  return null;
}

/** Each round's hand in the bot's order of preference (HANDS in content.ts, reordered). */
const BOT_PREFS: Record<PersonaId, CardId[][]> = {
  mayor: [
    ['drainage-upgrade', 'emergency-funding', 'seawall-upgrade', 'resilience-bond'],
    ['fast-track', 'building-moratorium', 'emergency-funding', 'resilience-bond'],
    ['emergency-funding', 'drainage-upgrade', 'seawall-upgrade', 'fast-track'],
  ],
  activist: [
    ['living-shoreline', 'public-campaign', 'dune-restoration', 'habitat-survey'],
    ['environmental-challenge', 'eco-certification', 'public-campaign', 'habitat-survey'],
    ['living-shoreline', 'environmental-challenge', 'dune-restoration', 'public-campaign'],
  ],
  resort: [
    ['tourism-campaign', 'private-investment', 'hotel-development', 'marina-expansion'],
    ['hotel-development', 'lobbying-blitz', 'marina-expansion', 'community-benefits'],
    ['private-investment', 'tourism-campaign', 'community-benefits', 'lobbying-blitz'],
  ],
  resident: [
    ['elevate-buildings', 'flood-watch', 'workforce-housing', 'neighborhood-petition'],
    ['public-access-guarantee', 'neighborhood-petition', 'rent-shield', 'workforce-housing'],
    ['public-access-guarantee', 'elevate-buildings', 'flood-watch', 'neighborhood-petition'],
  ],
};

export { handOf };
