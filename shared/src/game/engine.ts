// The deterministic rules engine. Pure functions, no I/O, no randomness: the server runs it, the
// tests pin it, and every effect it applies is written to an event log with the rule that caused it.
//
// A round:  plays (one card each, hidden)  ->  buildBoard (reveal: proposals, who acts on what,
//           compromises on the table)  ->  negotiation (back / oppose / fund, accept compromises)
//           ->  resolveRound (support vs opposition, geography, funding, effects)  ->  next round.
import {
  AGREEMENTS, CARDS, COMBOS, INDICATORS, INFLUENCE_PER_ROUND, MAX_INFLUENCE, NEGOTIATION_COST, PERSONAS, PERSONA_INFO, PROJECTS,
  START_INDICATORS, STORM_TEST, TOTAL_ROUNDS, VIABILITY_FLOOR, handFor, handOf,
  type AgreementType, type CardId, type ComboId, type Delta, type Indicator, type Indicators, type NegotiationMove, type PersonaId, type ProjectKind,
} from './content';
import { DISTRICTS, DISTRICT_IDS, cardEligibility, coastalHighHazard, districtById, startResilience } from './districts';
import { authoredScenario, type Crisis } from './scenario';
import { agreementTerms, checkAfford, checkFund, offersAgreement, type AgreementTerms } from './agreements';
import {
  Books, budgetDelta, chargeUpkeep, cloneTreasury, debtOutstanding, inMillions, millions, settleArrears, settleObligations, startTreasury, usd, walletOf,
  WALLET_INFO, type LedgerEntry, type Treasury, type WalletId,
} from './money';

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

export type CompromiseKind = 'access' | 'setback' | 'green' | AgreementType;
export interface Compromise {
  id: string;
  kind: CompromiseKind;
  proposalId: string;
  /** Who offered it (the card's player) and who must accept (the proposal's owner, or the payer for a bond). */
  offeredBy: number;
  owner: number;
  accepted: boolean;
  title: string;
  text: string;
  /** A money agreement: exact, authored terms fixed at the reveal (rules 3.x). */
  terms?: AgreementTerms;
  /** The owner said no out loud (otherwise an offer not accepted by the resolution is refused anyway). */
  declined?: boolean;
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
  /**
   * Who paid the project's cost: the public budget, an emergency grant, a bond, a partner's agreement, a
   * player's own contribution, or the proposer's private capital. 'covered' is rules 2.x only.
   */
  funding: Funding;
  /** The wallet that paid it (rules 3.x). */
  paidBy?: WalletId | null;
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
  /** Wallets, debts, scheduled payments and the ledger (simulated money). indicators.budget mirrors the city wallet. */
  treasury: Treasury;
}

export type Funding = 'budget' | 'grant' | 'bond' | 'partner' | 'contribution' | 'private' | 'covered' | 'free' | null;

/** What became of a money agreement at the resolution. */
export interface AgreementResult {
  compromiseId: string;
  type: AgreementType;
  proposalId: string;
  status: 'executed' | 'refused' | 'void' | 'not-needed' | 'not-built';
  text: string;
  /** Ledger entries it produced. */
  entries: string[];
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
  /** Every money movement this round (the authoritative ledger; external mirrors only copy it). */
  ledger: LedgerEntry[];
  agreements: AgreementResult[];
  city: CityState;
}

export class RuleError extends Error {}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const personaOrder = (p: PersonaId) => PERSONAS.indexOf(p);
const districtOrder = (id: string) => DISTRICT_IDS.indexOf(id);

export function startCity(): CityState {
  const treasury = startTreasury();
  return {
    indicators: { ...START_INDICATORS, budget: inMillions(treasury.balances.city) },
    districts: Object.fromEntries(DISTRICTS.map((d) => [d.id, { resilience: startResilience(d), features: [] }])),
    pending: [],
    treasury,
  };
}

/** A city from before rules 3.x (or a client copy) without books: start them from its budget. */
export function treasuryOf(city: CityState): Treasury {
  if (city.treasury) return city.treasury;
  const t = startTreasury();
  t.balances.city = millions(city.indicators.budget);
  return t;
}

const AUTHORED = authoredScenario(null).crises;
/** The authored crisis for a round (a match normally brings its own scenario). */
export const crisisFor = (round: number): Crisis => AUTHORED[clamp(round, 1, AUTHORED.length) - 1]!;

/** Influence at the start of a round (round 1: the starting amount was already given). */
export const nextInfluence = (current: number) => Math.min(MAX_INFLUENCE, current + INFLUENCE_PER_ROUND);

/** Why this play is not allowed, or null. `round` decides which hand is dealt. */
export function checkPlay(persona: PersonaId, influence: number, card: unknown, district: unknown, round: number): string | null {
  if (typeof card !== 'string' || !Object.hasOwn(CARDS, card)) return 'Pick a card.';
  const c = CARDS[card as CardId];
  if (c.persona !== persona) return `${c.name} is not in your hand.`;
  if (!handFor(persona, round).includes(c.id)) return `${c.name} is not in your hand this round (each crisis deals 4 of your 6 cards).`;
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
    // A money agreement: authored terms, exact amounts, fixed now. The payer signs a bond alone; otherwise the
    // proposal's owner accepts (at once when it is their own card on their own proposal).
    const type = offersAgreement(a.card, target.kind);
    if (type) {
      const spec = AGREEMENTS[type];
      const terms = agreementTerms(type, a.persona, target, round);
      const owner = spec.acceptedBy === 'player' ? a.seat : target.seat;
      compromises.push({
        id: `c${round}-${type}-${target.id}`, kind: type, proposalId: target.id, offeredBy: a.seat, owner, accepted: owner === a.seat,
        title: spec.name, text: `${spec.text} ${spec.strings}`, terms,
      });
    }
  }
  return { round, crisis, proposals, attachments, compromises };
}

/** The agreement a card put on a proposal, if any. */
const agreementOf = (board: Board, a: Attachment, proposalId: string): Compromise | undefined => {
  const type = CARDS[a.card].agreement;
  return type ? board.compromises.find((c) => c.terms && c.kind === type && c.proposalId === proposalId && c.offeredBy === a.seat) : undefined;
};

/** The money context of a move or an acceptance: who is acting, the city's books, the moves so far. */
export interface MoneyContext {
  persona: PersonaId;
  treasury: Treasury;
  actions: NegotiationAction[];
}

/** Why this negotiation move is not allowed, or null. A fund move pays from the mover's own wallet. */
export function checkMove(board: Board, seat: number, influence: number, move: unknown, proposalId: unknown, money?: MoneyContext): string | null {
  if (move !== 'back' && move !== 'oppose' && move !== 'fund') return 'Pick back, oppose or fund.';
  const p = board.proposals.find((x) => x.id === proposalId);
  if (!p) return 'That proposal is not on the table.';
  const cost = NEGOTIATION_COST[move];
  if (cost > influence) return `That costs ${cost} influence; you have ${influence}.`;
  if (move === 'oppose' && p.seat === seat) return 'You cannot oppose your own proposal.';
  if (move === 'fund') {
    if (PROJECTS[p.kind].budgetCost === 0) return 'That proposal is privately funded already.';
    if (!money) return 'Funding pays from your own wallet.';
    return checkFund(money.treasury, board, money.actions, money.persona, p.id);
  }
  return null;
}

export function checkAccept(board: Board, seat: number, compromiseId: unknown, money?: Omit<MoneyContext, 'persona'>): string | null {
  const c = board.compromises.find((x) => x.id === compromiseId);
  if (!c) return 'That compromise is not on the table.';
  if (c.owner !== seat) return 'Only the proposal\'s owner can accept that.';
  if (c.accepted) return 'That is already accepted.';
  // The payer must still have the money it promises (it cannot promise the same money twice).
  if (c.terms && money) return checkAfford(money.treasury, board, money.actions, c.id);
  return null;
}

function addDelta(into: Delta, d: Delta) {
  for (const k of INDICATORS) if (d[k]) into[k] = (into[k] ?? 0) + d[k]!;
}

/** Apply a change to the indicators in place. The budget never changes here: money moves only through the Books. */
function applyInto(ind: Indicators, d: Delta): void {
  for (const k of INDICATORS) {
    if (!d[k] || k === 'budget') continue;
    ind[k] = clamp(ind[k] + d[k]!, 0, 100);
  }
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
  const indicators: Indicators = { ...city.indicators };
  const treasury = cloneTreasury(treasuryOf(city));
  const books = new Books(treasury, board.round, indicators);
  /** A change to the city: the budget part moves money (and logs its own entries), the rest moves the meters. */
  const change = (d: Delta, meta: { rule: string; text: string; proposalId?: string }) => applyInto(indicators, budgetDelta(books, d, meta));
  const districts: Record<string, DistrictState> = Object.fromEntries(
    Object.entries(city.districts).map(([id, s]) => [id, { resilience: s.resilience, features: [...s.features] }]),
  );
  let pending: PendingEffect[] = [...(city.pending ?? [])];
  const settle = (due: (p: PendingEffect) => boolean, when: string) => {
    for (const pe of pending.filter(due).sort((a, b) => a.seat - b.seat || a.id.localeCompare(b.id))) {
      change(pe.delta, { rule: 'L1', text: `${when}: ${pe.text}` });
      log({ rule: 'L1', text: `${when}: ${pe.text}`, seat: pe.seat, delta: pe.delta });
    }
    pending = pending.filter((pe) => !due(pe));
  };
  settle((pe) => pe.dueRound <= board.round, 'Delayed consequence');

  // Operating costs, before anything new is paid for: scheduled payments (U2 bonds, U3 partnerships), then upkeep (U1).
  for (const e of settleObligations(books, board.round)) log({ rule: e.rule, text: `${e.text} ${usd(e.amount)} from ${WALLET_INFO[e.from].short.toLowerCase()} to ${WALLET_INFO[e.to].short.toLowerCase()} (simulated).`, delta: e.from === 'city' ? { budget: -inMillions(e.amount) } : undefined });
  const built = Object.values(districts).flatMap((ds) => ds.features).filter((f) => f.kind in PROJECTS).map((f) => ({ kind: f.kind as ProjectKind, proposalId: f.proposalId }));
  const upkeep = chargeUpkeep(books, built);
  const upkeepM = inMillions(upkeep.filter((e) => e.from === 'city').reduce((s, e) => s + e.amount, 0));
  const fromReserves = inMillions(upkeep.filter((e) => e.from === 'reserves').reduce((s, e) => s + e.amount, 0));
  const arrearsM = inMillions(upkeep.filter((e) => e.kind === 'arrears').reduce((s, e) => s + e.amount, 0));
  if (upkeep.length) {
    log({
      rule: 'U1',
      text: `Upkeep on drains and seawalls already built: ${[upkeepM ? `−$${upkeepM}M from the budget` : '', fromReserves ? `$${fromReserves}M from maintenance reserves` : '', arrearsM ? `$${arrearsM}M the budget could not pay became arrears (B3)` : ''].filter(Boolean).join(', ')} (simulated).`,
      delta: upkeepM ? { budget: -upkeepM } : undefined,
    });
  }
  const outcomes: Outcome[] = [];
  const carried: Proposal[] = [];
  const refunds: Record<number, number> = {};
  const agreements: AgreementResult[] = [];
  const accepted = new Set(board.compromises.filter((c) => c.accepted).map((c) => c.id));
  const compromiseFor = (proposalId: string, kind: CompromiseKind) => board.compromises.find((c) => c.proposalId === proposalId && c.kind === kind);
  const bySeat = (a: { seat: number }, b: { seat: number }) => a.seat - b.seat;
  const settled = (c: Compromise, status: AgreementResult['status'], text: string, entries: LedgerEntry[] = []) =>
    agreements.push({ compromiseId: c.id, type: c.terms!.type, proposalId: c.proposalId, status, text, entries: entries.map((e) => e.id) });

  for (const p of [...board.proposals].sort(proposalOrder)) {
    const project = PROJECTS[p.kind];
    const d = districtById(p.district);
    const rules: string[] = [];
    let support = 1;
    let opposition = 0;
    let ignore = 0;
    let fastTracked = false;
    let blocked = false;
    let grant: Attachment | null = null;
    const mods: Delta = {};
    const conditions: string[] = [];
    const features: MapFeature[] = [];
    const laters: { a: Attachment; later: NonNullable<(typeof CARDS)[CardId]['delayed']> }[] = [];
    /** Accepted money agreements on this proposal, executed only if it is approved. */
    const deals: Compromise[] = [];
    rules.push(log({ rule: 'P1', text: `${PERSONA_INFO[p.persona].name} proposes a ${project.name.toLowerCase()} in ${d.name}${p.carried ? ' (delayed from an earlier round)' : ''}: 1 support.`, seat: p.seat, proposalId: p.id, district: p.district }));

    for (const a of board.attachments.filter((x) => x.proposalId === p.id).sort(bySeat)) {
      const who = PERSONA_INFO[a.persona].name;
      // A money agreement this card offered here: its vote effect now, its money only if approved.
      const deal = agreementOf(board, a, p.id);
      if (deal?.terms) {
        const t = deal.terms;
        if (accepted.has(deal.id)) {
          support += t.support;
          deals.push(deal);
          rules.push(log({ rule: t.rule, text: `${t.name} agreed (${who}${deal.owner !== a.seat ? `, accepted by the ${PERSONA_INFO[board.proposals.find((x) => x.id === p.id)!.persona].name}` : ''})${t.support ? `: +${t.support} support` : ''}. Money moves only if it is approved.`, seat: a.seat, proposalId: p.id }));
        } else {
          opposition += t.refused.opposition;
          addDelta(mods, t.refused.ifBuilt);
          const rule = t.type === 'restoration' ? 'O5' : 'A0';
          rules.push(log({ rule, text: `${who}'s ${t.name.toLowerCase()} was not accepted${t.refused.opposition ? `: +${t.refused.opposition} opposition` : ': no money moves'}${Object.keys(t.refused.ifBuilt).length ? `; if built anyway ${deltaText(t.refused.ifBuilt)}` : ''}.`, seat: a.seat, proposalId: p.id }));
          settled(deal, 'refused', `${t.name} refused: no money moves.`);
        }
      }
      switch (a.card) {
        case 'emergency-funding':
          support += 1;
          grant = a;
          rules.push(log({ rule: 'F1', text: `${who}'s Emergency Funding: +1 support; if approved, an emergency grant pays the public cost.`, seat: a.seat, proposalId: p.id }));
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
          // On a public project it is the partnership above; on a hotel or marina, backing for a private project.
          if (deal) break;
          support += 1;
          if (p.kind === 'hotel') addDelta(mods, { economy: 2 });
          rules.push(log({ rule: 'F3', text: `${who}'s Private Investment: +1 support${p.kind === 'hotel' ? ', +2 economy if built' : ''}.`, seat: a.seat, proposalId: p.id }));
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
          const offer = compromiseFor(p.id, 'access');
          if (offer && accepted.has(offer.id)) {
            support += 1;
            const delta: Delta = p.kind === 'hotel' ? { access: 4, economy: -2 } : { access: 4 };
            addDelta(mods, delta);
            conditions.push(offer.title);
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
            const offer = compromiseFor(p.id, card.offer.kind);
            if (offer && accepted.has(offer.id)) {
              support += card.offer.accepted.support;
              addDelta(mods, card.offer.accepted.ifBuilt);
              conditions.push(offer.title);
              features.push({ kind: 'eco-label', round: board.round, proposalId: p.id, label: offer.title });
              rules.push(log({ rule: 'C4', text: `Compromise accepted: ${offer.title.toLowerCase()}. +${card.offer.accepted.support} support; if built ${deltaText(card.offer.accepted.ifBuilt)}.`, seat: a.seat, proposalId: p.id, delta: card.offer.accepted.ifBuilt }));
            } else {
              opposition += card.offer.refused.opposition;
              rules.push(log({ rule: 'O7', text: `${who}'s ${card.name} was not accepted: +${card.offer.refused.opposition} opposition.`, seat: a.seat, proposalId: p.id }));
            }
          } else if (card.attach) {
            const at = card.attach;
            support += at.support ?? 0;
            opposition += at.opposition ?? 0;
            if (at.ifBuilt) addDelta(mods, at.ifBuilt);
            const parts = [
              at.support ? `+${at.support} support` : '',
              at.opposition ? `+${at.opposition} opposition` : '',
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

    // Fund moves: an offer to pay from the mover's own wallet (it pays only if approved and still needed).
    const funders: NegotiationAction[] = [];
    for (const n of actions.filter((x) => x.proposalId === p.id).sort(bySeat)) {
      const who = PERSONA_INFO[n.persona].name;
      if (n.move === 'back') {
        support += 1;
        rules.push(log({ rule: 'N1', text: `${who} backs it in negotiation: +1 support.`, seat: n.seat, proposalId: p.id }));
      } else if (n.move === 'oppose') {
        opposition += 1;
        rules.push(log({ rule: 'N2', text: `${who} opposes it in negotiation: +1 opposition.`, seat: n.seat, proposalId: p.id }));
      } else if (n.move === 'fund') {
        funders.push(n);
        rules.push(log({ rule: 'N3', text: `${who} offers to pay the public cost from their own funds if it is approved.`, seat: n.seat, proposalId: p.id }));
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

    // Who pays. A project's own cost is paid once, by the first source that applies and can pay:
    // private capital (hotels, marinas), else an emergency grant, a bond, a partner, a player's contribution, the budget.
    let funding: Funding = null;
    let paidBy: WalletId | null = null;
    let delta: Delta = {};
    let coveredBy: Compromise | null = null;
    if (status === 'approved') {
      const meta = (rule: string, kind: LedgerEntry['kind'], text: string, agreementId?: string) => ({ rule, kind, text, proposalId: p.id, ...(agreementId ? { agreementId } : {}) });
      const owner = walletOf(p.persona);
      const privateCost = millions(project.privateCost);
      const publicCost = millions(project.budgetCost);
      if (privateCost > 0) {
        if (books.pay(owner, 'builders', privateCost, meta('B2', 'project', `${WALLET_INFO[owner].name} pays for the ${project.name.toLowerCase()}.`))) {
          funding = 'private';
          paidBy = owner;
          rules.push(log({ rule: 'B2', text: `Paid from ${WALLET_INFO[owner].name}: ${usd(privateCost)} (simulated, private money).`, proposalId: p.id }));
        } else {
          status = 'unfunded';
          rules.push(log({ rule: 'B1', text: `${WALLET_INFO[owner].name} has ${usd(books.balance(owner))} and the ${project.name.toLowerCase()} needs ${usd(privateCost)}: unfunded.`, proposalId: p.id }));
        }
      } else if (publicCost === 0) funding = 'free';
      else {
        const bond = deals.find((c) => c.terms!.type === 'bond');
        const ppp = deals.find((c) => c.terms!.type === 'ppp');
        if (grant) {
          books.pay('grants', 'builders', publicCost, meta('F1', 'grant', `Emergency grant pays for the ${project.name.toLowerCase()}.`));
          funding = 'grant';
          paidBy = 'grants';
          rules.push(log({ rule: 'F1', text: `An emergency grant pays the public cost: ${usd(publicCost)} (simulated).`, proposalId: p.id }));
        } else if (bond) {
          const t = bond.terms!;
          const e = books.pay('lender', 'builders', t.amount, meta('A2', 'bond', `Bond proceeds pay for the ${project.name.toLowerCase()}.`, bond.id))!;
          const debtId = `${e.id}-bond`;
          treasury.debts.push({ id: debtId, kind: 'bond', round: board.round, principal: t.principal, outstanding: t.repay, proposalId: p.id, agreementId: bond.id });
          t.schedule.forEach((s, i) => treasury.obligations.push({
            id: `${debtId}-${i + 1}`, dueRound: s.dueRound, from: s.from, to: s.to, amount: s.amount, kind: s.kind, rule: 'U2', debtId, agreementId: bond.id,
            text: `Resilience bond installment ${i + 1} of ${t.schedule.length}`,
          }));
          funding = 'bond';
          paidBy = 'lender';
          coveredBy = bond;
          rules.push(log({ rule: 'A2', text: `Resilience bond: the bond market pays ${usd(t.amount)}; the city owes ${usd(t.repay)} in ${t.schedule.length} installment${t.schedule.length > 1 ? 's' : ''} (simulated).`, proposalId: p.id, delta: {} }));
          settled(bond, 'executed', `Bond issued: ${usd(t.amount)} paid, ${usd(t.repay)} owed.`, [e]);
        }
        if (!funding && ppp) {
          const t = ppp.terms!;
          const e = books.pay(t.funder, 'builders', t.amount, meta('A1', 'project', `Public-private partnership pays for the ${project.name.toLowerCase()}.`, ppp.id));
          if (e) {
            t.schedule.forEach((s, i) => treasury.obligations.push({
              id: `${e.id}-ppp-${i + 1}`, dueRound: s.dueRound, from: s.from, to: s.to, amount: s.amount, kind: s.kind, rule: 'U3', agreementId: ppp.id,
              text: `Partnership availability payment ${i + 1} of ${t.schedule.length}`,
            }));
            funding = 'partner';
            paidBy = t.funder;
            coveredBy = ppp;
            rules.push(log({ rule: 'A1', text: `Public-private partnership: ${WALLET_INFO[t.funder].name} pays ${usd(t.amount)}; the city owes ${t.schedule.map((s) => usd(s.amount)).join(' + ')} in availability payments (simulated).`, proposalId: p.id }));
            settled(ppp, 'executed', `Partnership paid ${usd(t.amount)}.`, [e]);
          } else {
            rules.push(log({ rule: 'B4', text: `${WALLET_INFO[t.funder].name} cannot pay ${usd(t.amount)} now: the partnership is void.`, proposalId: p.id }));
            settled(ppp, 'void', `The investor could not pay ${usd(t.amount)}.`);
          }
        }
        if (!funding) {
          for (const n of funders) {
            const w = walletOf(n.persona);
            const e = w !== 'city' ? books.pay(w, 'builders', publicCost, meta('N3', 'project', `${PERSONA_INFO[n.persona].name} pays for the ${project.name.toLowerCase()}.`)) : null;
            if (e) {
              funding = 'contribution';
              paidBy = w;
              rules.push(log({ rule: 'N3', text: `${PERSONA_INFO[n.persona].name} pays the public cost from ${WALLET_INFO[w].name}: ${usd(publicCost)} (simulated).`, seat: n.seat, proposalId: p.id }));
              break;
            }
            rules.push(log({ rule: 'B4', text: `${PERSONA_INFO[n.persona].name} offered to pay but ${WALLET_INFO[w].name} cannot cover ${usd(publicCost)} now.`, seat: n.seat, proposalId: p.id }));
          }
        }
        if (!funding) {
          if (books.pay('city', 'builders', publicCost, meta('B2', 'project', `The public budget pays for the ${project.name.toLowerCase()}.`))) {
            funding = 'budget';
            paidBy = 'city';
            rules.push(log({ rule: 'B2', text: `Paid from the public budget: −${usd(publicCost)} (simulated).`, proposalId: p.id, delta: { budget: -project.budgetCost } }));
          } else {
            status = 'unfunded';
            rules.push(log({ rule: 'B1', text: `Not enough public budget (${usd(books.balance('city'))} left, needs ${usd(publicCost)}) and nobody else paid: unfunded.`, proposalId: p.id }));
          }
        }
        // A funding agreement that was accepted but not needed moves no money and carries no strings.
        for (const c of deals.filter((x) => x.terms!.covers && x !== coveredBy && !agreements.some((r) => r.compromiseId === x.id))) settled(c, 'not-needed', `${c.terms!.name} not needed: the cost was already paid.`);
      }
    }

    // The other agreements move their money now that it is built; one whose payer cannot pay is void (B4).
    const dealMods: Delta = {};
    if (status === 'approved') {
      for (const c of deals) {
        const t = c.terms!;
        if (t.covers) {
          if (c === coveredBy) addDelta(dealMods, t.ifBuilt);
          continue;
        }
        const e = books.pay(t.funder, t.to, t.amount, { rule: t.rule, kind: 'contribution', text: `${t.name}: ${WALLET_INFO[t.funder].name} pays ${usd(t.amount)}.`, proposalId: p.id, agreementId: c.id });
        if (!e) {
          rules.push(log({ rule: 'B4', text: `${WALLET_INFO[t.funder].name} cannot pay ${usd(t.amount)} now: the ${t.name.toLowerCase()} is void.`, proposalId: p.id }));
          settled(c, 'void', `${WALLET_INFO[t.funder].name} could not pay.`);
          continue;
        }
        if (t.type === 'reserve') treasury.reserves.push({ id: `${e.id}-reserve`, proposalId: p.id, kind: p.kind, district: p.district, balance: t.amount });
        addDelta(dealMods, t.ifBuilt);
        conditions.push(t.name);
        rules.push(log({ rule: t.rule, text: `${t.name}: ${WALLET_INFO[t.funder].name} pays ${usd(t.amount)} to ${WALLET_INFO[t.to].short.toLowerCase()}${Object.keys(t.ifBuilt).length ? `; ${deltaText(t.ifBuilt)}` : ''} (simulated).`, proposalId: p.id, delta: t.ifBuilt }));
        settled(c, 'executed', `${t.name}: ${usd(t.amount)} paid.`, [e]);
      }
      if (coveredBy) conditions.push(coveredBy.terms!.name);
    } else {
      for (const c of deals.filter((x) => !agreements.some((r) => r.compromiseId === x.id))) settled(c, 'not-built', `${c.terms!.name}: the project was not approved, so no money moves.`);
    }

    if (status === 'approved') {
      delta = { ...project.delta };
      addDelta(delta, mods);
      addDelta(delta, dealMods);
      if (board.crisis.spotlight.includes(p.district)) {
        addDelta(delta, board.crisis.bonus);
        rules.push(log({ rule: 'K1', text: `Crisis bonus (${board.crisis.title}): ${deltaText(board.crisis.bonus)}.`, proposalId: p.id, delta: board.crisis.bonus }));
      }
      change(delta, { rule: 'K1', text: `Crisis aid for the ${project.name.toLowerCase()} in ${d.name}.`, proposalId: p.id });
      const ds = districts[p.district]!;
      ds.resilience = clamp(ds.resilience + project.resilience, 0, 100);
      ds.features.push({ kind: p.kind, round: board.round, proposalId: p.id, label: project.name }, ...features);
      const { budget: _money, ...meters } = delta;
      rules.push(log({ rule: 'E1', text: `Built: ${deltaText(meters) || 'no change to the meters'}; ${d.name} resilience ${project.resilience >= 0 ? '+' : ''}${project.resilience}.`, proposalId: p.id, district: p.district, delta }));
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
      funding, paidBy, delta, conditions: status === 'approved' ? conditions : [], rules,
    });
  }

  // Authored combos (rules M1-M5 and C3): the pairing is on the board and the projects were approved.
  const combos: ComboHit[] = [];
  const approved = (id: string) => outcomes.find((o) => o.proposalId === id)?.status === 'approved';
  const outcomeOf = (id: string) => outcomes.find((o) => o.proposalId === id)!;
  const hit = (combo: ComboId, district: string, proposalIds: string[]) => {
    const c = COMBOS[combo];
    applyInto(indicators, c.bonus);
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
    // The partnership must have actually paid: an accepted deal the grant made unnecessary is not a partnership.
    if ((p.kind === 'drainage' || p.kind === 'seawall') && agreements.some((r) => r.proposalId === p.id && r.type === 'ppp' && r.status === 'executed')) hit('public-private-flood', p.district, [p.id]);
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
      change(fb.delta, { rule: 'X1', text: `${card.name}: ${fb.text}` });
      log({ rule: 'X1', text: `${PERSONA_INFO[a.persona].name}'s ${card.name} in ${districtById(a.district).name}: ${fb.text}`, seat: a.seat, district: a.district, delta: fb.delta });
    } else {
      refunds[a.seat] = (refunds[a.seat] ?? 0) + 1;
      log({ rule: 'X2', text: `${PERSONA_INFO[a.persona].name}'s ${card.name} in ${districtById(a.district).name}: ${fb.text}`, seat: a.seat, district: a.district });
    }
  }

  // The storm tests the city after the last round; anything still owed is settled first.
  if (board.round >= TOTAL_ROUNDS) {
    settle(() => true, 'Settled at the end of the session');
    for (const e of settleObligations(books, board.round, true)) log({ rule: e.rule, text: `Settled at the end of the session: ${e.text}, ${usd(e.amount)} (simulated).`, delta: e.from === 'city' ? { budget: -inMillions(e.amount) } : undefined });
    for (const e of settleArrears(books)) log({ rule: e.rule, text: e.text });
    const owed = debtOutstanding(treasury);
    if (owed > 0) log({ rule: 'B3', text: `The city still owes ${usd(owed)} at the end of the session (simulated).` });
    const gap = STORM_TEST.threshold - indicators.flood;
    if (gap > 0) {
      const loss = Math.max(1, Math.round(gap * STORM_TEST.economyLossPerPoint));
      applyInto(indicators, { economy: -loss });
      log({ rule: 'S9', text: `The storm hits. Flood resilience ${indicators.flood} is below ${STORM_TEST.threshold}: −${loss} economy from flood damage.`, delta: { economy: -loss } });
    } else {
      log({ rule: 'S9', text: `The storm hits. Flood resilience ${indicators.flood} holds (${STORM_TEST.threshold} needed): no flood damage.` });
    }
  }

  return { round: board.round, before, after: indicators, outcomes, events, refunds, carried, combos, ledger: books.entries, agreements, city: { indicators, districts, pending, treasury } };
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

/** Final scores from the start and end of the city, every round's outcomes, and (rules 3.x) the books at the end. */
export function finalResult(start: Indicators, end: Indicators, rounds: Resolution[], personas: PersonaId[], treasury?: Treasury): FinalResult {
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
      const owed = treasury ? inMillions(debtOutstanding(treasury)) : 0;
      if (owed > 0) parts.push({ label: `$${owed}M the city still owes`, points: -Math.floor(owed / 2) });
    }
    if (persona === 'activist') {
      const n = all.filter((o) => (o.kind === 'hotel' || o.kind === 'marina') && o.status === 'blocked').length;
      if (n) parts.push({ label: `${n} development${n > 1 ? 's' : ''} stopped in a coastal high hazard area`, points: 4 * n });
    }
    if (persona === 'resort') {
      const n = all.filter((o) => (o.kind === 'hotel' || o.kind === 'marina') && o.status === 'approved').length;
      if (n) parts.push({ label: `${n} hotel${n > 1 ? 's' : ''} or marina${n > 1 ? 's' : ''} approved`, points: 4 * n });
      const capital = treasury ? inMillions(treasury.balances.resort) : 0;
      if (capital >= 4) parts.push({ label: `$${capital}M of capital left`, points: Math.floor(capital / 4) });
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
  for (const card of BOT_PREFS[persona][Math.min(round, 3) - 1]!) {
    for (const district of order) if (!checkPlay(persona, influence, card, district, round)) return { card, district };
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
