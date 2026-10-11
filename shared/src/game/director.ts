// The Game Director's rules. Gemini PROPOSES (dialogue, reactions, a twist event, which combo or
// negotiation move to point out, how to word an explanation); this module VALIDATES every proposal
// against the current state and either accepts it, clamps it deterministically, or rejects it with
// reasons. Nothing an LLM writes reaches the city without passing through here, and every number in
// an accepted twist comes from the authored catalogue below, never from the model.
//
//   game state -> context (server) -> Gemini JSON -> validate* (here) -> applyDirectorEvent (deterministic) -> record
import { CARDS, COMBOS, INDICATORS, NEGOTIATION_COST, PERSONA_INFO, PROJECTS, TOTAL_ROUNDS, isComboId, type ComboId, type Delta, type NegotiationMove, type PersonaId } from './content';
import { DISTRICT_IDS, coastalHighHazard, districtById, isDistrictId, projectEligibility, type District } from './districts';
import { checkAccept, checkMove, resolveRound, type Board, type CityState, type NegotiationAction, type OutcomeStatus, type RuleEvent } from './engine';
import { BUBBLE_WORDS, isReaction, isRoleId, roleInfo, wordCount, type Bubble, type Reaction, type RoleId } from './living';

// ---------- Shared checks ----------

/** Digits in `text` that do not appear anywhere in `facts`. */
export function strayNumbers(text: string, facts: unknown): string[] {
  const allowed = new Set((JSON.stringify(facts).match(/\d+(?:\.\d+)?/g) ?? []).map((n) => String(Math.abs(Number(n)))));
  return (text.match(/\d+(?:\.\d+)?/g) ?? []).filter((n) => !allowed.has(String(Number(n))));
}

/** A short list of words a general-audience game never shows (Gemini's own safety filters run first). */
const UNSAFE = /\b(damn|hell|crap|stupid|idiot|kill|die|dead|hate|sex|drunk)\b/i;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').slice(0, max + 1) : '');

export type Verdict<T> = { ok: true; value: T; clamped: string[] } | { ok: false; reasons: string[] };
const reject = <T>(...reasons: string[]): Verdict<T> => ({ ok: false, reasons });

// ---------- Dialogue and reactions ----------

export interface CharacterDialogue {
  speaker: RoleId;
  line: string;
  reaction: Reaction;
  district?: string | null;
}

export interface DialogueContext {
  /** Who is on the map right now. */
  speakers: RoleId[];
  /** Everything the model was told; numbers in a line must come from here. */
  facts: unknown;
}

/** A speech bubble line: a known speaker, a known reaction, short, safe, and no invented numbers. */
export function validateDialogue(raw: unknown, ctx: DialogueContext): Verdict<CharacterDialogue> {
  if (!isObj(raw)) return reject('not an object');
  const speaker = raw.speaker;
  if (!isRoleId(speaker)) return reject(`unknown speaker ${String(speaker)}`);
  if (!ctx.speakers.includes(speaker)) return reject(`${speaker} is not on the map`);
  if (!isReaction(raw.reaction)) return reject(`reaction ${String(raw.reaction)} is not in the vocabulary`);
  const line = str(raw.line, 160);
  const words = wordCount(line);
  if (words < BUBBLE_WORDS.min || words > BUBBLE_WORDS.max) return reject(`${words} words (bubbles take ${BUBBLE_WORDS.min}-${BUBBLE_WORDS.max})`);
  if (line.length > 140) return reject('longer than 140 characters');
  if (UNSAFE.test(line)) return reject('not general-audience safe');
  const stray = strayNumbers(line, ctx.facts);
  if (stray.length) return reject(`numbers not in the facts: ${stray.join(', ')}`);
  const clamped: string[] = [];
  let district: string | null = null;
  if (raw.district !== undefined && raw.district !== null) {
    if (isDistrictId(raw.district)) district = raw.district;
    else clamped.push(`unknown district ${String(raw.district)} dropped`);
  }
  return { ok: true, value: { speaker, line, reaction: raw.reaction, district }, clamped };
}

export interface CharacterReaction {
  speaker: RoleId;
  reaction: Reaction;
  /** A district or proposal id it reacts to. */
  target?: string | null;
}

export function validateReaction(raw: unknown, ctx: { speakers: RoleId[]; board: Board | null }): Verdict<CharacterReaction> {
  if (!isObj(raw)) return reject('not an object');
  if (!isRoleId(raw.speaker) || !ctx.speakers.includes(raw.speaker)) return reject(`unknown speaker ${String(raw.speaker)}`);
  if (!isReaction(raw.reaction)) return reject(`reaction ${String(raw.reaction)} is not in the vocabulary`);
  const t = raw.target;
  if (t !== undefined && t !== null && !isDistrictId(t) && !ctx.board?.proposals.some((p) => p.id === t)) return reject(`unknown target ${String(t)}`);
  return { ok: true, value: { speaker: raw.speaker, reaction: raw.reaction, target: (t as string | null | undefined) ?? null }, clamped: [] };
}

/** Merge validated Gemini lines into the template bubbles of the same moment (template stays where a line failed). */
export function mergeDialogue(template: Bubble[], lines: CharacterDialogue[]): Bubble[] {
  return template.map((b) => {
    const l = lines.find((x) => x.speaker === b.speaker);
    return l ? { ...b, text: l.line, reaction: l.reaction, district: l.district ?? b.district, source: 'gemini' as const } : b;
  });
}

// ---------- Twist events ----------

export const EVENT_TYPES = ['sunny-day-flooding', 'beach-erosion', 'investor-interest', 'access-march', 'algae-bloom', 'federal-grant', 'surge-warning'] as const;
export type EventType = (typeof EVENT_TYPES)[number];
export const isEventType = (v: unknown): v is EventType => typeof v === 'string' && (EVENT_TYPES as readonly string[]).includes(v);
export type Tension = 'low' | 'medium' | 'high';

export interface EventSpec {
  type: EventType;
  title: string;
  /** Effect per point of magnitude (illustrative scenario values). */
  perMagnitude: Delta;
  /** District resilience change per point of magnitude. */
  resiliencePerMagnitude: number;
  /** Where it can happen, decided by the real facts. */
  where: (d: District) => { ok: boolean; reason: string };
  /** Template narrative (no numbers), used when the model's narrative is unusable. */
  narrative: (d: District) => string;
  fx: 'flood' | 'invest' | 'protest' | 'restore' | 'blocked';
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

/** The only twists there are. The model picks one and a place; the numbers come from here. */
export const DIRECTOR_EVENTS: Record<EventType, EventSpec> = {
  'sunny-day-flooding': {
    type: 'sunny-day-flooding', title: 'Sunny-day flooding', perMagnitude: { flood: -1 }, resiliencePerMagnitude: -4, fx: 'flood',
    where: (d) => ({ ok: d.sfhaShare >= 0.5, reason: `${pct(d.sfhaShare)} of ${d.name} is in FEMA's 1% flood area (needs 50%)` }),
    narrative: (d) => `Tide water bubbles up through the storm drains in ${d.name} on a cloudless afternoon.`,
  },
  'beach-erosion': {
    type: 'beach-erosion', title: 'Beach erosion', perMagnitude: { environment: -1, access: -1 }, resiliencePerMagnitude: -3, fx: 'flood',
    where: (d) => ({ ok: d.shore === 'ocean', reason: `${d.name} faces ${d.shore === 'ocean' ? 'the Atlantic' : 'Biscayne Bay, which has no surf beach'}` }),
    narrative: (d) => `Rough surf has carved a cliff into the beach at ${d.name}. Towels are moving back.`,
  },
  'investor-interest': {
    type: 'investor-interest', title: 'Investor interest', perMagnitude: { economy: 1, budget: 1 }, resiliencePerMagnitude: 0, fx: 'invest',
    where: (d) => ({ ok: d.hotelZoningShare >= 0.25, reason: `${pct(d.hotelZoningShare)} of ${d.name} is zoned hotel or commercial (needs 25%)` }),
    narrative: (d) => `Out-of-town investors are touring ${d.name} with clipboards and very nice shoes.`,
  },
  'access-march': {
    type: 'access-march', title: 'Beach access march', perMagnitude: { access: 1 }, resiliencePerMagnitude: 0, fx: 'protest',
    where: (d) => ({ ok: true, reason: `${d.name} is a public place` }),
    narrative: (d) => `Neighbors march to the sand in ${d.name} with signs that say the beach belongs to everyone.`,
  },
  'algae-bloom': {
    type: 'algae-bloom', title: 'Algae bloom', perMagnitude: { environment: -1, economy: -1 }, resiliencePerMagnitude: 0, fx: 'blocked',
    where: (d) => ({ ok: d.shore === 'bay', reason: `${d.name} faces ${d.shore === 'bay' ? 'Biscayne Bay' : 'the open Atlantic, where blooms rarely sit'}` }),
    narrative: (d) => `A green film spreads along the bay off ${d.name}. The fish are not impressed.`,
  },
  'federal-grant': {
    type: 'federal-grant', title: 'Resilience grant offer', perMagnitude: { budget: 2 }, resiliencePerMagnitude: 0, fx: 'invest',
    where: (d) => ({ ok: d.sfhaShare >= 0.5, reason: `${pct(d.sfhaShare)} of ${d.name} is in FEMA's 1% flood area (needs 50%)` }),
    narrative: (d) => `A grant program takes an interest in flood-prone ${d.name}. The paperwork is enormous.`,
  },
  'surge-warning': {
    type: 'surge-warning', title: 'Storm surge warning', perMagnitude: { flood: -1 }, resiliencePerMagnitude: -5, fx: 'flood',
    where: (d) => ({ ok: coastalHighHazard(d), reason: coastalHighHazard(d) ? `${d.name} borders a FEMA VE coastal high hazard zone` : `${d.name} does not border a FEMA VE coastal high hazard zone` }),
    narrative: (d) => `Forecasters warn of storm surge along the coastal high hazard edge of ${d.name}.`,
  },
};

export const EVENT_RULES = {
  /** Twists happen at the crisis of these rounds and take effect when play starts. */
  rounds: [2, 3],
  magnitude: { min: 1, max: 3 },
  /** At most this many twists per match, each type once. */
  perMatch: 2,
  narrativeMax: 200,
} as const;

export interface EventProposal {
  type: EventType;
  district: string;
  magnitude: number;
  narrative: string;
  tension: Tension;
}

/** A twist that passed validation: exact effects, ready to apply and to replay. */
export interface AcceptedEvent {
  id: string;
  round: number;
  type: EventType;
  title: string;
  district: string;
  magnitude: number;
  narrative: string;
  tension: Tension;
  delta: Delta;
  resilience: number;
  source: 'gemini' | 'template';
  /** Always true: twists are game fiction, never reports of real events. */
  fictional: true;
}

export interface EventContext {
  round: number;
  phase: string;
  /** Types already used this match. */
  fired: EventType[];
  /** Twists already accepted this match. */
  count: number;
}

const scale = (d: Delta, k: number): Delta => Object.fromEntries(Object.entries(d).map(([key, v]) => [key, v! * k])) as Delta;

export function validateEventProposal(raw: unknown, ctx: EventContext, source: AcceptedEvent['source']): Verdict<AcceptedEvent> {
  if (!isObj(raw)) return reject('not an object');
  if (!(EVENT_RULES.rounds as readonly number[]).includes(ctx.round)) return reject(`no twists in round ${ctx.round}`);
  if (ctx.phase !== 'crisis') return reject(`twists are proposed during the crisis, not ${ctx.phase}`);
  if (ctx.count >= EVENT_RULES.perMatch) return reject('this match already had its twists');
  if (!isEventType(raw.type)) return reject(`unknown event type ${String(raw.type)}`);
  if (ctx.fired.includes(raw.type)) return reject(`${raw.type} already happened this match`);
  if (!isDistrictId(raw.district)) return reject(`unknown district ${String(raw.district)}`);
  const spec = DIRECTOR_EVENTS[raw.type];
  const d = districtById(raw.district);
  const where = spec.where(d);
  if (!where.ok) return reject(`not here: ${where.reason}`);
  if (typeof raw.magnitude !== 'number' || !Number.isFinite(raw.magnitude)) return reject('magnitude is not a number');
  const clamped: string[] = [];
  let magnitude = Math.round(raw.magnitude);
  if (magnitude !== raw.magnitude) clamped.push(`magnitude ${raw.magnitude} rounded to ${magnitude}`);
  if (magnitude < EVENT_RULES.magnitude.min || magnitude > EVENT_RULES.magnitude.max) {
    const m = Math.min(EVENT_RULES.magnitude.max, Math.max(EVENT_RULES.magnitude.min, magnitude));
    clamped.push(`magnitude ${magnitude} clamped to ${m}`);
    magnitude = m;
  }
  let narrative = str(raw.narrative, EVENT_RULES.narrativeMax);
  if (!narrative || narrative.length > EVENT_RULES.narrativeMax || /\d/.test(narrative) || UNSAFE.test(narrative)) {
    clamped.push('narrative replaced by the template (empty, too long, unsafe or with numbers)');
    narrative = spec.narrative(d);
  }
  const tension: Tension = raw.tension === 'low' || raw.tension === 'medium' || raw.tension === 'high' ? raw.tension : 'medium';
  return {
    ok: true,
    clamped,
    value: {
      id: `ev-r${ctx.round}-${raw.type}`, round: ctx.round, type: raw.type, title: spec.title, district: d.id, magnitude, narrative, tension,
      delta: scale(spec.perMagnitude, magnitude), resilience: spec.resiliencePerMagnitude * magnitude, source, fictional: true,
    },
  };
}

/** The deterministic twist when Gemini is off, slow or wrong: one fixed choice per round, on real facts. */
export function templateEventProposal(round: number, fired: EventType[]): EventProposal | null {
  const plan: Record<number, EventType[]> = { 2: ['investor-interest', 'access-march'], 3: ['surge-warning', 'sunny-day-flooding'] };
  for (const type of plan[round] ?? []) {
    if (fired.includes(type)) continue;
    const d = DISTRICT_IDS.map(districtById).find((x) => DIRECTOR_EVENTS[type].where(x).ok);
    if (d) return { type, district: d.id, magnitude: 2, narrative: DIRECTOR_EVENTS[type].narrative(d), tension: 'medium' };
  }
  return null;
}

/** Apply an accepted twist to the city. Pure: replays call this with the stored event. */
export function applyDirectorEvent(city: CityState, ev: AcceptedEvent): { city: CityState; event: RuleEvent } {
  const indicators = { ...city.indicators };
  for (const k of INDICATORS) {
    const v = ev.delta[k];
    if (!v) continue;
    indicators[k] = k === 'budget' ? Math.max(0, indicators[k] + v) : Math.max(0, Math.min(100, indicators[k] + v));
  }
  const districts = Object.fromEntries(Object.entries(city.districts).map(([id, s]) => [id, { ...s, features: [...s.features] }]));
  const ds = districts[ev.district];
  if (ds) ds.resilience = Math.max(0, Math.min(100, ds.resilience + ev.resilience));
  const effect = Object.entries(ev.delta).map(([k, v]) => `${v! > 0 ? '+' : '−'}${k === 'budget' ? '$' : ''}${Math.abs(v!)}${k === 'budget' ? 'M' : ''} ${k}`).join(', ');
  return {
    city: { ...city, indicators, districts },
    event: {
      id: `${ev.id}-d1`, rule: 'D1', district: ev.district, delta: ev.delta,
      text: `Game event (fictional): ${ev.title} in ${districtById(ev.district).name}. ${effect}${ev.resilience ? `, area resilience ${ev.resilience}` : ''} (illustrative).`,
    },
  };
}

// ---------- Negotiation hints and combos in reach ----------

export interface TablePlayer {
  seat: number;
  persona: PersonaId;
  influence: number;
  /** Already used their move this round. */
  moved: boolean;
}

/** A move that would change a proposal's fate, worked out by running the engine. */
export interface MoveCandidate {
  id: string;
  kind: 'move' | 'accept';
  seat: number;
  persona: PersonaId;
  move: NegotiationMove | 'accept';
  proposalId: string;
  compromiseId: string | null;
  from: OutcomeStatus;
  to: OutcomeStatus;
}

/** Every single move or acceptance that flips a proposal's outcome right now. */
export function negotiationCandidates(board: Board, actions: NegotiationAction[], city: CityState, players: TablePlayer[]): MoveCandidate[] {
  const now = resolveRound(board, actions, city);
  const status = (r: ReturnType<typeof resolveRound>, id: string) => r.outcomes.find((o) => o.proposalId === id)!.status;
  const out: MoveCandidate[] = [];
  for (const pl of [...players].sort((a, b) => a.seat - b.seat)) {
    if (pl.moved) continue;
    for (const p of board.proposals) {
      for (const move of ['back', 'oppose', 'fund'] as NegotiationMove[]) {
        if (checkMove(board, pl.seat, pl.influence, move, p.id)) continue;
        const next = resolveRound(board, [...actions, { seat: pl.seat, persona: pl.persona, move, proposalId: p.id }], city);
        const from = status(now, p.id);
        const to = status(next, p.id);
        if (from !== to) out.push({ id: `${pl.seat}-${move}-${p.id}`, kind: 'move', seat: pl.seat, persona: pl.persona, move, proposalId: p.id, compromiseId: null, from, to });
      }
    }
  }
  for (const c of board.compromises.filter((x) => !x.accepted)) {
    const owner = players.find((x) => x.seat === c.owner);
    if (!owner || checkAccept(board, c.owner, c.id)) continue;
    const trial = { ...board, compromises: board.compromises.map((x) => (x.id === c.id ? { ...x, accepted: true } : x)) };
    const from = status(now, c.proposalId);
    const to = status(resolveRound(trial, actions, city), c.proposalId);
    if (from !== to) out.push({ id: `${c.owner}-accept-${c.id}`, kind: 'accept', seat: c.owner, persona: owner.persona, move: 'accept', proposalId: c.proposalId, compromiseId: c.id, from, to });
  }
  return out;
}

export interface ComboInReach {
  combo: ComboId;
  proposalIds: string[];
  /** What still has to happen, in words. */
  needs: string;
}

/** Authored combos whose pairing is on the table: they complete if the proposals are approved. */
export function combosInReach(board: Board): ComboInReach[] {
  const out: ComboInReach[] = [];
  const name = (id: string) => {
    const p = board.proposals.find((x) => x.id === id)!;
    return `the ${PROJECTS[p.kind].name.toLowerCase()} in ${districtById(p.district).name}`;
  };
  for (const p of board.proposals) {
    const on = board.attachments.filter((a) => a.proposalId === p.id).map((a) => a.card);
    const offers = board.compromises.filter((c) => c.proposalId === p.id);
    if ((p.kind === 'drainage' || p.kind === 'seawall') && on.includes('private-investment')) out.push({ combo: 'public-private-flood', proposalIds: [p.id], needs: `${name(p.id)} must be approved` });
    if (p.kind === 'shoreline' && on.includes('emergency-funding')) out.push({ combo: 'grant-match', proposalIds: [p.id], needs: `${name(p.id)} must be approved` });
    if ((p.kind === 'hotel' || p.kind === 'marina') && offers.some((c) => c.kind === 'setback' || c.kind === 'green')) out.push({ combo: 'eco-resort', proposalIds: [p.id], needs: `the owner accepts the green condition and ${name(p.id)} is approved` });
    if (p.kind === 'marina' && offers.some((c) => c.kind === 'access')) out.push({ combo: 'working-waterfront', proposalIds: [p.id], needs: `the owner accepts the public access guarantee and ${name(p.id)} is approved` });
  }
  for (const d of DISTRICT_IDS) {
    const here = board.proposals.filter((x) => x.district === d);
    const wall = here.find((x) => x.kind === 'seawall');
    const green = here.find((x) => x.kind === 'shoreline' || x.kind === 'dune');
    if (wall && green) out.push({ combo: 'hybrid-shoreline', proposalIds: [wall.id, green.id], needs: `both ${name(wall.id)} and ${name(green.id)} are approved` });
    const homes = here.find((x) => x.kind === 'elevate');
    const grey = here.find((x) => x.kind === 'drainage' || x.kind === 'seawall');
    if (homes && grey) out.push({ combo: 'resilience-package', proposalIds: [homes.id, grey.id], needs: `both ${name(homes.id)} and ${name(grey.id)} are approved` });
  }
  return out;
}

/** A hint on the negotiating table. Public: everyone sees the same hints. */
export interface TableHint {
  id: string;
  kind: 'move' | 'accept' | 'combo';
  text: string;
  proposalId: string;
  seat: number | null;
  move: NegotiationMove | 'accept' | null;
  compromiseId: string | null;
  combo: ComboId | null;
  source: 'template' | 'gemini';
}

const STATUS_WORD: Record<OutcomeStatus, string> = { approved: 'approved', blocked: 'blocked', rejected: 'voted down', delayed: 'delayed', unfunded: 'unfunded' };
const MOVE_WORD: Record<NegotiationMove, string> = { back: 'backing', oppose: 'opposing', fund: 'funding' };
export const HINTS_MAX = 4;

/** Deterministic hints: the moves that flip an outcome, then the combos in reach. */
export function templateHints(board: Board, candidates: MoveCandidate[], reach: ComboInReach[]): TableHint[] {
  const label = (id: string) => {
    const p = board.proposals.find((x) => x.id === id)!;
    return `the ${PROJECTS[p.kind].name.toLowerCase()} in ${districtById(p.district).name}`;
  };
  const moves: TableHint[] = candidates.map((c) => ({
    id: `h-${c.id}`, kind: c.kind, proposalId: c.proposalId, seat: c.seat, move: c.move, compromiseId: c.compromiseId, combo: null, source: 'template',
    text: c.kind === 'accept'
      ? `If the ${PERSONA_INFO[c.persona].name} accepts "${board.compromises.find((x) => x.id === c.compromiseId)!.title}", ${label(c.proposalId)} goes from ${STATUS_WORD[c.from]} to ${STATUS_WORD[c.to]}.`
      : `The ${PERSONA_INFO[c.persona].name} ${MOVE_WORD[c.move as NegotiationMove]} it (${NEGOTIATION_COST[c.move as NegotiationMove]} influence) turns ${label(c.proposalId)} from ${STATUS_WORD[c.from]} to ${STATUS_WORD[c.to]}.`,
  }));
  const combos: TableHint[] = reach.map((r) => ({
    id: `h-combo-${r.combo}-${r.proposalIds.join('+')}`, kind: 'combo', proposalId: r.proposalIds[0]!, seat: null, move: null, compromiseId: null, combo: r.combo, source: 'template',
    text: `Combo in reach: ${COMBOS[r.combo].name}, if ${r.needs}.`,
  }));
  // Acceptances first (they are free), then up to two combos in reach, then moves; at most HINTS_MAX.
  return [...moves.filter((m) => m.kind === 'accept'), ...combos.slice(0, 2), ...moves.filter((m) => m.kind === 'move')].slice(0, HINTS_MAX);
}

export interface NegotiationSuggestion {
  /** The id of a candidate hint (from the list the model was given). */
  hint: string;
  pitch: string;
}

/** Gemini may only pick hints from the candidate list and word them; it cannot invent a move. */
export function validateSuggestion(raw: unknown, candidates: TableHint[], facts: unknown): Verdict<TableHint> {
  if (!isObj(raw)) return reject('not an object');
  const c = candidates.find((x) => x.id === raw.hint);
  if (!c) return reject(`hint ${String(raw.hint)} is not one of the moves the engine found`);
  const pitch = str(raw.pitch, 180);
  if (!pitch || pitch.length > 180) return reject('pitch is empty or too long');
  if (UNSAFE.test(pitch)) return reject('not general-audience safe');
  const stray = strayNumbers(pitch, facts);
  if (stray.length) return reject(`numbers not in the facts: ${stray.join(', ')}`);
  return { ok: true, value: { ...c, text: pitch, source: 'gemini' }, clamped: [] };
}

export interface CardComboSuggestion {
  combo: ComboId;
  proposalIds: string[];
  explanation: string;
  /** A new idea the model had: never executed, only queued for human review. */
  novelIdea?: string | null;
}

export function validateComboSuggestion(raw: unknown, reach: ComboInReach[], facts: unknown): Verdict<CardComboSuggestion> {
  if (!isObj(raw)) return reject('not an object');
  if (!isComboId(raw.combo)) return reject(`unknown combo ${String(raw.combo)}`);
  const ids = Array.isArray(raw.proposalIds) ? raw.proposalIds.map(String).sort() : [];
  const match = reach.find((r) => r.combo === raw.combo && [...r.proposalIds].sort().join() === ids.join());
  if (!match) return reject(`${raw.combo} is not in reach for proposals ${ids.join(', ') || '(none)'}`);
  const explanation = str(raw.explanation, 200);
  if (!explanation || explanation.length > 200) return reject('explanation is empty or too long');
  const stray = strayNumbers(explanation, facts);
  if (stray.length) return reject(`numbers not in the facts: ${stray.join(', ')}`);
  const novel = str(raw.novelIdea, 300);
  return { ok: true, value: { combo: raw.combo, proposalIds: match.proposalIds, explanation, novelIdea: novel || null }, clamped: [] };
}

// ---------- Explanations ----------

export interface Explanation {
  question: string;
  /** Template answer straight from the engine and the GIS facts. */
  answer: string;
  /** The facts the answer may use (an LLM rewording may not add numbers beyond these). */
  facts: string[];
  source: 'template' | 'gemini';
}

/** "Why can't I play this here?" from the eligibility rule and the real measurements. */
export function explainEligibility(card: string, district: string): Explanation | null {
  if (!(card in CARDS) || !isDistrictId(district)) return null;
  const c = CARDS[card as keyof typeof CARDS];
  const d = districtById(district);
  const facts = [c.rule];
  let answer: string;
  if (c.project) {
    const ok = projectEligibility(c.project, d);
    facts.push(ok.reason);
    answer = ok.ok ? `${c.name} can go in ${d.name}: ${ok.reason}` : `${c.name} cannot go in ${d.name}: ${ok.reason} Card rule: ${c.rule}`;
  } else {
    answer = `${c.name} can be played anywhere; it acts on what is proposed in ${d.name}. ${c.rule}`;
  }
  return { question: `Why can or can't ${c.name} go in ${d.name}?`, answer, facts, source: 'template' };
}

/** "Why was this decided like that?" from the rule events of a resolved round. */
export function explainOutcome(proposalId: string, events: RuleEvent[], outcome: { status: OutcomeStatus; rules: string[] } | undefined): Explanation | null {
  if (!outcome) return null;
  const lines = outcome.rules.map((id) => events.find((e) => e.id === id)).filter((e): e is RuleEvent => !!e).map((e) => `${e.rule}: ${e.text}`);
  return {
    question: `Why was ${proposalId} ${STATUS_WORD[outcome.status]}?`,
    answer: `It was ${STATUS_WORD[outcome.status]}. The rules that decided it, in order: ${lines.join(' ')}`,
    facts: lines,
    source: 'template',
  };
}

/** The rounds a twist can happen in, for the UI. */
export const twistRounds = () => EVENT_RULES.rounds.filter((r) => r <= TOTAL_ROUNDS);
export const roleName = (r: RoleId) => roleInfo(r).name;
