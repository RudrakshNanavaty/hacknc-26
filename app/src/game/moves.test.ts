import { describe, expect, it } from 'vitest';
import { buildBoard, type Board } from '@shared';
import { MOVES, moveBlocker } from './moves';

// One mayor proposal on the table (a drainage upgrade is publicly funded; seat 0 owns it).
const board: Board = buildBoard(1, [{ seat: 0, persona: 'mayor', card: 'drainage-upgrade', district: 'west-avenue' }]);
const proposalId = board.proposals[0]!.id;
const ctx = { board, seat: 1, influence: 2, proposalId, funding: 'budget' as const };

describe('moveBlocker', () => {
  it('lets another seat back, oppose and fund a publicly funded proposal', () => {
    for (const m of MOVES) expect(moveBlocker(m, ctx)).toBeNull();
  });

  it('blocks a move that costs more influence than you have', () => {
    expect(moveBlocker('fund', { ...ctx, influence: 1 })).toMatch(/costs 2 influence/);
    expect(moveBlocker('back', { ...ctx, influence: 0 })).toMatch(/costs 1 influence/);
  });

  it('does not let you oppose your own proposal', () => {
    expect(moveBlocker('oppose', { ...ctx, seat: 0 })).toMatch(/own proposal/);
    expect(moveBlocker('back', { ...ctx, seat: 0 })).toBeNull();
  });

  it('has nothing to fund once the public cost is covered', () => {
    expect(moveBlocker('fund', { ...ctx, funding: 'covered' })).toMatch(/already paid/);
  });

  it('has no bill to pay on a privately funded proposal', () => {
    const hotel = buildBoard(1, [{ seat: 2, persona: 'resort', card: 'hotel-development', district: 'collins-mid-beach' }]);
    expect(moveBlocker('fund', { board: hotel, seat: 1, influence: 5, proposalId: hotel.proposals[0]!.id, funding: 'free' })).toMatch(/Privately paid/);
  });
});

