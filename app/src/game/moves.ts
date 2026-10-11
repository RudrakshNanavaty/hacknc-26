// The negotiation moves, as the table names them: Support is `back`, Oppose is `oppose`, Pay for it is
// `fund` (you cover the proposal's public bill). Accepting a compromise offered on your own project is
// `accept`, a separate free action. What a move may do is the engine's own `checkMove`; this only adds
// what the table can see that it cannot: a proposal whose bill is already covered (or private) has
// nothing to pay for.
import { PROJECTS, checkMove, type Board, type NegotiationMove, type Outcome } from '@shared';

/** The words for a move, wherever the table names one (the case file, hints). */
export const MOVE_WORDS: Record<NegotiationMove, string> = { back: '👍 Support', oppose: '👎 Oppose', fund: '💲 Pay for it' };
export const MOVES: readonly NegotiationMove[] = ['back', 'oppose', 'fund'];

/** Why a move cannot be played on this proposal right now, or null. */
export function moveBlocker(
  move: NegotiationMove,
  ctx: { board: Board; seat: number; influence: number; proposalId: string; funding: Outcome['funding'] },
): string | null {
  if (move === 'fund') {
    const p = ctx.board.proposals.find((x) => x.id === ctx.proposalId);
    if (p && PROJECTS[p.kind].budgetCost === 0) return 'Privately paid: no bill to pay.';
    if (ctx.funding === 'covered') return 'Its bill is already paid.';
  }
  return checkMove(ctx.board, ctx.seat, ctx.influence, move, ctx.proposalId);
}
