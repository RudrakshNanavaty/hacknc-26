// consensusclub rooms: four stakeholders, one real city, three rounds. The player who opens the
// room hosts it (starts the match, can skip a phase, can fill empty seats with bots).
// Wire protocol for /ws/rooms/:code. JSON messages, one per WebSocket frame.
import type { CardId, NegotiationMove, PersonaId } from './game/content';
import type { Crisis, LiveConditions } from './game/scenario';
import type { Board, CityState, FinalResult, NegotiationAction, Resolution } from './game/engine';
import type { AcceptedEvent, TableHint } from './game/director';
import type { Bubble } from './game/living';
import type { SessionKind } from './game/record';
import type { PlanMine, PlanPublic } from './game/plan/state';
import type { PlanRound } from './game/plan/types';

export const MAX_PLAYERS = 4;

export type RoomPhase =
  | 'lobby' | 'crisis' | 'select' | 'reveal' | 'negotiate' | 'resolve' | 'final'
  // Planning Edition: situation -> select (pick a card) -> propose (the Mayor puts one forward) -> deal (support, oppose, amend) -> vote -> result
  | 'situation' | 'propose' | 'deal' | 'vote' | 'result';

/** Which rules a room plays: the Planning Edition (default), or the earlier card game (kept so old records replay). */
export type RulesMode = 'planning' | 'legacy';

/**
 * How a match moves. `turns`: no clock, a step ends when everyone present is ready (the default).
 * `sprint`: the same steps, each on a short server deadline, about a minute a round, so a match of
 * three rounds fits in under four minutes. Being ready early still moves the table on at once.
 */
export type Pace = 'turns' | 'sprint';
export const PACES: readonly Pace[] = ['turns', 'sprint'];
export const isPace = (v: unknown): v is Pace => v === 'turns' || v === 'sprint';

/** Sprint deadlines per phase (ms). One round: 6 + 20 + 4 + 18 + 12 = 60 s; the last round's result also plays the storm. */
export const SPRINT_MS: Record<'crisis' | 'select' | 'reveal' | 'negotiate' | 'resolve', number> = {
  crisis: 6_000,
  select: 20_000,
  reveal: 4_000,
  negotiate: 18_000,
  resolve: 12_000,
};
/** Extra time on the last round's result, for the storm. */
export const SPRINT_STORM_MS = 6_000;

/** The three steps a player sees in a round, and which server phases belong to each. */
export type RoundStep = 'play' | 'deal' | 'result';
export const STEP_OF: Partial<Record<RoomPhase, RoundStep>> = {
  crisis: 'play', select: 'play', reveal: 'deal', negotiate: 'deal', resolve: 'result',
  situation: 'play', propose: 'deal', deal: 'deal', vote: 'deal', result: 'result',
};

/** Planning Edition sprint deadlines per phase (ms): 14 + 4 + 10 + 6 + 6 = 40 s a round, so three rounds fit in about two minutes. */
export const PLAN_SPRINT_MS: Record<'select' | 'propose' | 'deal' | 'vote' | 'result', number> = {
  select: 14_000,
  propose: 4_000,
  deal: 10_000,
  vote: 6_000,
  result: 6_000,
};

/**
 * Quick reactions pinned to an area while the table negotiates. Presentation only: relayed to the
 * room and forgotten, never stored in a record and never counted as anyone's position (rule 3).
 */
export const PING_EMOTES = ['👍', '👎', '🤝', '❓'] as const;
export type PingEmote = (typeof PING_EMOTES)[number];
export interface Ping {
  seat: number;
  district: string;
  emote: PingEmote;
  /** Server time it was sent (also tells two identical pings apart). */
  at: number;
}

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
  /** The twist applied at the start of play this round, if any. */
  event?: AcceptedEvent | null;
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
  /**
   * When the current phase ends (ms since epoch, server clock). Turn-based play has no deadline except the
   * opening live-desk wait; in a sprint every phase has one (SPRINT_MS).
   */
  endsAt: number | null;
  pace: Pace;
  rules: RulesMode;
  /** The Planning Edition's table state (null in the legacy game). */
  plan: PlanPublic | null;
  serverNow: number;
  you: number | null;
  hostSeat: number;
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
  /** What the characters on the map are saying right now (presentation only; `key` is the moment). */
  bubbles: { key: string; list: Bubble[] } | null;
  /** This round's twist: game fiction with validated, illustrative effects (applied when play starts). */
  event: AcceptedEvent | null;
  /** Negotiation hints, the same for everyone at the table. */
  hints: { key: string; list: TableHint[] } | null;
  final: FinalResult | null;
  /** Your own hidden choices. */
  mine: {
    selection: { card: CardId; district: string } | null;
    moved: boolean;
    responded: string | null;
    plan: PlanMine | null;
  } | null;
}

export type ClientMsg =
  | { t: 'look' }
  | { t: 'join'; name: string; persona: PersonaId; create?: boolean; /** Only when creating: play the earlier card game. */ rules?: RulesMode }
  | { t: 'resume'; playerId: string }
  | { t: 'persona'; persona: PersonaId }
  /** Host: fill an empty persona with a bot, or remove one. */
  | { t: 'bot'; persona: PersonaId; on: boolean }
  | { t: 'session'; kind: SessionKind }
  /** Host, lobby: turn-based or sprint. */
  | { t: 'pace'; pace: Pace }
  | { t: 'start' }
  /** Host: move on without waiting for whoever is not ready. */
  | { t: 'skip' }
  | { t: 'select'; card: CardId; district: string }
  | { t: 'move'; move: NegotiationMove; proposalId: string }
  | { t: 'accept'; compromiseId: string }
  /** Negotiation: done (with or without a move). */
  | { t: 'done' }
  | { t: 'respond'; choice: string }
  /** Negotiation only: a reaction on an area, relayed to the room (see Ping). */
  | { t: 'ping'; district: string; emote: PingEmote }
  /** Planning Edition. Pick one of the three project cards. */
  | { t: 'pick'; option: string }
  /** The Mayor puts one of the submitted projects forward. */
  | { t: 'lead'; option: string }
  /** Support or oppose the leading proposal. */
  | { t: 'stance'; stance: 'support' | 'oppose' }
  /** Make a Deal: ask for one of the scenario's amendments. */
  | { t: 'offer'; amendment: string }
  /** The sponsor accepts or declines the amendment a seat offered. */
  | { t: 'decide'; seat: number; accept: boolean }
  | { t: 'vote'; yes: boolean }
  /** Voluntary, outside your role, never scored. `before` is asked before the deal; `after` after the result. */
  | { t: 'personal'; stage: 'before' | 'after'; option: string | null; reason?: string | null; moved?: boolean | null; comment?: string | null }
  | { t: 'again' };

export type { PlanRound };

export type ServerMsg =
  | { t: 'state'; state: RoomState }
  | { t: 'joined'; playerId: string; seat: number }
  | { t: 'error'; message: string }
  | { t: 'ping'; ping: Ping };
