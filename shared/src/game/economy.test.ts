import { describe, expect, it } from 'vitest';
import { CARDS, CARD_IDS, TOTAL_ROUNDS, type PersonaId } from './content';
import { DISTRICT_IDS, cardEligibility } from './districts';
import { buildBoard, resolveRound, startCity } from './engine';
import { projectPreview, upcomingCosts } from './economy';
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
    city.indicators.budget = 5;
    const p = projectPreview('drainage-upgrade', 'west-avenue', 1, city)!;
    expect(p.warnings.join(' ')).toMatch(/has \$5M and this needs \$8M/);
    expect(p.warnings.join(' ')).toMatch(/Upkeep: \$1M/);
    expect(p.warnings.join(' ')).toMatch(/spotlight/);
    expect(projectPreview('fast-track', 'west-avenue', 1, city)).toBeNull();
  });

  it('lists what the city owes next round', () => {
    const r1 = resolveRound(buildBoard(1, [
      { seat: 0, persona: 'mayor', card: 'drainage-upgrade', district: 'west-avenue' },
      { seat: 2, persona: 'resort', card: 'lobbying-blitz', district: 'west-avenue' },
    ]), [], startCity());
    const up = upcomingCosts(r1.city);
    expect(up.upkeep).toBe(1);
    expect(up.pending.map((p) => p.card)).toEqual(['lobbying-blitz']);
    expect(upcomingCosts(startCity())).toEqual({ upkeep: 0, pending: [] });
  });
});
