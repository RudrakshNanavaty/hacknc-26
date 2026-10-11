// Coastal Clash rooms: four stakeholders, one real city, three rounds. The player who opens the
// room hosts it (starts the match, can skip a phase, can fill empty seats with bots).
// Wire protocol for /ws/rooms/:code. JSON messages, one per WebSocket frame.
import type { PaceId } from './config';
import type { CardId, NegotiationMove, PersonaId } from './game/content';
import type { Crisis, LiveConditions } from './game/scenario';
import type { Board, CityState, FinalResult, NegotiationAction, Resolution } from './game/engine';
import type { SessionKind } from './game/record';

export const MAX_PLAYERS = 4;
/** After a clock runs out, clients get this long to send what they picked. */
export const LOCK_GRACE_MS = 1_500;

export type RoomPhase = 'lobby' | 'crisis' | 'select' | 'reveal' | 'negotiate' | 'resolve' | 'final';

export interface RoomPlayer {
  seat: number;
  name: string;
  persona: PersonaId;
  connected: boolean;
  bot: boolean;
  influence: number;
  /** Done with the current phase (card locked, negotiation done, preference answered). */
  ready: boolean;
}

export interface Headline {
  text: string;
  source: 'gemini' | 'template';
  /** Which moment it describes, so a late Gemini line never overwrites a newer one. */
  key: string;
}

export interface RoundSummary {
  round: number;
  headline: string;
  resolution: Resolution;
  board: Board;
  actions: NegotiationAction[];
}

export interface RoomState {
  code: string;
  phase: RoomPhase;
  round: number;
  totalRounds: number;
  /** The current phase ends (ms since epoch, server clock). */
  endsAt: number | null;
  serverNow: number;
  you: number | null;
  hostSeat: number;
  pace: PaceId;
  sessionKind: SessionKind;
  matchId: string | null;
  players: RoomPlayer[];
  city: CityState;
  /** null while the live desk is still writing this match's scenario. */
  crisis: Crisis | null;
  /** This match's card lines (Gemini, in each persona's voice). */
  quips: Partial<Record<CardId, string>>;
  /** The live readings the scenario was written from. */
  live: LiveConditions | null;
  scenarioSource: 'gemini' | 'authored' | null;
  /** The revealed board (reveal and negotiation; null while cards are hidden). */
  board: Board | null;
  /** Negotiation moves so far (public: it is a negotiating table). */
  actions: NegotiationAction[];
  /** Every resolved round, oldest first. */
  history: RoundSummary[];
  headline: Headline | null;
  final: FinalResult | null;
  /** Your own hidden choices. */
  mine: {
    selection: { card: CardId; district: string } | null;
    moved: boolean;
    responded: string | null;
  } | null;
}

export type ClientMsg =
  | { t: 'look' }
  | { t: 'join'; name: string; persona: PersonaId; create?: boolean }
  | { t: 'resume'; playerId: string }
  | { t: 'persona'; persona: PersonaId }
  /** Host: fill an empty persona with a bot, or remove one. */
  | { t: 'bot'; persona: PersonaId; on: boolean }
  | { t: 'pace'; pace: PaceId }
  | { t: 'session'; kind: SessionKind }
  | { t: 'start' }
  /** Host: end the current phase now. */
  | { t: 'skip' }
  | { t: 'select'; card: CardId; district: string }
  | { t: 'move'; move: NegotiationMove; proposalId: string }
  | { t: 'accept'; compromiseId: string }
  /** Negotiation: done (with or without a move). */
  | { t: 'done' }
  | { t: 'respond'; choice: string }
  | { t: 'again' };

export type ServerMsg =
  | { t: 'state'; state: RoomState }
  | { t: 'joined'; playerId: string; seat: number }
  | { t: 'error'; message: string };
