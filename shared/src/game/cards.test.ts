// The expanded deck: real-geography eligibility for the new projects, hands, counters, authored
// combos, delayed consequences and upkeep.
import { describe, expect, it } from 'vitest';
import { CARDS, CARD_IDS, COMBOS, COMBO_IDS, HANDS, PERSONAS, PROJECTS, START_INDICATORS, TOTAL_ROUNDS, handOf, type CardId, type PersonaId } from './content';
import { cardEligibility, cardTargets } from './districts';
import { buildBoard, resolveRound, startCity, type Play } from './engine';

const seat: Record<PersonaId, number> = { mayor: 0, activist: 1, resort: 2, resident: 3 };
const play = (persona: PersonaId, card: CardId, district: string): Play => ({ seat: seat[persona], persona, card, district });
const okIn = (card: CardId) => cardTargets(card).filter((t) => t.ok).map((t) => t.district);

describe('the deck', () => {
  it('every card is complete: family, animation, rule text, trade-off, valid counters and combos', () => {
    for (const id of CARD_IDS) {
      const c = CARDS[id];
      expect(c.family, id).toBeTruthy();
      expect(c.anim, id).toBeTruthy();
      expect(c.rule.length, id).toBeGreaterThan(20);
      expect(c.tradeoff.length, id).toBeGreaterThan(10);
      for (const x of c.counters) expect(CARD_IDS, `${id} counter ${x}`).toContain(x);
      for (const x of c.combos) expect(COMBO_IDS, `${id} combo ${x}`).toContain(x);
      expect(c.project || c.acts?.length, `${id} does something`).toBeTruthy();
    }
  });

  it('no free lunch: every project costs public money or harms an indicator, and nothing costs zero influence', () => {
    for (const p of Object.values(PROJECTS)) {
      const harms = Object.values(p.delta).some((v) => v! < 0);
      expect(p.budgetCost > 0 || harms, p.kind).toBe(true);
    }
    for (const id of CARD_IDS) expect(CARDS[id].cost, id).toBeGreaterThan(0);
  });

  it('hands come from the persona\'s own deck and every card is dealt at least once', () => {
    for (const p of PERSONAS) {
      const dealt = new Set(HANDS[p].flat());
      for (const c of dealt) expect(CARDS[c].persona).toBe(p);
      expect([...dealt].sort()).toEqual(handOf(p).sort());
      expect(HANDS[p]).toHaveLength(TOTAL_ROUNDS);
    }
  });

  it('every combo is reachable by two different players in the same round', () => {
    for (const id of COMBO_IDS) {
      const personas = new Set(COMBOS[id].cards.map((c) => CARDS[c].persona));
      expect(personas.size, id).toBeGreaterThanOrEqual(2);
      const together = [1, 2, 3].some((r) => {
        const dealt = PERSONAS.flatMap((p) => HANDS[p][r - 1]!);
        return [...personas].every((p) => COMBOS[id].cards.some((c) => CARDS[c].persona === p && dealt.includes(c)));
      });
      expect(together, id).toBe(true);
    }
  });
});

describe('new projects follow the real zoning and FEMA layers', () => {
  it('dunes only on the Atlantic side', () => {
    expect(okIn('dune-restoration').sort()).toEqual(['collins-mid-beach', 'north-beach-oceanside', 'south-pointe']);
    expect(cardEligibility('dune-restoration', 'west-avenue').reason).toMatch(/Biscayne Bay/);
  });
  it('a marina needs the bay and hotel/commercial zoning', () => {
    expect(okIn('marina-expansion')).toEqual(['west-avenue']);
    expect(cardEligibility('marina-expansion', 'collins-mid-beach').reason).toMatch(/open Atlantic/);
  });
  it('workforce housing needs residential zoning (North Beach has 15%)', () => {
    expect(okIn('workforce-housing')).not.toContain('north-beach-oceanside');
    expect(cardEligibility('workforce-housing', 'north-beach-oceanside').reason).toMatch(/zoned residential/);
  });
  it('a seawall needs half the area in the 1% flood area (all four qualify)', () => {
    expect(okIn('seawall-upgrade')).toHaveLength(4);
  });
});

describe('counters', () => {
  it('Building Moratorium votes down a hotel', () => {
    const r = resolveRound(buildBoard(2, [play('resort', 'hotel-development', 'collins-mid-beach'), play('mayor', 'building-moratorium', 'collins-mid-beach')]), [], startCity());
    expect(r.outcomes[0]!.status).toBe('rejected');
    expect(r.events.some((e) => e.rule === 'O4')).toBe(true);
  });
  it('a marina built over a Rent Shield brings renter protections with it', () => {
    const board = buildBoard(2, [play('resort', 'marina-expansion', 'west-avenue'), play('resident', 'rent-shield', 'west-avenue')]);
    const marina = board.proposals[0]!.id;
    expect(resolveRound(board, [], startCity()).outcomes[0]!.status).toBe('delayed'); // 1 vs 1
    const r = resolveRound(board, [
      { seat: 0, persona: 'mayor', move: 'back', proposalId: marina },
      { seat: 1, persona: 'activist', move: 'back', proposalId: marina },
    ], startCity());
    expect(r.outcomes[0]!.status).toBe('approved'); // 3 vs 1
    // Marina +5 economy −3 environment −1 access; the rent shield adds +2 access. West Avenue is not in the hotel-boom spotlight.
    expect(r.outcomes[0]!.delta).toEqual({ economy: 5, environment: -3, access: 1 });
  });
});

describe('authored combos', () => {
  it('M1 Public-Private Flood Partnership: private money behind drainage', () => {
    const r = resolveRound(buildBoard(1, [play('mayor', 'drainage-upgrade', 'west-avenue'), play('resort', 'private-investment', 'west-avenue')]), [], startCity());
    expect(r.combos.map((c) => c.combo)).toEqual(['public-private-flood']);
    expect(r.outcomes[0]!.funding).toBe('covered');
    // +6 drainage, +2 king tide (K1), +2 combo.
    expect(r.after.flood).toBe(START_INDICATORS.flood + 10);
    expect(r.outcomes[0]!.rules.map((id) => r.events.find((e) => e.id === id)!.rule)).toContain('M1');
  });

  it('M2 Eco-Resort Agreement: accept the eco-certification and the hotel goes through; refuse it and it stalls', () => {
    const plays = [play('resort', 'hotel-development', 'collins-mid-beach'), play('activist', 'eco-certification', 'collins-mid-beach')];
    const refused = resolveRound(buildBoard(2, plays), [], startCity());
    expect(refused.outcomes[0]!.status).toBe('delayed');
    expect(refused.events.some((e) => e.rule === 'O7')).toBe(true);
    const board = buildBoard(2, plays);
    expect(board.compromises.map((c) => c.kind)).toEqual(['green']);
    board.compromises[0]!.accepted = true;
    const r = resolveRound(board, [], startCity());
    expect(r.outcomes[0]!.status).toBe('approved');
    expect(r.combos.map((c) => c.combo)).toEqual(['eco-resort']);
    expect(r.city.districts['collins-mid-beach']!.features.map((f) => f.kind)).toEqual(['hotel', 'eco-label']);
  });

  it('M3 Hybrid Shoreline: a seawall and a dune in the same area', () => {
    const r = resolveRound(buildBoard(1, [play('mayor', 'seawall-upgrade', 'south-pointe'), play('activist', 'dune-restoration', 'south-pointe')]), [], startCity());
    expect(r.outcomes.map((o) => o.status)).toEqual(['approved', 'approved']);
    expect(r.combos.map((c) => [c.combo, c.district])).toEqual([['hybrid-shoreline', 'south-pointe']]);
  });

  it('M4 Neighborhood Resilience Package: elevation and drainage together', () => {
    const r = resolveRound(buildBoard(1, [play('mayor', 'drainage-upgrade', 'west-avenue'), play('resident', 'elevate-buildings', 'west-avenue')]), [], startCity());
    expect(r.combos.map((c) => c.combo)).toEqual(['resilience-package']);
  });

  it('M5 Working Waterfront: a marina with an accepted public access guarantee', () => {
    const board = buildBoard(2, [play('resort', 'marina-expansion', 'west-avenue'), play('resident', 'public-access-guarantee', 'west-avenue')]);
    board.compromises[0]!.accepted = true;
    const r = resolveRound(board, [], startCity());
    expect(r.combos.map((c) => c.combo)).toEqual(['working-waterfront']);
  });

  it('no combo when a half of the pairing fails', () => {
    const r = resolveRound(buildBoard(1, [play('mayor', 'drainage-upgrade', 'west-avenue'), play('resident', 'elevate-buildings', 'south-pointe')]), [], startCity());
    expect(r.combos).toEqual([]);
  });
});

describe('delayed consequences and upkeep', () => {
  it('a Resilience Bond covers the cost now and charges the budget next round (L1)', () => {
    const r1 = resolveRound(buildBoard(1, [play('mayor', 'resilience-bond', 'west-avenue'), play('resident', 'elevate-buildings', 'west-avenue')]), [], startCity());
    expect(r1.outcomes[0]!.funding).toBe('covered');
    expect(r1.after.budget).toBe(START_INDICATORS.budget);
    expect(r1.city.pending).toHaveLength(1);
    const r2 = resolveRound(buildBoard(2, []), [], r1.city);
    expect(r2.after.budget).toBe(START_INDICATORS.budget - 3);
    expect(r2.events.map((e) => e.rule)).toContain('L1');
    expect(r2.city.pending).toHaveLength(0);
  });

  it('Lobbying Blitz backs a seawall now; in the last round its backlash is settled before the storm', () => {
    const r = resolveRound(buildBoard(TOTAL_ROUNDS, [play('mayor', 'seawall-upgrade', 'south-pointe'), play('resort', 'lobbying-blitz', 'south-pointe')]), [], startCity());
    expect(r.outcomes[0]!.support).toBe(3);
    const rules = r.events.map((e) => e.rule);
    expect(rules).toContain('S3');
    expect(rules.indexOf('L1')).toBeGreaterThan(-1);
    expect(rules.indexOf('L1')).toBeLessThan(rules.indexOf('S9'));
    expect(r.city.pending).toHaveLength(0);
  });

  it('a delayed consequence comes due only if the backed proposal is approved', () => {
    // The bond backs a home-elevation program that two players oppose: delayed, so the bond was never used.
    const board = buildBoard(1, [play('mayor', 'resilience-bond', 'collins-mid-beach'), play('resident', 'elevate-buildings', 'collins-mid-beach')]);
    const elevate = board.proposals[0]!.id;
    const r = resolveRound(board, [
      { seat: 1, persona: 'activist', move: 'oppose', proposalId: elevate },
      { seat: 2, persona: 'resort', move: 'oppose', proposalId: elevate },
    ], startCity());
    expect(r.outcomes[0]!.status).toBe('delayed');
    expect(r.city.pending).toEqual([]);
    expect(r.events.some((e) => e.rule === 'L0')).toBe(false);
  });

  it('drainage and seawalls cost upkeep in every later round (U1)', () => {
    const r1 = resolveRound(buildBoard(1, [play('mayor', 'drainage-upgrade', 'west-avenue')]), [], startCity());
    const r2 = resolveRound(buildBoard(2, []), [], r1.city);
    expect(r2.after.budget).toBe(r1.after.budget - PROJECTS.drainage.upkeep);
    expect(r2.events.map((e) => e.rule)).toEqual(['U1']);
  });
});
