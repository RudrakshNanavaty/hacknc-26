// The negotiation moves as cards in the hand. What a move may do is the engine's own `checkMove`
// (shared/src/game/engine.ts); this only adds the one thing the table can see that it cannot: a
// proposal whose public cost is already covered has nothing left to fund.
import { NEGOTIATION_COST, checkMove, type Board, type NegotiationMove, type Outcome } from '@shared';

export type MoveTone = 'lime' | 'coral' | 'sun';

export interface MoveCard {
  move: NegotiationMove;
  glyph: 'back' | 'oppose' | 'fund';
  name: string;
  tone: MoveTone;
  cost: number;
  /** What it does, in one line (the rules N1-N3). */
  blurb: string;
}

export const MOVE_CARDS: readonly MoveCard[] = [
  { move: 'back', glyph: 'back', name: 'Back', tone: 'lime', cost: NEGOTIATION_COST.back, blurb: '+1 support for this proposal' },
  { move: 'oppose', glyph: 'oppose', name: 'Oppose', tone: 'coral', cost: NEGOTIATION_COST.oppose, blurb: '+1 opposition against it' },
  { move: 'fund', glyph: 'fund', name: 'Fund', tone: 'sun', cost: NEGOTIATION_COST.fund, blurb: 'Covers its public cost' },
];

/** Why a move cannot be played on this proposal right now, or null. */
export function moveBlocker(
  move: NegotiationMove,
  ctx: { board: Board; seat: number; influence: number; proposalId: string; funding: Outcome['funding'] },
): string | null {
  const why = checkMove(ctx.board, ctx.seat, ctx.influence, move, ctx.proposalId);
  if (why) return why;
  if (move === 'fund' && ctx.funding === 'covered') return 'Its public cost is already covered.';
  return null;
}
