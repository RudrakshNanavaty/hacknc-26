// Room state machine (ported from Mayday Mayor, pattern from pocket-rivals, MIT): synchronous
// actions validate and record input, tick(room, now) moves time. No sockets in here, so it is
// easy to test; roomSocket.ts wires it to /ws/rooms/:code.
//
// lobby -> briefing -> building -> results -> lobby (next round)
import { randomInt, randomUUID } from 'node:crypto';
import {
  AVATARS, BRIEFING_SECONDS, BUILD_SECONDS, LOCK_GRACE_MS, MAX_PLAYERS, compareResults, isReefId, reefById,
  type AvatarId, type Design, type ExperimentResult, type ReefId, type RoomResult, type RoomState,
} from '@shared';

const ROOM_TTL_MS = 3 * 60 * 60 * 1000;
/** No I or O, so codes read cleanly off a projector. */
export const CODE_RE = /^[A-HJ-NP-Z]{4}$/;

export class RoomError extends Error {}

export interface Player {
  id: string; // secret, lets a reloaded page resume
  seat: number;
  name: string;
  avatar: AvatarId;
  connected: boolean;
  lockedAt: number | null;
  design: Design | null;
  result: ExperimentResult | null;
  /** This round's stored experiment, set by the evaluator. */
  experimentId: string | null;
}

export interface Room {
  code: string;
  phase: RoomState['phase'];
  reef: ReefId;
  round: number;
  /** Shared by every design this round. */
  seed: number;
  endsAt: number | null;
  players: Player[];
  results: RoomResult[] | null;
  hostSeat: number;
  touchedAt: number;
}

/** Evaluates a design with the server's engine and stores it; throws RoomError on an invalid design. */
export type Evaluator = (design: unknown) => { result: ExperimentResult; design: Design; experimentId: string };

export const rooms = new Map<string, Room>();

export function getOrCreateRoom(code: string, now = Date.now()): Room {
  const c = code.toUpperCase();
  if (!CODE_RE.test(c)) throw new RoomError('Room codes are 4 letters.');
  let room = rooms.get(c);
  if (!room) {
    room = { code: c, phase: 'lobby', reef: 'kaneohe', round: 0, seed: 0, endsAt: null, players: [], results: null, hostSeat: 0, touchedAt: now };
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

function cleanName(name: unknown): string {
  const n = String(name ?? '').trim().replace(/\s+/g, ' ').slice(0, 20);
  if (!n) throw new RoomError('Enter your name.');
  return n;
}

function checkAvatar(room: Room, avatar: unknown, self?: Player): AvatarId {
  if (!AVATARS.includes(avatar as AvatarId)) throw new RoomError('Pick a diver.');
  if (room.players.some((p) => p !== self && p.avatar === avatar)) throw new RoomError('That diver is taken.');
  return avatar as AvatarId;
}

/** Join the room. Lobby only, so every player builds the same round. */
export function join(room: Room, name: unknown, avatar: unknown): Player {
  if (room.phase !== 'lobby') throw new RoomError('This round is under way. Join when the next one opens.');
  if (room.players.length >= MAX_PLAYERS) throw new RoomError(`The room is full (${MAX_PLAYERS} players).`);
  const n = cleanName(name);
  if (room.players.some((p) => p.name.toLowerCase() === n.toLowerCase())) throw new RoomError('Someone here already has that name.');
  const player: Player = {
    id: randomUUID(),
    seat: room.players.length,
    name: n,
    avatar: checkAvatar(room, avatar),
    connected: true,
    lockedAt: null,
    design: null,
    result: null,
    experimentId: null,
  };
  room.players.push(player);
  touch(room);
  return player;
}

export function findPlayer(room: Room, playerId: unknown): Player {
  const p = room.players.find((x) => x.id === playerId);
  if (!p) throw new RoomError('You are not in this room.');
  return p;
}

export function pick(room: Room, player: Player, avatar: unknown): void {
  if (room.phase !== 'lobby') throw new RoomError('Divers are set until the next round.');
  player.avatar = checkAvatar(room, avatar, player);
  touch(room);
}

const requireHost = (room: Room, player: Player) => {
  if (player.seat !== room.hostSeat) throw new RoomError('Only the host can do that.');
};

/** The host picks the reef of the next round (lobby only). */
export function setReef(room: Room, player: Player, reef: unknown): void {
  requireHost(room, player);
  if (room.phase !== 'lobby') throw new RoomError('Pick the reef before the round starts.');
  if (!isReefId(reef)) throw new RoomError('That reef is not on the map.');
  if (!reefById(reef).ready) throw new RoomError('That reef is coming next.');
  room.reef = reef;
  touch(room);
}

/** The host starts the round: the briefing plays for everyone, then the build clock starts. */
export function start(room: Room, player: Player, now: number): void {
  requireHost(room, player);
  // During the briefing, the host's start skips the rest of it.
  if (room.phase === 'briefing') return beginBuilding(room, now);
  if (room.phase !== 'lobby') throw new RoomError('The round already started.');
  if (!room.players.some((p) => p.connected)) throw new RoomError('Waiting for players to join.');
  room.phase = 'briefing';
  room.round += 1;
  room.seed = randomInt(2 ** 31);
  room.endsAt = now + BRIEFING_SECONDS * 1000;
  room.results = null;
  for (const p of room.players) {
    p.lockedAt = null;
    p.design = null;
    p.result = null;
    p.experimentId = null;
  }
  touch(room, now);
}

function beginBuilding(room: Room, now: number): void {
  room.phase = 'building';
  room.endsAt = now + BUILD_SECONDS * 1000;
  touch(room, now);
}

/** A player submits their design. The server evaluates it; invalid designs are refused. */
export function lock(room: Room, player: Player, design: unknown, evaluate: Evaluator, now: number): ExperimentResult {
  if (room.phase !== 'building') throw new RoomError('Building is over.');
  if (player.lockedAt !== null) throw new RoomError('Your design is already in.');
  const done = evaluate(design);
  player.design = done.design;
  player.result = done.result;
  player.experimentId = done.experimentId;
  player.lockedAt = now;
  touch(room, now);
  if (room.players.filter((p) => p.connected).every((p) => p.lockedAt !== null)) finish(room);
  return done.result;
}

/** Everyone in (or out of time): rank the designs. Ties go to the earlier lock. */
function finish(room: Room): void {
  const ranked = [...room.players].sort((a, b) => {
    if (a.result && b.result) return compareResults(a.result, b.result) || (a.lockedAt ?? 0) - (b.lockedAt ?? 0);
    return (a.result ? 0 : 1) - (b.result ? 0 : 1) || a.seat - b.seat;
  });
  room.results = ranked.map((p, i) => ({
    seat: p.seat,
    name: p.name,
    avatar: p.avatar,
    rank: i + 1,
    result: p.result,
    design: p.design,
    submitted: p.result !== null,
  }));
  room.phase = 'results';
  room.endsAt = null;
}

/** The host: back to the lobby for another round with the same players. */
export function again(room: Room, player: Player): void {
  requireHost(room, player);
  if (room.phase !== 'results') throw new RoomError('Finish this round first.');
  room.phase = 'lobby';
  room.results = null;
  touch(room);
}

/** A client came or went. A round never waits on someone who left. */
export function presence(room: Room, player: Player, connected: boolean): void {
  player.connected = connected;
  // Host hand-off: the next connected player runs the room.
  if (!room.players[room.hostSeat]?.connected) {
    const next = room.players.find((p) => p.connected);
    if (next) room.hostSeat = next.seat;
  }
  if (room.phase === 'building') {
    const here = room.players.filter((p) => p.connected);
    if (here.length && here.every((p) => p.lockedAt !== null)) finish(room);
  }
  touch(room);
}

/** Time: building closes LOCK_GRACE_MS after the clock (clients send their design at 0:00). */
export function tick(room: Room, now: number): boolean {
  if (room.phase === 'briefing' && room.endsAt !== null && now >= room.endsAt) {
    beginBuilding(room, now);
    return true;
  }
  if (room.phase === 'building' && room.endsAt !== null && now >= room.endsAt + LOCK_GRACE_MS) {
    finish(room);
    return true;
  }
  return false;
}

export function publicState(room: Room, viewer: Player | null, now: number): RoomState {
  return {
    code: room.code,
    phase: room.phase,
    reef: room.reef,
    round: room.round,
    endsAt: room.endsAt,
    serverNow: now,
    seed: room.seed,
    you: viewer?.seat ?? null,
    hostSeat: room.hostSeat,
    players: room.players.map((p) => ({ seat: p.seat, name: p.name, avatar: p.avatar, connected: p.connected, locked: p.lockedAt !== null })),
    results: room.phase === 'results' ? room.results : null,
    experimentId: viewer?.experimentId ?? null,
  };
}

export function sweep(now = Date.now()): void {
  for (const [code, room] of rooms) if (now - room.touchedAt > ROOM_TTL_MS) rooms.delete(code);
}
