import { describe, expect, it } from 'vitest';
import { CARDS, CARD_IDS, TOTAL_ROUNDS, type PersonaId } from './content';
import { DISTRICT_IDS, cardEligibility } from './districts';
import { buildBoard, resolveRound, startCity } from './engine';
import { ifApproved, projectPreview, upcomingCosts } from './economy';
import { millions } from './money';
import { makeCrisis } from './scenario';

const seat: Record<PersonaId, number> = { mayor: 0, activist: 1, resort: 2, resident: 3 };

describe('previews agree with the engine', () => {
  it('for every project card, legal area and round: the preview is what a lone approval does', () => {
    let checked = 0;
    for (const card of CARD_IDS.filter((c) => CARDS[c].project)) {
      for (const district of DISTRICT_IDS.filter((d) => cardEligibility(card, d).ok)) {
        for (let round = 1; round <= TOTAL_ROUNDS - 1; round++) {
          const city = startCity();
          const persona = CARDS[card].persona;
          const r = resolveRound(buildBoard(round, [{ seat: seat[persona], persona, card, district }]), [], city);
          const p = projectPreview(card, district, round, city)!;
          expect(r.outcomes[0]!.status, `${card} ${district} r${round}`).toBe('approved');
          expect(p.after, `${card} ${district} r${round}`).toEqual(r.after);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(20);
  });

  it('uses the crisis the match wrote (its kind sets the bonus, its spotlight where it applies)', () => {
    const crisis = makeCrisis(1, 'budget', 'Budget crunch', 'The city is short of money this week, again.', ['collins-mid-beach'], [], 'gemini');
    const there = projectPreview('drainage-upgrade', 'collins-mid-beach', 1, startCity(), crisis)!;
    expect(there.spotlight).toBe(true);
    expect(there.delta).toEqual({ flood: 6, budget: 3 });
    const r = resolveRound(buildBoard(1, [{ seat: 0, persona: 'mayor', card: 'drainage-upgrade', district: 'collins-mid-beach' }], [], crisis), [], startCity());
    expect(there.after).toEqual(r.after);
    expect(projectPreview('drainage-upgrade', 'west-avenue', 1, startCity(), crisis)!.spotlight).toBe(false);
  });

  it('warns when the budget cannot pay, and about upkeep and the spotlight', () => {
    const city = startCity();
    city.treasury.balances.city = millions(5);
    city.indicators.budget = 5;
    const p = projectPreview('drainage-upgrade', 'west-avenue', 1, city)!;
    expect(p.warnings.join(' ')).toMatch(/will have \$5M and this needs \$8M/);
    expect(p.fundable).toBe(false);
    expect(p.after.budget).toBe(5); // unfunded: nothing is paid and nothing is built
    expect(p.warnings.join(' ')).toMatch(/Upkeep: \$1M/);
    expect(p.warnings.join(' ')).toMatch(/spotlight/);
    expect(projectPreview('fast-track', 'west-avenue', 1, city)).toBeNull();
  });

  it('the preview charges this round\'s bill first, as the engine does', () => {
    // Round 1 builds drainage (upkeep $1M from round 2) backed by a Resilience Bond-free budget path.
    const r1 = resolveRound(buildBoard(1, [{ seat: 0, persona: 'mayor', card: 'drainage-upgrade', district: 'west-avenue' }]), [], startCity());
    const city = structuredClone(r1.city);
    city.treasury.balances.city = millions(5);
    city.indicators.budget = 5;
    const p = projectPreview('workforce-housing', 'south-pointe', 2, city)!;
    const r2 = resolveRound(buildBoard(2, [{ seat: 3, persona: 'resident', card: 'workforce-housing', district: 'south-pointe' }]), [], city);
    expect(r2.outcomes[0]!.status).toBe('unfunded'); // $5M - $1M upkeep < $5M
    expect(p.fundable).toBe(false);
    expect(p.after).toEqual(r2.after);
    expect(p.warnings.join(' ')).toMatch(/after this round's bill/);
  });

  it('ifApproved runs the real engine: crisis bonus and conditions included; a block stays a block', () => {
    const board = buildBoard(2, [
      { seat: 2, persona: 'resort', card: 'hotel-development', district: 'collins-mid-beach' },
      { seat: 3, persona: 'resident', card: 'neighborhood-petition', district: 'collins-mid-beach' },
    ]);
    const now = resolveRound(board, [], startCity());
    expect(now.outcomes[0]!.status).toBe('rejected');
    const would = ifApproved(board, [], startCity(), board.proposals[0]!.id)!;
    expect(would.status).toBe('approved');
    expect(would.delta).toEqual({ economy: 10, environment: -4, access: -3 }); // +2 economy: Collins is in the hotel-boom spotlight
    const blocked = buildBoard(2, [
      { seat: 2, persona: 'resort', card: 'hotel-development', district: 'south-pointe' },
      { seat: 1, persona: 'activist', card: 'environmental-challenge', district: 'south-pointe' },
    ]);
    expect(ifApproved(blocked, [], startCity(), blocked.proposals[0]!.id)!.status).toBe('blocked');
  });

  it('lists what the city owes next round', () => {
    const r1 = resolveRound(buildBoard(1, [
      { seat: 0, persona: 'mayor', card: 'drainage-upgrade', district: 'west-avenue' },
      { seat: 2, persona: 'resort', card: 'lobbying-blitz', district: 'west-avenue' },
    ]), [], startCity());
    const up = upcomingCosts(r1.city);
    expect(up.upkeep).toBe(1);
    expect(up.pending.map((p) => p.card)).toEqual(['lobbying-blitz']);
    expect(upcomingCosts(startCity())).toEqual({ upkeep: 0, pending: [], obligations: [], debt: 0 });
  });
});
