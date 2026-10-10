// Rooms (Reef Rivals): every player builds a tile for the same reef under the same conditions. No
// central screen: the player who opens the room is the host (starts each round) and builds too.
// Wire protocol for /ws/rooms/:code. JSON messages, one per WebSocket frame.
import type { Design, ExperimentResult } from './design';
import type { ReefId } from './reefs';

/** Diver portraits in app/public/avatars/<id>.svg (Open Peeps, CC0). Picker order. */
export const AVATARS = [
  'peep-17', 'peep-52', 'peep-34', 'peep-92', 'peep-6', 'peep-96', 'peep-4', 'peep-8',
  'peep-18', 'peep-23', 'peep-38', 'peep-46', 'peep-49', 'peep-76', 'peep-83', 'peep-98',
] as const;
export type AvatarId = (typeof AVATARS)[number];

export const MAX_PLAYERS = 4;
/** After the build clock runs out, clients get this long to send their design. */
export const LOCK_GRACE_MS = 5_000;

export type RoomPhase = 'lobby' | 'briefing' | 'building' | 'results';

export interface RoomPlayer {
  seat: number;
  name: string;
  avatar: AvatarId;
  connected: boolean;
  /** Building: the player has sent their design. */
  locked: boolean;
}

/** One player's design after the round, evaluated by the server's engine. */
export interface RoomResult {
  seat: number;
  name: string;
  avatar: AvatarId;
  rank: number;
  result: ExperimentResult | null;
  design: Design | null;
  /** false: no design arrived before the clock ran out. */
  submitted: boolean;
}

export interface RoomState {
  code: string;
  phase: RoomPhase;
  /** The reef of this round; the host picks it in the lobby. */
  reef: ReefId;
  round: number;
  /** Briefing or building ends (ms since epoch, server clock). */
  endsAt: number | null;
  /** Server clock at send time, so clients can correct their own. */
  serverNow: number;
  /** Every design this round is evaluated with this seed, so conditions are identical. */
  seed: number;
  /** Your seat; null for a visitor who has not joined. */
  you: number | null;
  hostSeat: number;
  players: RoomPlayer[];
  /** Ranked, best first. Only in the results phase. */
  results: RoomResult[] | null;
  /** Your stored experiment this round; null until it is evaluated. */
  experimentId: string | null;
}

export type ClientMsg =
  | { t: 'look' } // before joining: the room's state, or an error if there is no such room
  /** `create`: open the room if it does not exist yet (the host's first message). */
  | { t: 'join'; name: string; avatar: AvatarId; create?: boolean }
  | { t: 'resume'; playerId: string }
  | { t: 'pick'; avatar: AvatarId }
  | { t: 'start' }
  /** Host, in the lobby: the reef of the next round. */
  | { t: 'reef'; reef: ReefId }
  | { t: 'lock'; design: Design }
  | { t: 'again' };

export type ServerMsg =
  | { t: 'state'; state: RoomState }
  | { t: 'joined'; playerId: string; seat: number }
  | { t: 'error'; message: string };
