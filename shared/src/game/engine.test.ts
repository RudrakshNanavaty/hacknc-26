import { describe, expect, it } from 'vitest';
import { CARDS, START_INDICATORS, TOTAL_ROUNDS, handOf, type CardId, type PersonaId } from './content';
import { DISTRICTS, cardEligibility, coastalHighHazard, districtById } from './districts';
import { botPlay, buildBoard, checkAccept, checkMove, checkPlay, finalResult, resolveRound, startCity, type Play } from './engine';

const seat: Record<PersonaId, number> = { mayor: 0, activist: 1, resort: 2, resident: 3 };
const play = (persona: PersonaId, card: CardId, district: string): Play => ({ seat: seat[persona], persona, card, district });

describe('real geography', () => {
  it('measures four playable areas from the real layers, with source feature ids', () => {
    expect(DISTRICTS).toHaveLength(4);
    for (const d of DISTRICTS) {
      expect(d.sources.zoningIds.length).toBeGreaterThan(0);
      expect(d.center[0]).toBeLessThan(-80.1);
      expect(d.center[1]).toBeGreaterThan(25.7);
    }
  });

  it('South Pointe borders a coastal high hazard zone; West Avenue does not', () => {
    expect(coastalHighHazard(districtById('south-pointe'))).toBe(true);
    expect(coastalHighHazard(districtById('west-avenue'))).toBe(false);
  });

  it('rejects a hotel where the real zoning does not allow it', () => {
    const north = districtById('north-beach-oceanside');
    expect(north.hotelZoningShare).toBeLessThan(0.25);
    expect(cardEligibility('hotel-development', north.id).ok).toBe(false);
    expect(checkPlay('resort', 8, 'hotel-development', north.id)).toMatch(/cannot go there/);
    expect(checkPlay('resort', 8, 'hotel-development', 'collins-mid-beach')).toBeNull();
  });

  it('rejects unknown places', () => {
    expect(checkPlay('mayor', 8, 'drainage-upgrade', 'atlantis')).toMatch(/not one of the playable areas/);
  });
});

describe('plays', () => {
  it('cannot be played without enough influence', () => {
    expect(checkPlay('resort', 3, 'hotel-development', 'collins-mid-beach')).toMatch(/costs 4 influence/);
  });
  it('cannot play another persona\'s card', () => {
    expect(checkPlay('mayor', 8, 'hotel-development', 'collins-mid-beach')).toMatch(/not in your hand/);
  });
  it('every persona holds exactly three cards', () => {
    for (const p of ['mayor', 'activist', 'resort', 'resident'] as PersonaId[]) expect(handOf(p)).toHaveLength(3);
  });
});

describe('clashes', () => {
  it('Hotel + Environmental Challenge in a coastal high hazard area: blocked (R1)', () => {
    const board = buildBoard(2, [play('resort', 'hotel-development', 'south-pointe'), play('activist', 'environmental-challenge', 'south-pointe')]);
    expect(board.compromises.map((c) => c.kind)).toEqual(['setback']);
    const r = resolveRound(board, [], startCity());
    expect(r.outcomes[0]!.status).toBe('blocked');
    expect(r.events.some((e) => e.rule === 'R1')).toBe(true);
    expect(r.after.economy).toBe(START_INDICATORS.economy);
  });

  it('Hotel + Environmental Challenge outside the hazard area: opposition, not a block', () => {
    const board = buildBoard(2, [play('resort', 'hotel-development', 'collins-mid-beach'), play('activist', 'environmental-challenge', 'collins-mid-beach')]);
    expect(board.compromises).toHaveLength(0);
    const r = resolveRound(board, [], startCity());
    // 1 support vs 2 opposition.
    expect(r.outcomes[0]!.status).toBe('rejected');
    expect(r.events.some((e) => e.rule === 'O1')).toBe(true);
  });

  it('accepting the dune setback lets the hotel through with modified benefits (C2)', () => {
    const board = buildBoard(2, [play('resort', 'hotel-development', 'south-pointe'), play('activist', 'environmental-challenge', 'south-pointe')]);
    board.compromises[0]!.accepted = true;
    const r = resolveRound(board, [], startCity());
    const o = r.outcomes[0]!;
    expect(o.status).toBe('approved');
    // hotel +8 economy -4 environment -3 access; setback -3 economy +3 environment; hotel-boom crisis +2 economy.
    expect(o.delta).toEqual({ economy: 7, environment: -1, access: -3 });
    expect(o.conditions).toEqual(['Dune setback and elevated design']);
  });

  it('Hotel + Public Access Guarantee: accepted is support with an access corridor (C1), refused is opposition (O3)', () => {
    const plays = [play('resort', 'hotel-development', 'collins-mid-beach'), play('resident', 'public-access-guarantee', 'collins-mid-beach')];
    const refused = resolveRound(buildBoard(2, plays), [], startCity());
    expect(refused.outcomes[0]!.status).toBe('delayed'); // 1 vs 1
    const board = buildBoard(2, plays);
    board.compromises[0]!.accepted = true;
    const r = resolveRound(board, [], startCity());
    expect(r.outcomes[0]!.status).toBe('approved');
    expect(r.outcomes[0]!.delta.access).toBe(1); // -3 + 4
    expect(r.city.districts['collins-mid-beach']!.features.map((f) => f.kind)).toEqual(['hotel', 'access-corridor']);
  });

  it('Living Shoreline + Emergency Funding: funded by the grant, with the nature match (C3)', () => {
    const board = buildBoard(1, [play('activist', 'living-shoreline', 'west-avenue'), play('mayor', 'emergency-funding', 'west-avenue')]);
    const r = resolveRound(board, [], startCity());
    const o = r.outcomes[0]!;
    expect(o.status).toBe('approved');
    expect(o.funding).toBe('covered');
    expect(r.after.budget).toBe(START_INDICATORS.budget);
    // +6 env +3 flood +2 access, +2 env grant match, king tide +2 flood.
    expect(o.delta).toEqual({ environment: 8, flood: 5, access: 2 });
  });

  it('a tie is delayed, carried into the next round, and Fast-Track decides it', () => {
    const r1 = resolveRound(buildBoard(1, [play('mayor', 'drainage-upgrade', 'west-avenue'), play('resident', 'neighborhood-petition', 'west-avenue'), play('resort', 'tourism-campaign', 'west-avenue')]), [], startCity());
    // Petition: +2 opposition; drainage has 1 support => rejected, not a tie. Use a negotiation back to tie it.
    expect(r1.outcomes[0]!.status).toBe('rejected');

    const board = buildBoard(1, [play('mayor', 'drainage-upgrade', 'west-avenue'), play('resident', 'neighborhood-petition', 'west-avenue')]);
    const tied = resolveRound(board, [{ seat: 2, persona: 'resort', move: 'back', proposalId: board.proposals[0]!.id }], startCity());
    expect(tied.outcomes[0]!.status).toBe('delayed');
    expect(tied.carried).toHaveLength(1);

    const next = buildBoard(2, [play('mayor', 'fast-track', 'west-avenue')], tied.carried);
    expect(next.attachments[0]!.proposalId).toBe(tied.carried[0]!.id);
    const r2 = resolveRound(next, [], tied.city);
    expect(r2.outcomes[0]!.status).toBe('approved');
  });

  it('runs out of budget: unfunded (B1)', () => {
    const city = startCity();
    city.indicators.budget = 5;
    const r = resolveRound(buildBoard(1, [play('mayor', 'drainage-upgrade', 'west-avenue')]), [], city);
    expect(r.outcomes[0]!.status).toBe('unfunded');
    expect(r.after.budget).toBe(5);
  });

  it('cards with nothing to act on fall back or refund', () => {
    const r = resolveRound(buildBoard(1, [play('mayor', 'fast-track', 'south-pointe'), play('resort', 'tourism-campaign', 'collins-mid-beach')]), [], startCity());
    expect(r.refunds[0]).toBe(1);
    expect(r.after.economy).toBe(START_INDICATORS.economy + 2);
  });

  it('resolves the same inputs to the same result, whatever the play order', () => {
    const plays = [
      play('resort', 'hotel-development', 'south-pointe'),
      play('activist', 'environmental-challenge', 'south-pointe'),
      play('mayor', 'fast-track', 'south-pointe'),
      play('resident', 'public-access-guarantee', 'south-pointe'),
    ];
    const a = resolveRound(buildBoard(2, plays), [], startCity());
    const b = resolveRound(buildBoard(2, [...plays].reverse()), [], startCity());
    expect(b).toEqual(a);
    // Fast-Track cannot override R1.
    expect(a.outcomes[0]!.status).toBe('blocked');
  });
});

describe('negotiation', () => {
  const board = buildBoard(1, [play('mayor', 'drainage-upgrade', 'west-avenue'), play('resort', 'hotel-development', 'collins-mid-beach'), play('resident', 'public-access-guarantee', 'collins-mid-beach')]);
  it('validates moves', () => {
    const drainage = board.proposals.find((p) => p.kind === 'drainage')!.id;
    const hotel = board.proposals.find((p) => p.kind === 'hotel')!.id;
    expect(checkMove(board, 0, 0, 'back', drainage)).toMatch(/costs 1/);
    expect(checkMove(board, 0, 3, 'oppose', drainage)).toMatch(/own proposal/);
    expect(checkMove(board, 1, 3, 'fund', hotel)).toMatch(/privately funded/);
    expect(checkMove(board, 1, 3, 'fund', drainage)).toBeNull();
    expect(checkMove(board, 1, 3, 'back', 'nope')).toMatch(/not on the table/);
  });
  it('only the owner accepts a compromise', () => {
    const c = board.compromises[0]!;
    expect(checkAccept(board, 3, c.id)).toMatch(/owner/);
    expect(checkAccept(board, 2, c.id)).toBeNull();
  });
});

describe('a whole match with bots', () => {
  it('plays three rounds deterministically and scores every persona', () => {
    const personas: PersonaId[] = ['mayor', 'activist', 'resort', 'resident'];
    const run = () => {
      let city = startCity();
      let carried: ReturnType<typeof resolveRound>['carried'] = [];
      const influence = [5, 5, 5, 5];
      const rounds = [];
      for (let round = 1; round <= TOTAL_ROUNDS; round++) {
        if (round > 1) for (let s = 0; s < 4; s++) influence[s] = Math.min(8, influence[s]! + 2);
        const plays = personas.flatMap((persona, s) => {
          const b = botPlay(persona, influence[s]!, round);
          if (!b) return [];
          influence[s]! -= CARDS[b.card].cost;
          return [{ seat: s, persona, ...b }];
        });
        const board = buildBoard(round, plays, carried);
        for (const c of board.compromises) c.accepted = true;
        const r = resolveRound(board, [], city);
        for (const [s, n] of Object.entries(r.refunds)) influence[Number(s)]! += n;
        city = r.city;
        carried = r.carried;
        rounds.push(r);
      }
      return { rounds, final: finalResult(START_INDICATORS, city.indicators, rounds, personas) };
    };
    const a = run();
    expect(a).toEqual(run());
    expect(a.rounds).toHaveLength(3);
    expect(a.final.scores).toHaveLength(4);
    expect(a.final.winners.length).toBeGreaterThan(0);
    expect(a.rounds[2]!.events.some((e) => e.rule === 'S9')).toBe(true);
  });
});
