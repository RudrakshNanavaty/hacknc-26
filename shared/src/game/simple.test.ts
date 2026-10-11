import { describe, expect, it } from 'vitest';
import { CARDS, CARD_IDS, NEGOTIATION_COST, PROJECTS } from './content';
import { simpleCard } from './simple';

describe('simpleCard: every card in plain words', () => {
  it('covers every card with something good, something bad and its influence cost', () => {
    for (const id of CARD_IDS) {
      const s = simpleCard(id);
      expect(s.does.length, id).toBeGreaterThan(5);
      expect(s.good.length, id).toBeGreaterThan(0);
      expect(s.bad.length, id).toBeGreaterThan(0);
      expect(s.influence, id).toBe(CARDS[id].cost);
    }
  });

  it('derives project effects and city cost from the rules', () => {
    for (const id of CARD_IDS.filter((x) => CARDS[x].project)) {
      const p = PROJECTS[CARDS[id].project!];
      const s = simpleCard(id);
      for (const [k, v] of Object.entries(p.delta)) {
        const line = [...s.good, ...s.bad].find((l) => l.includes(String(Math.abs(v!))));
        expect(line, `${id} ${k}`).toBeDefined();
        expect(v! > 0 ? s.good : s.bad, `${id} ${k}`).toContain(line);
      }
      expect(s.money, id).toBe(p.budgetCost ? `City pays $${p.budgetCost}M` : 'Privately paid: free for the city');
      if (p.upkeep) expect(s.bad.join(' '), id).toContain(`$${p.upkeep}M upkeep`);
    }
  });

  it('authored support and opposition numbers match the card rules', () => {
    for (const id of CARD_IDS.filter((x) => CARDS[x].attach)) {
      const a = CARDS[id].attach!;
      const text = [...simpleCard(id).good, ...simpleCard(id).bad].join(' ');
      if (a.support) expect(text, id).toContain(`+${a.support} support`);
      if (a.opposition) expect(text, id).toContain(`+${a.opposition} opposition`);
      for (const [k, v] of Object.entries(a.ifBuilt ?? {})) expect(text, `${id} ${k}`).toContain(`${v! > 0 ? '+' : '−'}${Math.abs(v!)}`);
    }
    for (const id of CARD_IDS.filter((x) => CARDS[x].delayed)) {
      const d = CARDS[id].delayed!.delta;
      const text = simpleCard(id).bad.join(' ');
      for (const v of Object.values(d)) expect(text, id).toContain(String(Math.abs(v!)));
    }
    expect(NEGOTIATION_COST).toEqual({ back: 1, oppose: 1, fund: 2 });
  });
});
