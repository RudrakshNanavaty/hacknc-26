// The Coastal Clash room state machine (pattern from Mayday Mayor / pocket-rivals, MIT): synchronous
// actions validate and record input, tick(room, now) moves time. No sockets and no I/O in here, so
// it is easy to test; roomSocket.ts wires it to /ws/rooms/:code and drains room.effects (save the
// record, ask the narrator) after every change.
//
// lobby -> [crisis -> select -> reveal -> negotiate -> resolve] x3 -> final -> lobby
import { randomUUID } from 'node:crypto';
import {
  CARDS, MAX_PLAYERS, NEGOTIATION_COST, PERSONA_INFO, START_INDICATORS, START_INFLUENCE, TOTAL_ROUNDS,
  DISTRICT_IDS, PING_EMOTES, buildBoard, checkAccept, checkMove, checkPlay, crisisFor, crisisHeadline, finalHeadline, finalResult, isPersonaId, newMatchRecord,
  nextInfluence, resolutionHeadline, resolveRound, revealHeadline, startCity, botPlay, districtById, authoredScenario,
  crisisBubbles, finalBubbles, resolutionBubbles, revealBubbles,
  EVENT_RULES, applyDirectorEvent, combosInReach, mergeDialogue, negotiationCandidates, templateEventProposal, templateHints,
  validateComboSuggestion, validateDialogue, validateEventProposal, validateSuggestion,
  type AcceptedEvent, type CharacterDialogue, type DirectorLogEntry, type EventType, type RoleId, type RuleEvent, type TableHint,
  type Board, type CardId, type CityState, type Crisis, type FinalResult, type Headline, type MatchRecord, type NegotiationAction,
  type Bubble, type Ping, type PingEmote, type PersonaId, type Proposal, type Scenario, type RoomPhase, type RoomState, type RoundSummary, type SessionKind,
} from '@shared';

const ROOM_TTL_MS = 3 * 60 * 60 * 1000;
/** A player who drops (a reloading tab) still counts this long before a phase stops waiting for them. */
export const RECONNECT_GRACE_MS = 8_000;
/** No I or O, so codes read cleanly off a projector. */
export const CODE_RE = /^[A-HJ-NP-Z]{4}$/;

export class RoomError extends Error {}

export interface Player {
  id: string; // secret, lets a reloaded page resume
  seat: number;
  name: string;
  persona: PersonaId;
  connected: boolean;
  /** When they dropped (null while connected). */
  leftAt: number | null;
  bot: boolean;
  influence: number;
  selection: { card: CardId; district: string } | null;
  moved: boolean;
  done: boolean;
  responded: string | null;
  /** When they last pinged (rate limit). */
  lastPing: number | null;
}

/** Side effects for the socket layer, drained after every change. */
export type Effect =
  | { t: 'scenario' }
  | { t: 'crisis'; key: string; round: number }
  | { t: 'negotiate'; key: string }
  | { t: 'reveal'; key: string }
  | { t: 'resolved'; key: string; round: number }
  | { t: 'final'; key: string }
  | { t: 'record' };

export interface Room {
  code: string;
  phase: RoomPhase;
  round: number;
  endsAt: number | null;
  players: Player[];
  hostId: string | null;
  sessionKind: SessionKind;
  touchedAt: number;
  matchId: string | null;
  record: MatchRecord | null;
  city: CityState;
  crisis: Crisis | null;
  /** This match's three crises and card lines; null until written. */
  scenario: Scenario | null;
  carried: Proposal[];
  board: Board | null;
  actions: NegotiationAction[];
  history: RoundSummary[];
  /** The last round resolved: a round can never resolve twice. */
  resolvedRound: number;
  headline: Headline | null;
  bubbles: { key: string; list: Bubble[] } | null;
  final: FinalResult | null;
  effects: Effect[];
  /** This round's twist (validated), shown from the crisis and applied when play starts. */
  event: AcceptedEvent | null;
  eventApplied: RuleEvent | null;
  firedEvents: EventType[];
  /** Public hints on the negotiating table. */
  hints: { key: string; list: TableHint[] } | null;
  /** Every hint shown this round (latest wording), for the record. */
  hintLog: Map<string, TableHint>;
  /** A twist proposal that arrived before its crisis (prefetched): validated when that crisis starts. */
  earlyEvent: { round: number; raw: unknown } | null;
  /** Director proposals this round and what validation did (flushed into the round record). */
  directorLog: DirectorLogEntry[];
}

export const rooms = new Map<string, Room>();

export function newRoom(code: string, now = Date.now()): Room {
  return {
    code, phase: 'lobby', round: 0, endsAt: null, players: [], hostId: null, sessionKind: 'demo', touchedAt: now,
    matchId: null, record: null, city: startCity(), crisis: null, scenario: null, carried: [], board: null, actions: [], history: [], resolvedRound: 0,
    headline: null, bubbles: null, final: null, effects: [],
    event: null, eventApplied: null, firedEvents: [], hints: null, hintLog: new Map(), earlyEvent: null, directorLog: [],
  };
}

export function getOrCreateRoom(code: string, now = Date.now()): Room {
  const c = code.toUpperCase();
  if (!CODE_RE.test(c)) throw new RoomError('Room codes are 4 letters.');
  let room = rooms.get(c);
  if (!room) {
    room = newRoom(c, now);
    rooms.set(c, room);
  }
  return room;
}

export function getRoom(code: string): Room {
  const room = rooms.get(code.toUpperCase());
  if (!room) throw new RoomError('Room not found. Check the code with the host.');
  return room;
}

const touch = (room: Room, now = Date.now()) => void (room.touchedAt = now);
const humans = (room: Room) => room.players.filter((p) => !p.bot);
const present = (room: Room, now: number) => room.players.filter((p) => p.bot || p.connected || (p.leftAt !== null && now - p.leftAt < RECONNECT_GRACE_MS));
const hostSeat = (room: Room) => room.players.find((p) => p.id === room.hostId)?.seat ?? 0;
const renumber = (room: Room) => room.players.forEach((p, i) => (p.seat = i));

function cleanName(name: unknown): string {
  const n = String(name ?? '').trim().replace(/\s+/g, ' ').slice(0, 20);
  if (!n) throw new RoomError('Enter your name.');
  return n;
}

function checkPersona(room: Room, persona: unknown, self?: Player): PersonaId {
  if (!isPersonaId(persona)) throw new RoomError('Pick a stakeholder.');
  if (room.players.some((p) => p !== self && p.persona === persona)) throw new RoomError(`The ${PERSONA_INFO[persona].name} is taken.`);
  return persona;
}

const newPlayer = (seat: number, name: string, persona: PersonaId, bot: boolean): Player => ({
  id: randomUUID(), seat, name, persona, connected: !bot, leftAt: null, bot, influence: START_INFLUENCE, selection: null, moved: false, done: false, responded: null, lastPing: null,
});

/** A bot holding this persona gives it up to a person. */
function freeFromBot(room: Room, persona: unknown): void {
  const bot = room.players.find((p) => p.bot && p.persona === persona);
  if (bot) room.players.splice(room.players.indexOf(bot), 1);
  renumber(room);
}

/** Join as a stakeholder. Lobby only, so everyone plays the whole match. */
export function join(room: Room, name: unknown, persona: unknown): Player {
  if (room.phase !== 'lobby') throw new RoomError('This match is under way. Join when the next one opens.');
  const n = cleanName(name);
  if (room.players.some((p) => !p.bot && p.name.toLowerCase() === n.toLowerCase())) throw new RoomError('Someone here already has that name.');
  if (!isPersonaId(persona)) throw new RoomError('Pick a stakeholder.');
  if (room.players.some((p) => !p.bot && p.persona === persona)) throw new RoomError(`The ${PERSONA_INFO[persona].name} is taken.`);
  const bots = room.players.filter((p) => p.bot).length;
  if (room.players.length >= MAX_PLAYERS && !room.players.some((p) => p.bot && p.persona === persona)) {
    throw new RoomError(bots ? 'The room is full: pick a stakeholder a bot is playing.' : `The room is full (${MAX_PLAYERS} stakeholders).`);
  }
  freeFromBot(room, persona);
  const player = newPlayer(room.players.length, n, persona, false);
  room.players.push(player);
  renumber(room);
  if (!room.hostId || !room.players.some((p) => p.id === room.hostId)) room.hostId = player.id;
  touch(room);
  return player;
}

export function findPlayer(room: Room, playerId: unknown): Player {
  const p = room.players.find((x) => x.id === playerId && !x.bot);
  if (!p) throw new RoomError('You are not in this room.');
  return p;
}

export function choosePersona(room: Room, player: Player, persona: unknown): void {
  if (room.phase !== 'lobby') throw new RoomError('Stakeholders are set until the next match.');
  // Take over a bot's persona: the bot leaves.
  if (room.players.some((p) => p.bot && p.persona === persona)) freeFromBot(room, persona);
  player.persona = checkPersona(room, persona, player);
  touch(room);
}

const requireHost = (room: Room, player: Player) => {
  if (player.id !== room.hostId) throw new RoomError('Only the host can do that.');
};

/** Host, lobby: fill an empty stakeholder with a bot (or remove it). */
export function setBot(room: Room, player: Player, persona: unknown, on: boolean): void {
  requireHost(room, player);
  if (room.phase !== 'lobby') throw new RoomError('Bots join between matches.');
  if (!isPersonaId(persona)) throw new RoomError('Pick a stakeholder.');
  const existing = room.players.find((p) => p.persona === persona);
  if (on) {
    if (existing) throw new RoomError(`The ${PERSONA_INFO[persona].name} is taken.`);
    if (room.players.length >= MAX_PLAYERS) throw new RoomError('The room is full.');
    room.players.push(newPlayer(room.players.length, `${PERSONA_INFO[persona].title.split(/[ ,]/)[0]} (bot)`, persona, true));
  } else {
    if (!existing?.bot) throw new RoomError('That stakeholder is not a bot.');
    room.players.splice(room.players.indexOf(existing), 1);
  }
  renumber(room);
  touch(room);
}

export function setSession(room: Room, player: Player, kind: unknown): void {
  requireHost(room, player);
  if (room.phase !== 'lobby') throw new RoomError('Set the session type before the match.');
  if (kind !== 'demo' && kind !== 'community') throw new RoomError('Unknown session type.');
  room.sessionKind = kind;
  touch(room);
}

/** How long the first crisis waits for the live desk before the authored scenario stands in. */
export const SCENARIO_WAIT_MS = 10_000;

/** The host starts the match. */
export function start(room: Room, player: Player, now: number): void {
  requireHost(room, player);
  if (room.phase !== 'lobby') throw new RoomError('The match already started.');
  if (!humans(room).some((p) => p.connected)) throw new RoomError('Waiting for players to join.');
  room.matchId = randomUUID();
  room.record = newMatchRecord(room.matchId, room.code, room.sessionKind, room.players.map((p) => ({ seat: p.seat, name: p.name, persona: p.persona, participant: p.bot ? 'bot' : 'human' })), new Date(now));
  room.city = startCity();
  room.carried = [];
  room.history = [];
  room.resolvedRound = 0;
  room.final = null;
  room.firedEvents = [];
  room.earlyEvent = null;
  room.directorLog = [];
  room.round = 1;
  room.scenario = null;
  for (const p of room.players) {
    p.influence = START_INFLUENCE;
    p.responded = null;
  }
  room.effects.push({ t: 'scenario' }, { t: 'record' });
  enterCrisis(room, now);
}

function enterCrisis(room: Room, now: number): void {
  room.phase = 'crisis';
  room.crisis = room.scenario?.crises[room.round - 1] ?? null;
  room.board = null;
  room.actions = [];
  if (room.round > 1) for (const p of room.players) p.influence = nextInfluence(p.influence);
  for (const p of room.players) {
    p.selection = null;
    p.moved = false;
    p.done = p.bot;
  }
  // This round's Director state starts empty, even while the scenario is still being written.
  room.bubbles = null;
  room.hints = null;
  room.event = null;
  room.eventApplied = null;
  if (room.crisis) showCrisis(room, now);
  else {
    room.headline = { text: 'Coastal Clash Live is checking the tide gauge and the forecast for Miami Beach…', source: 'template', key: 'crisis-wait' };
    room.endsAt = now + SCENARIO_WAIT_MS;
  }
  touch(room, now);
}

/** The round's crisis is on screen: headline, the characters' first lines, and this round's twist. */
function showCrisis(room: Room, now: number): void {
  const crisis = room.crisis!;
  room.headline = { text: crisisHeadline(crisis, room.round), source: crisis.source === 'gemini' ? 'gemini' : 'template', key: `crisis-${room.round}` };
  room.bubbles = { key: `crisis-${room.round}`, list: crisisBubbles(crisis, room.players.map((p) => p.persona)) };
  // A twist for this round that fits its crisis: the deterministic template now; Gemini may propose a better one.
  const proposal = templateEventProposal(room.round, room.firedEvents, crisis);
  if (proposal) {
    const v = validateEventProposal(proposal, eventContext(room), 'template');
    if (v.ok) room.event = v.value;
    logDirector(room, 'event', 'template', v, now, proposal);
  }
  // A Gemini proposal fetched during the last resolution is validated now, against this crisis.
  const early = room.earlyEvent;
  room.earlyEvent = null;
  if (early && early.round === room.round) proposeEvent(room, `crisis-${room.round}`, early.raw, now);
  room.effects.push({ t: 'crisis', key: `crisis-${room.round}`, round: room.round });
  room.endsAt = null;
}

/** The match's scenario has been written (or the authored one stands in). First one wins. */
export function applyScenario(room: Room, scenario: Scenario, now: number): void {
  if (room.scenario || !room.matchId) return;
  room.scenario = scenario;
  if (room.record) {
    room.record.scenarioSource = scenario.source;
    room.record.live = scenario.live;
  }
  if (room.phase === 'crisis' && !room.crisis) {
    room.crisis = scenario.crises[room.round - 1] ?? crisisFor(room.round);
    showCrisis(room, now);
  }
  touch(room, now);
}

const eventContext = (room: Room) => ({ round: room.round, phase: room.phase, fired: room.firedEvents, count: room.firedEvents.length });

function logDirector(room: Room, kind: DirectorLogEntry['kind'], source: DirectorLogEntry['source'], v: { ok: boolean; reasons?: string[]; clamped?: string[] }, now: number, proposal?: unknown) {
  const reasons = v.ok ? (v as { clamped: string[] }).clamped : (v as { reasons: string[] }).reasons;
  const entry: DirectorLogEntry = { kind, source, status: !v.ok ? 'rejected' : reasons.length ? 'clamped' : 'accepted', reasons, ...(proposal !== undefined ? { proposal } : {}), at: new Date(now).toISOString() };
  // During a resolution or the final screen the round is already recorded: file the entry there, and save.
  const recorded = room.phase === 'resolve' || room.phase === 'final' ? room.record?.rounds.at(-1)?.director : undefined;
  if (recorded) {
    recorded.log.push(entry);
    room.effects.push({ t: 'record' });
  } else room.directorLog.push(entry);
}

/** A twist proposal for a coming round, kept until its crisis starts (then validated like any other). */
export function proposeEarlyEvent(room: Room, round: number, raw: unknown): boolean {
  if (round <= room.round || room.phase === 'final' || room.phase === 'lobby') return false;
  room.earlyEvent = { round, raw };
  return true;
}

/** Gemini proposes this round's twist. Validated against the moment; replaces the template only if it passes. */
export function proposeEvent(room: Room, key: string, raw: unknown, now: number): boolean {
  if (key !== `crisis-${room.round}` || room.eventApplied) return false;
  const v = validateEventProposal(raw, eventContext(room), 'gemini');
  logDirector(room, 'event', 'gemini', v, now, raw);
  if (!v.ok) return false;
  room.event = v.value;
  touch(room, now);
  return true;
}

/** The roles standing on the map right now. */
export const mapRoles = (room: Room): RoleId[] => room.players.map((p) => p.persona);

/** Gemini lines for the current moment's bubbles. Each line is validated; failures keep the template line. */
export function applyDialogue(room: Room, key: string, raw: unknown[], facts: unknown, now: number): number {
  if (room.bubbles?.key !== key) return 0;
  const speakers = mapRoles(room);
  const good: CharacterDialogue[] = [];
  for (const r of raw.slice(0, 8)) {
    const v = validateDialogue(r, { speakers, facts });
    if (v.ok && !good.some((g) => g.speaker === v.value.speaker)) good.push(v.value);
    logDirector(room, 'dialogue', 'gemini', v, now);
  }
  if (!good.length) return 0;
  room.bubbles = { key, list: mergeDialogue(room.bubbles.list, good) };
  touch(room, now);
  return good.length;
}

/** Fresh hints from the engine; Gemini wording survives for hints that are still valid. */
function refreshHints(room: Room): void {
  if (room.phase !== 'negotiate' || !room.board) return;
  // Only players who can still act get move hints (bots and finished players are done).
  const players = room.players.map((p) => ({ seat: p.seat, persona: p.persona, influence: p.influence, moved: p.moved || p.done }));
  const list = templateHints(room.board, negotiationCandidates(room.board, room.actions, room.city, players), combosInReach(room.board));
  const old = new Map((room.hints?.list ?? []).map((h) => [h.id, h]));
  room.hints = { key: room.hints?.key ?? `negotiate-${room.round}`, list: list.map((h) => (old.get(h.id)?.source === 'gemini' ? old.get(h.id)! : h)) };
  for (const h of room.hints.list) room.hintLog.set(h.id, h);
}

/** Gemini words the hints (and may explain a combo in reach). It can only pick from what the engine found. */
export function applyHints(room: Room, key: string, raw: { suggestions?: unknown[]; combos?: unknown[] }, facts: unknown, now: number): number {
  if (room.hints?.key !== key || room.phase !== 'negotiate' || !room.board) return 0;
  let n = 0;
  const list = [...room.hints.list];
  for (const s of (raw.suggestions ?? []).slice(0, 8)) {
    const v = validateSuggestion(s, list, facts);
    logDirector(room, 'hint', 'gemini', v, now);
    if (!v.ok) continue;
    list[list.findIndex((h) => h.id === v.value.id)] = v.value;
    n += 1;
  }
  const reach = combosInReach(room.board);
  for (const c of (raw.combos ?? []).slice(0, 4)) {
    const v = validateComboSuggestion(c, reach, facts);
    logDirector(room, 'combo', 'gemini', v, now);
    if (!v.ok) continue;
    const i = list.findIndex((h) => h.kind === 'combo' && h.combo === v.value.combo);
    if (i >= 0) {
      list[i] = { ...list[i]!, text: v.value.explanation, source: 'gemini' };
      n += 1;
    }
    if (v.value.novelIdea && room.record) room.record.reviewQueue = [...(room.record.reviewQueue ?? []), { round: room.round, idea: v.value.novelIdea, source: 'gemini', at: new Date(now).toISOString() }];
  }
  room.hints = { key, list };
  for (const h of list) room.hintLog.set(h.id, h);
  touch(room, now);
  return n;
}

function enterSelect(room: Room, now: number): void {
  // The twist takes effect as play starts (rule D1): exact, validated values.
  if (room.event && !room.eventApplied && room.event.round === room.round) {
    const applied = applyDirectorEvent(room.city, room.event);
    room.city = applied.city;
    room.eventApplied = applied.event;
    room.firedEvents.push(room.event.type);
  }
  room.phase = 'select';
  room.endsAt = null;
  for (const p of room.players.filter((x) => x.bot)) p.selection = botPlay(p.persona, p.influence, room.round, room.crisis ?? undefined);
  touch(room, now);
  maybeReveal(room, now);
}

/** A stakeholder locks a card and a target. Final: one card per round. */
export function select(room: Room, player: Player, card: unknown, district: unknown, now: number): void {
  if (room.phase !== 'select') throw new RoomError('Cards are played in the selection phase.');
  if (player.selection) throw new RoomError('Your card is already locked in.');
  const problem = checkPlay(player.persona, player.influence, card, district, room.round, room.crisis);
  if (problem) throw new RoomError(problem);
  player.selection = { card: card as CardId, district: String(district) };
  touch(room, now);
  maybeReveal(room, now);
}

function maybeReveal(room: Room, now: number): void {
  const here = present(room, now);
  if (room.phase === 'select' && here.length && here.every((p) => p.selection || (p.bot && botPlay(p.persona, p.influence, room.round, room.crisis ?? undefined) === null))) enterReveal(room, now);
}

function enterReveal(room: Room, now: number): void {
  const plays = room.players.flatMap((p) => {
    if (!p.selection) return [];
    // Re-checked at reveal: influence cannot have changed, but the rule is the rule.
    if (checkPlay(p.persona, p.influence, p.selection.card, p.selection.district, room.round, room.crisis)) return [];
    p.influence -= CARDS[p.selection.card].cost;
    return [{ seat: p.seat, persona: p.persona, card: p.selection.card, district: p.selection.district }];
  });
  room.board = buildBoard(room.round, plays, room.carried, room.crisis ?? crisisFor(room.round));
  room.phase = 'reveal';
  room.endsAt = null;
  for (const p of room.players) p.done = p.bot;
  const key = `reveal-${room.round}`;
  room.headline = { text: revealHeadline(room.board), source: 'template', key };
  room.bubbles = { key, list: revealBubbles(room.board) };
  room.effects.push({ t: 'reveal', key });
  touch(room, now);
}

function enterNegotiate(room: Room, now: number): void {
  // Nothing to negotiate over: go straight to the resolution.
  if (!room.board?.proposals.length) return enterResolve(room, now);
  room.phase = 'negotiate';
  room.endsAt = null;
  for (const p of room.players) {
    p.moved = false;
    p.done = p.bot;
  }
  // Bots take the compromise offered to them: a deal beats a fight.
  for (const c of room.board.compromises) if (room.players[c.owner]?.bot) c.accepted = true;
  const key = `negotiate-${room.round}`;
  room.hints = { key, list: [] };
  refreshHints(room);
  room.effects.push({ t: 'negotiate', key });
  touch(room, now);
  maybeResolve(room, now);
}

/** Negotiation: back, oppose or fund one proposal (one move per round). */
export function move(room: Room, player: Player, mv: unknown, proposalId: unknown, now: number): void {
  if (room.phase !== 'negotiate' || !room.board) throw new RoomError('Moves are made during negotiation.');
  if (player.moved) throw new RoomError('You already made your move this round.');
  const problem = checkMove(room.board, player.seat, player.influence, mv, proposalId);
  if (problem) throw new RoomError(problem);
  const m = mv as keyof typeof NEGOTIATION_COST;
  player.influence -= NEGOTIATION_COST[m];
  player.moved = true;
  room.actions.push({ seat: player.seat, persona: player.persona, move: m, proposalId: String(proposalId) });
  refreshHints(room);
  touch(room, now);
}

/** Negotiation: the proposal's owner accepts a compromise offered to them. */
export function accept(room: Room, player: Player, compromiseId: unknown, now: number): void {
  if (room.phase !== 'negotiate' || !room.board) throw new RoomError('Compromises are accepted during negotiation.');
  const problem = checkAccept(room.board, player.seat, compromiseId);
  if (problem) throw new RoomError(problem);
  room.board.compromises.find((c) => c.id === compromiseId)!.accepted = true;
  refreshHints(room);
  touch(room, now);
}

/** Pings are relayed, not stored; a player can send one every this long (faster ones are dropped). */
export const PING_GAP_MS = 1_500;

/** A reaction on an area at the negotiating table. Returns null when it is dropped by the rate limit. */
export function ping(room: Room, player: Player, district: unknown, emote: unknown, now: number): Ping | null {
  if (room.phase !== 'negotiate') throw new RoomError('Reactions are for the negotiating table.');
  if (typeof district !== 'string' || !DISTRICT_IDS.includes(district)) throw new RoomError('Unknown area.');
  if (!PING_EMOTES.includes(emote as PingEmote)) throw new RoomError('Unknown reaction.');
  if (player.lastPing !== null && now - player.lastPing < PING_GAP_MS) return null;
  player.lastPing = now;
  return { seat: player.seat, district, emote: emote as PingEmote, at: now };
}

/** Ready for the next step. The table moves on when every present player is: there is no clock. */
export function done(room: Room, player: Player, now: number): void {
  if (!WAITING.includes(room.phase) || (room.phase === 'crisis' && !room.crisis)) throw new RoomError('Nothing to finish right now.');
  player.done = true;
  if (room.phase === 'negotiate') refreshHints(room);
  touch(room, now);
  maybeResolve(room, now);
  maybeProceed(room, now);
}

/** Phases that end when everyone present has said they are ready (selection and negotiation have their own rules). */
const WAITING: RoomPhase[] = ['crisis', 'reveal', 'negotiate', 'resolve'];

function maybeProceed(room: Room, now: number): void {
  if (room.phase !== 'crisis' && room.phase !== 'reveal' && room.phase !== 'resolve') return;
  if (room.phase === 'crisis' && !room.crisis) return;
  const here = present(room, now);
  if (here.length && here.every((p) => p.done)) advance(room, now);
}

function maybeResolve(room: Room, now: number): void {
  const here = present(room, now);
  if (room.phase === 'negotiate' && here.length && here.every((p) => p.done)) enterResolve(room, now);
}

function enterResolve(room: Room, now: number): void {
  if (!room.board || room.resolvedRound >= room.round) return;
  room.resolvedRound = room.round;
  const resolution = resolveRound(room.board, room.actions, room.city);
  for (const [seat, n] of Object.entries(resolution.refunds)) {
    const p = room.players[Number(seat)];
    if (p) p.influence += n;
  }
  room.city = resolution.city;
  room.carried = resolution.carried;
  const headline = resolutionHeadline(resolution);
  room.history.push({ round: room.round, event: room.eventApplied ? room.event : null, headline, resolution, board: room.board, actions: room.actions });
  room.record?.rounds.push({
    round: room.round, crisis: room.board.crisis, proposals: room.board.proposals, attachments: room.board.attachments,
    compromises: room.board.compromises, actions: room.actions, outcomes: resolution.outcomes, events: resolution.events,
    before: resolution.before, after: resolution.after, headline, resolvedAt: new Date(now).toISOString(),
    combos: resolution.combos.map((c) => ({ combo: c.combo, district: c.district, proposalIds: c.proposalIds })),
    director: {
      event: room.eventApplied ? room.event : null,
      eventRule: room.eventApplied,
      hints: [...room.hintLog.values()].map((h) => ({ ...h, followed: followed(h, room) })),
      log: room.directorLog,
    },
  });
  room.directorLog = [];
  room.hintLog = new Map();
  room.phase = 'resolve';
  room.endsAt = null;
  for (const p of room.players) p.done = p.bot;
  const key = `resolve-${room.round}`;
  room.headline = { text: headline, source: 'template', key };
  room.bubbles = { key, list: resolutionBubbles(resolution) };
  room.effects.push({ t: 'resolved', key, round: room.round }, { t: 'record' });
  touch(room, now);
}

/** Did a player make the move a hint pointed at? (Recorded next to the hint: AI proposal vs what people did.) */
function followed(h: TableHint, room: Room): boolean {
  if (h.kind === 'accept') return !!room.board?.compromises.find((c) => c.id === h.compromiseId)?.accepted;
  if (h.kind === 'move') return room.actions.some((a) => a.seat === h.seat && a.move === h.move && a.proposalId === h.proposalId);
  return false;
}

function enterFinal(room: Room, now: number): void {
  room.final = finalResult(START_INDICATORS, room.city.indicators, room.history.map((h) => h.resolution), room.players.map((p) => p.persona));
  room.phase = 'final';
  room.endsAt = null;
  room.board = null;
  if (room.record) {
    room.record.final = room.final;
    room.record.endedAt = new Date(now).toISOString();
  }
  const key = 'final';
  room.headline = { text: finalHeadline(room.final), source: 'template', key };
  room.bubbles = { key, list: finalBubbles(room.final) };
  room.effects.push({ t: 'final', key }, { t: 'record' });
  touch(room, now);
}

/** Host: end the current phase now (the demo button). */
export function skip(room: Room, player: Player, now: number): void {
  requireHost(room, player);
  if (!advance(room, now)) throw new RoomError('Nothing to skip right now.');
}

/** Move to the next phase. Returns false when there is no timed phase to leave. */
function advance(room: Room, now: number): boolean {
  switch (room.phase) {
    case 'crisis':
      // The live desk ran out of time: the authored scenario stands in.
      if (!room.crisis) applyScenario(room, authoredScenario(null), now);
      else enterSelect(room, now);
      return true;
    case 'select':
      enterReveal(room, now);
      return true;
    case 'reveal':
      enterNegotiate(room, now);
      return true;
    case 'negotiate':
      enterResolve(room, now);
      return true;
    case 'resolve':
      if (room.round < TOTAL_ROUNDS) {
        room.round += 1;
        enterCrisis(room, now);
      } else enterFinal(room, now);
      return true;
    default:
      return false;
  }
}

/** "Outside your assigned character, which proposal would you personally support?" */
export function respond(room: Room, player: Player, choice: unknown, now: number): void {
  if (room.phase !== 'final' || !room.record) throw new RoomError('The question comes at the end of the match.');
  const id = String(choice ?? '');
  const proposal = room.history.flatMap((h) => h.board.proposals).find((p) => p.id === id);
  if (id !== 'none' && !proposal) throw new RoomError('Pick one of this match\'s proposals, or none.');
  if (proposal) districtById(proposal.district); // known place
  player.responded = id;
  room.record.responses = room.record.responses.filter((r) => r.seat !== player.seat);
  room.record.responses.push({
    seat: player.seat, persona: player.persona, participant: 'human', choice: id, kind: proposal?.kind ?? null,
    district: proposal?.district ?? null, at: new Date(now).toISOString(),
  });
  room.effects.push({ t: 'record' });
  touch(room, now);
}

/** Host: back to the lobby for another match with the same stakeholders. */
export function again(room: Room, player: Player): void {
  requireHost(room, player);
  if (room.phase !== 'final') throw new RoomError('Finish this match first.');
  room.phase = 'lobby';
  room.round = 0;
  room.final = null;
  room.headline = null;
  room.bubbles = null;
  room.event = null;
  room.eventApplied = null;
  room.hints = null;
  room.crisis = null;
  room.scenario = null;
  room.history = [];
  room.city = startCity();
  room.matchId = null;
  room.record = null;
  touch(room);
}

/** A client came or went. A phase never waits on someone who left. */
export function presence(room: Room, player: Player, connected: boolean, now = Date.now()): void {
  player.connected = connected;
  player.leftAt = connected ? null : now;
  if (!room.players.find((p) => p.id === room.hostId)?.connected) {
    const next = humans(room).find((p) => p.connected);
    if (next) room.hostId = next.id;
  }
  maybeReveal(room, now);
  maybeResolve(room, now);
  touch(room, now);
}

/**
 * Turn-based: no phase has a clock. Time only matters twice: someone's reconnect grace ran out and
 * everyone left is already done, and the opening live-desk wait (`SCENARIO_WAIT_MS`) that the
 * authored scenario ends.
 */
export function tick(room: Room, now: number): boolean {
  const before = room.phase;
  maybeReveal(room, now);
  maybeResolve(room, now);
  maybeProceed(room, now);
  if (room.phase !== before) return true;
  if (room.phase === 'crisis' && !room.crisis && room.endsAt !== null && now >= room.endsAt) return advance(room, now);
  return false;
}

export function publicState(room: Room, viewer: Player | null, now: number): RoomState {
  const showBoard = room.phase === 'reveal' || room.phase === 'negotiate';
  return {
    code: room.code,
    phase: room.phase,
    round: room.round,
    totalRounds: TOTAL_ROUNDS,
    endsAt: room.endsAt,
    serverNow: now,
    you: viewer?.seat ?? null,
    hostSeat: hostSeat(room),
    sessionKind: room.sessionKind,
    matchId: room.matchId,
    players: room.players.map((p) => ({
      seat: p.seat, name: p.name, persona: p.persona, connected: p.bot || p.connected, bot: p.bot, influence: p.influence,
      ready: room.phase === 'select' ? !!p.selection : room.phase === 'final' ? p.responded !== null : WAITING.includes(room.phase) ? p.done && (room.phase !== 'crisis' || !!room.crisis) : false,
    })),
    city: room.city,
    crisis: room.crisis,
    quips: room.scenario?.quips ?? {},
    live: room.scenario?.live ?? null,
    scenarioSource: room.scenario?.source ?? null,
    board: showBoard ? room.board : null,
    actions: showBoard ? room.actions : [],
    history: room.history,
    headline: room.headline,
    bubbles: room.bubbles,
    event: room.event,
    hints: room.phase === 'negotiate' ? room.hints : null,
    final: room.final,
    mine: viewer ? { selection: viewer.selection, moved: viewer.moved, responded: viewer.responded } : null,
  };
}

export function sweep(now = Date.now()): void {
  for (const [code, room] of rooms) if (now - room.touchedAt > ROOM_TTL_MS) rooms.delete(code);
}

