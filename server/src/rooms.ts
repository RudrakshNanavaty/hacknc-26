// The Coastal Clash room state machine (pattern from Mayday Mayor / pocket-rivals, MIT): synchronous
// actions validate and record input, tick(room, now) moves time. No sockets and no I/O in here, so
// it is easy to test; roomSocket.ts wires it to /ws/rooms/:code and drains room.effects (save the
// record, ask the narrator) after every change.
//
// lobby -> [crisis -> select -> reveal -> negotiate -> resolve] x3 -> final -> lobby
import { randomUUID } from 'node:crypto';
import {
  CARDS, LOCK_GRACE_MS, MAX_PLAYERS, NEGOTIATION_COST, PACES, PERSONA_INFO, START_INDICATORS, START_INFLUENCE, TOTAL_ROUNDS,
  buildBoard, checkAccept, checkMove, checkPlay, crisisFor, crisisHeadline, finalHeadline, finalResult, isPersonaId, newMatchRecord,
  nextInfluence, resolutionHeadline, resolveRound, revealHeadline, startCity, botPlay, districtById,
  type Board, type CardId, type CityState, type Crisis, type FinalResult, type Headline, type MatchRecord, type NegotiationAction,
  type PaceId, type PersonaId, type Proposal, type RoomPhase, type RoomState, type RoundSummary, type SessionKind,
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
}

/** Side effects for the socket layer, drained after every change. */
export type Effect =
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
  pace: PaceId;
  sessionKind: SessionKind;
  touchedAt: number;
  matchId: string | null;
  record: MatchRecord | null;
  city: CityState;
  crisis: Crisis | null;
  carried: Proposal[];
  board: Board | null;
  actions: NegotiationAction[];
  history: RoundSummary[];
  /** The last round resolved: a round can never resolve twice. */
  resolvedRound: number;
  headline: Headline | null;
  final: FinalResult | null;
  effects: Effect[];
}

export const rooms = new Map<string, Room>();

export function newRoom(code: string, now = Date.now()): Room {
  return {
    code, phase: 'lobby', round: 0, endsAt: null, players: [], hostId: null, pace: 'standard', sessionKind: 'demo', touchedAt: now,
    matchId: null, record: null, city: startCity(), crisis: null, carried: [], board: null, actions: [], history: [], resolvedRound: 0,
    headline: null, final: null, effects: [],
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
  id: randomUUID(), seat, name, persona, connected: !bot, leftAt: null, bot, influence: START_INFLUENCE, selection: null, moved: false, done: false, responded: null,
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

export function setPace(room: Room, player: Player, pace: unknown): void {
  requireHost(room, player);
  if (pace !== 'standard' && pace !== 'demo') throw new RoomError('Unknown pace.');
  room.pace = pace;
  touch(room);
}

export function setSession(room: Room, player: Player, kind: unknown): void {
  requireHost(room, player);
  if (room.phase !== 'lobby') throw new RoomError('Set the session type before the match.');
  if (kind !== 'demo' && kind !== 'community') throw new RoomError('Unknown session type.');
  room.sessionKind = kind;
  touch(room);
}

const seconds = (room: Room, phase: keyof (typeof PACES)['standard']) => PACES[room.pace][phase] * 1000;

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
  room.round = 1;
  for (const p of room.players) {
    p.influence = START_INFLUENCE;
    p.responded = null;
  }
  room.effects.push({ t: 'record' });
  enterCrisis(room, now);
}

function enterCrisis(room: Room, now: number): void {
  room.phase = 'crisis';
  room.crisis = crisisFor(room.round);
  room.board = null;
  room.actions = [];
  if (room.round > 1) for (const p of room.players) p.influence = nextInfluence(p.influence);
  for (const p of room.players) {
    p.selection = null;
    p.moved = false;
    p.done = false;
  }
  room.headline = { text: crisisHeadline(room.crisis, room.round), source: 'template', key: `crisis-${room.round}` };
  room.endsAt = now + seconds(room, 'crisis');
  touch(room, now);
}

function enterSelect(room: Room, now: number): void {
  room.phase = 'select';
  room.endsAt = now + seconds(room, 'select');
  for (const p of room.players.filter((x) => x.bot)) p.selection = botPlay(p.persona, p.influence, room.round);
  touch(room, now);
  maybeReveal(room, now);
}

/** A stakeholder locks a card and a target. Final: one card per round. */
export function select(room: Room, player: Player, card: unknown, district: unknown, now: number): void {
  if (room.phase !== 'select') throw new RoomError('Cards are played in the selection phase.');
  if (player.selection) throw new RoomError('Your card is already locked in.');
  const problem = checkPlay(player.persona, player.influence, card, district);
  if (problem) throw new RoomError(problem);
  player.selection = { card: card as CardId, district: String(district) };
  touch(room, now);
  maybeReveal(room, now);
}

function maybeReveal(room: Room, now: number): void {
  const here = present(room, now);
  if (room.phase === 'select' && here.length && here.every((p) => p.selection || (p.bot && botPlay(p.persona, p.influence, room.round) === null))) enterReveal(room, now);
}

function enterReveal(room: Room, now: number): void {
  const plays = room.players.flatMap((p) => {
    if (!p.selection) return [];
    // Re-checked at reveal: influence cannot have changed, but the rule is the rule.
    if (checkPlay(p.persona, p.influence, p.selection.card, p.selection.district)) return [];
    p.influence -= CARDS[p.selection.card].cost;
    return [{ seat: p.seat, persona: p.persona, card: p.selection.card, district: p.selection.district }];
  });
  room.board = buildBoard(room.round, plays, room.carried);
  room.phase = 'reveal';
  room.endsAt = now + seconds(room, 'reveal');
  const key = `reveal-${room.round}`;
  room.headline = { text: revealHeadline(room.board), source: 'template', key };
  room.effects.push({ t: 'reveal', key });
  touch(room, now);
}

function enterNegotiate(room: Room, now: number): void {
  // Nothing to negotiate over: go straight to the resolution.
  if (!room.board?.proposals.length) return enterResolve(room, now);
  room.phase = 'negotiate';
  room.endsAt = now + seconds(room, 'negotiate');
  for (const p of room.players) {
    p.moved = false;
    p.done = p.bot;
  }
  // Bots take the compromise offered to them: a deal beats a fight.
  for (const c of room.board.compromises) if (room.players[c.owner]?.bot) c.accepted = true;
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
  touch(room, now);
}

/** Negotiation: the proposal's owner accepts a compromise offered to them. */
export function accept(room: Room, player: Player, compromiseId: unknown, now: number): void {
  if (room.phase !== 'negotiate' || !room.board) throw new RoomError('Compromises are accepted during negotiation.');
  const problem = checkAccept(room.board, player.seat, compromiseId);
  if (problem) throw new RoomError(problem);
  room.board.compromises.find((c) => c.id === compromiseId)!.accepted = true;
  touch(room, now);
}

export function done(room: Room, player: Player, now: number): void {
  if (room.phase !== 'negotiate') throw new RoomError('Nothing to finish right now.');
  player.done = true;
  touch(room, now);
  maybeResolve(room, now);
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
  room.history.push({ round: room.round, headline, resolution, board: room.board, actions: room.actions });
  room.record?.rounds.push({
    round: room.round, crisis: room.board.crisis.id, proposals: room.board.proposals, attachments: room.board.attachments,
    compromises: room.board.compromises, actions: room.actions, outcomes: resolution.outcomes, events: resolution.events,
    before: resolution.before, after: resolution.after, headline, resolvedAt: new Date(now).toISOString(),
  });
  room.phase = 'resolve';
  room.endsAt = now + seconds(room, 'resolve');
  const key = `resolve-${room.round}`;
  room.headline = { text: headline, source: 'template', key };
  room.effects.push({ t: 'resolved', key, round: room.round }, { t: 'record' });
  touch(room, now);
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
      enterSelect(room, now);
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
  room.crisis = null;
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

/** Time: a phase ends at its clock (selection and negotiation get a short grace for in-flight messages). */
export function tick(room: Room, now: number): boolean {
  if (room.endsAt === null) return false;
  // Someone's reconnect grace ran out and everyone left in the phase is done.
  const before = room.phase;
  maybeReveal(room, now);
  maybeResolve(room, now);
  if (room.phase !== before) return true;
  const grace = room.phase === 'select' || room.phase === 'negotiate' ? LOCK_GRACE_MS : 0;
  if (now < room.endsAt + grace) return false;
  return advance(room, now);
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
    pace: room.pace,
    sessionKind: room.sessionKind,
    matchId: room.matchId,
    players: room.players.map((p) => ({
      seat: p.seat, name: p.name, persona: p.persona, connected: p.bot || p.connected, bot: p.bot, influence: p.influence,
      ready: room.phase === 'select' ? !!p.selection : room.phase === 'negotiate' ? p.done : room.phase === 'final' ? p.responded !== null : false,
    })),
    city: room.city,
    crisis: room.crisis,
    board: showBoard ? room.board : null,
    actions: showBoard ? room.actions : [],
    history: room.history,
    headline: room.headline,
    final: room.final,
    mine: viewer ? { selection: viewer.selection, moved: viewer.moved, responded: viewer.responded } : null,
  };
}

export function sweep(now = Date.now()): void {
  for (const [code, room] of rooms) if (now - room.touchedAt > ROOM_TTL_MS) rooms.delete(code);
}

