// Money: the ledger's invariants, the five agreement types, and that wealth never buys past geography.
import { describe, expect, it } from 'vitest';
import { PROJECTS, TOTAL_ROUNDS, type CardId, type PersonaId } from './content';
import { botPlay, buildBoard, checkAccept, checkMove, checkPlay, crisisFor, resolveRound, startCity, type CityState, type Play } from './engine';
import { applyDirectorEvent, checkSpoken, combosInReach, negotiationCandidates, templateHints, validateEventProposal, validateSuggestion } from './director';
import { affordability } from './economy';
import { Books, MoneyError, WALLETS, WALLET_INFO, inMillions, millions, startTreasury, type Treasury } from './money';

const seat: Record<PersonaId, number> = { mayor: 0, activist: 1, resort: 2, resident: 3 };
const play = (persona: PersonaId, card: CardId, district: string): Play => ({ seat: seat[persona], persona, card, district });
const setWallet = (city: CityState, w: keyof Treasury['balances'], m: number) => {
  city.treasury.balances[w] = millions(m);
  if (w === 'city') city.indicators.budget = m;
  return city;
};
const total = (t: Treasury) => WALLETS.reduce((s, w) => s + t.balances[w], 0);
const players = (personas: PersonaId[]) => personas.map((p) => ({ seat: seat[p], persona: p, influence: 8, moved: false }));

describe('the ledger', () => {
  it('refuses to overdraw a wallet: no entry, nothing moves', () => {
    const t = startTreasury();
    const ind = startCity().indicators;
    const books = new Books(t, 1, ind);
    expect(books.pay('resident', 'builders', millions(4), { rule: 'N3', kind: 'project', text: 'too much' })).toBeNull();
    expect(t.balances.resident).toBe(millions(3));
    expect(t.ledger).toEqual([]);
    expect(() => books.pay('resident', 'builders', 0, { rule: 'N3', kind: 'project', text: 'zero' })).toThrow(MoneyError);
    expect(() => books.pay('resident', 'builders', 1.5, { rule: 'N3', kind: 'project', text: 'fraction' })).toThrow(MoneyError);
    expect(() => books.pay('city', 'city', 1, { rule: 'B2', kind: 'project', text: 'self' })).toThrow(MoneyError);
  });

  it('a bill the budget cannot pay becomes arrears (B3), never a negative budget', () => {
    const city = setWallet(startCity(), 'city', 2);
    const books = new Books(city.treasury, 2, city.indicators);
    const r = books.charge('builders', millions(5), { rule: 'U1', kind: 'upkeep', text: 'upkeep' });
    expect(r.paid!.amount).toBe(millions(2));
    expect(r.arrears).toMatchObject({ rule: 'B3', kind: 'arrears', from: 'lender', amount: millions(3) });
    expect(city.treasury.balances.city).toBe(0);
    expect(city.indicators.budget).toBe(0);
    expect(city.treasury.debts).toEqual([expect.objectContaining({ kind: 'arrears', outstanding: millions(3) })]);
  });

  it('a whole bot match: money is conserved, the budget meter is the city wallet, no player wallet goes negative', () => {
    const personas: PersonaId[] = ['mayor', 'activist', 'resort', 'resident'];
    let city = startCity();
    const start = total(city.treasury);
    let carried: ReturnType<typeof resolveRound>['carried'] = [];
    for (let round = 1; round <= TOTAL_ROUNDS; round++) {
      const plays = personas.flatMap((p) => {
        const pick = botPlay(p, 8, round);
        return pick ? [{ seat: seat[p], persona: p, ...pick }] : [];
      });
      const board = buildBoard(round, plays, carried);
      for (const c of board.compromises) if (!checkAccept(board, c.owner, c.id, { treasury: city.treasury, actions: [] })) c.accepted = true;
      const r = resolveRound(board, [], city);
      expect(total(r.city.treasury)).toBe(start);
      expect(r.city.indicators.budget).toBe(inMillions(r.city.treasury.balances.city));
      for (const w of WALLETS) if (!WALLET_INFO[w].external) expect(r.city.treasury.balances[w]).toBeGreaterThanOrEqual(0);
      for (const e of r.ledger) expect(Number.isSafeInteger(e.amount) && e.amount > 0).toBe(true);
      // Entry ids are unique across the match.
      expect(new Set(r.city.treasury.ledger.map((e) => e.id)).size).toBe(r.city.treasury.ledger.length);
      city = r.city;
      carried = r.carried;
    }
    // Everything scheduled was settled at the end of the session.
    expect(city.treasury.obligations).toEqual([]);
  });
});

describe('agreements', () => {
  // The target demo: the Mayor's seawall the budget cannot cover; the Resort Owner offers a partnership with strings;
  // the Activist offers a habitat protection clause; the neighbors petition against it.
  const demo = () => buildBoard(2, [
    play('mayor', 'seawall-upgrade', 'west-avenue'),
    play('resort', 'private-investment', 'west-avenue'),
    play('activist', 'habitat-survey', 'west-avenue'),
    play('resident', 'neighborhood-petition', 'west-avenue'),
  ]);

  it('puts authored terms on the table, offered to the owner, with exact amounts', () => {
    const board = demo();
    const ppp = board.compromises.find((c) => c.kind === 'ppp')!;
    const deal = board.compromises.find((c) => c.kind === 'restoration')!;
    expect(ppp).toMatchObject({ owner: seat.mayor, offeredBy: seat.resort, accepted: false });
    expect(ppp.terms).toMatchObject({ funder: 'resort', to: 'builders', amount: millions(PROJECTS.seawall.budgetCost), covers: true });
    expect(ppp.terms!.schedule).toEqual([{ dueRound: 3, from: 'city', to: 'resort', amount: millions(2), kind: 'availability' }]);
    expect(deal.terms).toMatchObject({ funder: 'activist', amount: millions(1), covers: false });
  });

  it('the budget cannot pay, the partner can: accepting both flips the vote and the ledger commits', () => {
    const city = setWallet(startCity(), 'city', 3);
    const board = demo();
    const seawall = board.proposals[0]!.id;
    // Nothing accepted: 1 support vs 3 opposition (petition 2, the survey 1).
    expect(resolveRound(board, [], city).outcomes[0]!.status).toBe('rejected');
    board.compromises.find((c) => c.kind === 'ppp')!.accepted = true;
    // The engine finds the deal that flips it (the hint Gemini may only word, never invent).
    const hints = negotiationCandidates(board, [], city, players(['mayor', 'activist', 'resort', 'resident']));
    expect(hints).toContainEqual(expect.objectContaining({ kind: 'accept', compromiseId: board.compromises.find((c) => c.kind === 'restoration')!.id, from: 'rejected', to: 'approved' }));
    board.compromises.find((c) => c.kind === 'restoration')!.accepted = true;
    const r = resolveRound(board, [], city);
    const o = r.outcomes[0]!;
    expect(o).toMatchObject({ proposalId: seawall, status: 'approved', funding: 'partner', paidBy: 'resort' });
    expect(o.conditions).toEqual(expect.arrayContaining(['Public-private partnership', 'Restoration partnership']));
    expect(r.ledger.map((e) => [e.rule, e.from, e.to, inMillions(e.amount)])).toEqual([['A1', 'resort', 'builders', 7], ['A3', 'activist', 'builders', 1]]);
    expect(r.after.budget).toBe(3);
    expect(inMillions(r.city.treasury.balances.resort)).toBe(13);
    expect(inMillions(r.city.treasury.balances.activist)).toBe(3);
    // Habitat works +3 environment and the concession +1 economy, on top of the seawall's own effect.
    expect(o.delta).toMatchObject({ environment: -3 + 3, economy: 1 });
    expect(r.agreements.map((a) => [a.type, a.status])).toEqual([['ppp', 'executed'], ['restoration', 'executed']]);
    expect(r.combos.map((c) => c.combo)).toContain('public-private-flood');
    // The strings: the availability payment comes due in round 3 (U3).
    const r3 = resolveRound(buildBoard(3, []), [], r.city);
    expect(r3.ledger[0]).toMatchObject({ rule: 'U3', from: 'city', to: 'resort', amount: millions(2) });
  });

  it('without the partner it stays unfunded: the vote passes but no money moves (B1)', () => {
    const city = setWallet(startCity(), 'city', 3);
    const board = demo();
    board.compromises.find((c) => c.kind === 'restoration')!.accepted = true;
    for (const c of board.compromises) if (c.kind === 'ppp') c.accepted = false;
    const r = resolveRound(board, [{ seat: seat.resident, persona: 'resident', move: 'back', proposalId: board.proposals[0]!.id }], city);
    expect(r.outcomes[0]!.status).toBe('unfunded');
    expect(r.ledger).toEqual([]);
    expect(r.agreements.find((a) => a.type === 'restoration')!.status).toBe('not-built');
  });

  it('money cannot be promised twice: a second commitment beyond the wallet is refused (no double spend)', () => {
    const city = setWallet(startCity(), 'resort', 9);
    // The Resort Owner's own hotel ($6M of capital) and a partnership on the drainage ($8M) on one board.
    const board = buildBoard(1, [
      play('mayor', 'drainage-upgrade', 'west-avenue'),
      play('resort', 'hotel-development', 'collins-mid-beach'),
    ]);
    board.attachments.push({ seat: seat.resort, persona: 'resort', card: 'private-investment', district: 'west-avenue', proposalId: board.proposals.find((p) => p.kind === 'drainage')!.id });
    const ppp = buildBoard(1, [play('mayor', 'drainage-upgrade', 'west-avenue'), play('resort', 'private-investment', 'west-avenue')]).compromises[0]!;
    board.compromises.push(ppp);
    expect(checkAccept(board, seat.mayor, ppp.id, { treasury: city.treasury, actions: [] })).toMatch(/\$3M not yet promised; this needs \$8M/);
    // With enough capital it can be accepted, once.
    setWallet(city, 'resort', 20);
    expect(checkAccept(board, seat.mayor, ppp.id, { treasury: city.treasury, actions: [] })).toBeNull();
    ppp.accepted = true;
    expect(checkAccept(board, seat.mayor, ppp.id, { treasury: city.treasury, actions: [] })).toMatch(/already accepted/);
  });

  it('a payer who cannot pay at the resolution voids the agreement (B4); the next source pays, nothing overdraws', () => {
    const board = buildBoard(1, [play('mayor', 'drainage-upgrade', 'west-avenue'), play('resort', 'private-investment', 'west-avenue')]);
    board.compromises[0]!.accepted = true;
    const city = setWallet(startCity(), 'resort', 5); // the money went elsewhere
    const r = resolveRound(board, [], city);
    expect(r.events.map((e) => e.rule)).toContain('B4');
    expect(r.outcomes[0]!.funding).toBe('budget');
    expect(r.agreements[0]!.status).toBe('void');
    expect(inMillions(r.city.treasury.balances.resort)).toBe(5);
  });

  it('a fund move pays from the mover\'s own wallet; influence never buys money', () => {
    const board = buildBoard(1, [play('activist', 'dune-restoration', 'north-beach-oceanside')]);
    const dune = board.proposals[0]!.id;
    const city = startCity();
    expect(checkMove(board, seat.resident, 8, 'fund', dune, { persona: 'resident', treasury: city.treasury, actions: [] })).toBeNull();
    expect(checkMove(board, seat.mayor, 8, 'fund', dune, { persona: 'mayor', treasury: city.treasury, actions: [] })).toMatch(/public budget/);
    setWallet(city, 'resident', 2);
    expect(checkMove(board, seat.resident, 8, 'fund', dune, { persona: 'resident', treasury: city.treasury, actions: [] })).toMatch(/\$3M of your own money; you have \$2M/);
    setWallet(city, 'resident', 3);
    const r = resolveRound(board, [{ seat: seat.resident, persona: 'resident', move: 'fund', proposalId: dune }], city);
    expect(r.outcomes[0]).toMatchObject({ status: 'approved', funding: 'contribution', paidBy: 'resident' });
    expect(r.after.budget).toBe(city.indicators.budget);
    expect(r.city.treasury.balances.resident).toBe(0);
  });

  it('a maintenance reserve pays upkeep before the budget does', () => {
    const board = buildBoard(1, [play('mayor', 'drainage-upgrade', 'west-avenue'), play('resident', 'flood-watch', 'west-avenue')]);
    board.compromises.find((c) => c.kind === 'reserve')!.accepted = true;
    const r1 = resolveRound(board, [], startCity());
    expect(r1.city.treasury.reserves).toEqual([expect.objectContaining({ balance: millions(1) })]);
    const r2 = resolveRound(buildBoard(2, []), [], r1.city);
    expect(r2.ledger).toEqual([expect.objectContaining({ rule: 'U1', from: 'reserves', amount: millions(1) })]);
    expect(r2.after.budget).toBe(r1.after.budget);
    const r3 = resolveRound(buildBoard(3, []), [], r2.city);
    expect(r3.ledger[0]).toMatchObject({ rule: 'U1', from: 'city', amount: millions(1) });
  });

  it('a conditional investment pays the city only if the project is built', () => {
    const board = buildBoard(2, [play('resort', 'hotel-development', 'collins-mid-beach'), play('resort', 'community-benefits', 'collins-mid-beach')]);
    // Two cards from one player is not a legal round; here it isolates the agreement on the Resort Owner's own hotel.
    const deal = board.compromises.find((c) => c.kind === 'conditional')!;
    expect(deal.accepted).toBe(true); // their own proposal: no one else has to accept
    const r = resolveRound(board, [], startCity());
    expect(r.ledger.map((e) => [e.rule, e.from, e.to, inMillions(e.amount)])).toEqual([['B2', 'resort', 'builders', 6], ['A4', 'resort', 'city', 2]]);
    expect(r.after.budget).toBe(startCity().indicators.budget + 2);
  });
});

describe('wealth cannot buy past geography', () => {
  it('a rich Resort Owner still cannot build a hotel where the real zoning forbids it, or a marina on the ocean', () => {
    const city = setWallet(startCity(), 'resort', 1000);
    expect(city.treasury.balances.resort).toBe(millions(1000));
    expect(checkPlay('resort', 8, 'hotel-development', 'north-beach-oceanside', 2)).toMatch(/zoned for hotel/);
    expect(checkPlay('resort', 8, 'marina-expansion', 'south-pointe', 2)).toMatch(/cannot go there/);
    // And an R1 block in a coastal high hazard area is not for sale either: money does not outvote it.
    const board = buildBoard(2, [play('resort', 'hotel-development', 'south-pointe'), play('activist', 'environmental-challenge', 'south-pointe'), play('mayor', 'fast-track', 'south-pointe')]);
    const r = resolveRound(board, [{ seat: seat.resident, persona: 'resident', move: 'back', proposalId: board.proposals[0]!.id }], city);
    expect(r.outcomes[0]!.status).toBe('blocked');
    expect(r.ledger).toEqual([]);
    expect(crisisFor(2).spotlight.length).toBeGreaterThan(0);
  });
});

describe('the Director proposes, never executes money', () => {
  const table = () => {
    const board = buildBoard(2, [
      play('mayor', 'seawall-upgrade', 'west-avenue'),
      play('resort', 'private-investment', 'west-avenue'),
      play('resident', 'neighborhood-petition', 'west-avenue'),
    ]);
    const city = setWallet(startCity(), 'city', 3);
    const hints = templateHints(board, negotiationCandidates(board, [], city, players(['mayor', 'activist', 'resort', 'resident'])), combosInReach(board));
    return { board, city, hints };
  };

  it('the template hint for a deal says who pays and how much, from the terms', () => {
    const { hints } = table();
    const deal = hints.find((h) => h.kind === 'accept')!;
    expect(deal.text).toMatch(/Resort capital pays \$7M, simulated/);
  });

  it('an invented transfer, deal or amount from the model is rejected; a faithful pitch passes', () => {
    const { hints } = table();
    const deal = hints.find((h) => h.kind === 'accept')!;
    const facts = { money: { publicBudgetM: 3, wallets: { 'Resort capital': 20 } }, deal: { amountM: 7 } };
    // Not one of the engine's moves: the model cannot create a transfer.
    expect(validateSuggestion({ hint: 'transfer-5M-resort-to-city', pitch: 'Resort, send the city five million, deal?' }, hints, facts)).toMatchObject({ ok: false });
    // A real hint, but an amount the facts do not hold.
    expect(validateSuggestion({ hint: deal.id, pitch: 'Mayor, accept the deal: the Resort pays $12M and it gets built.' }, hints, facts)).toMatchObject({ ok: false });
    expect(validateSuggestion({ hint: deal.id, pitch: 'Mayor, accept the deal: the Resort pays twelve million and it gets built.' }, hints, facts)).toMatchObject({ ok: false });
    const ok = validateSuggestion({ hint: deal.id, pitch: 'Mayor, accept the partnership: the Resort pays $7M and the seawall gets built.' }, hints, facts);
    expect(ok).toMatchObject({ ok: true, value: { id: deal.id, compromiseId: deal.compromiseId, source: 'gemini' } });
  });

  it('a twist cannot bring its own money: magnitude is clamped and the amount comes from the catalogue', () => {
    const v = validateEventProposal({ type: 'federal-grant', district: 'west-avenue', magnitude: 99, narrative: 'A grant program takes an interest in the neighborhood.', amount: 1e9, delta: { budget: 500 } }, { round: 2, phase: 'crisis', fired: [], count: 0 }, 'gemini');
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.value.magnitude).toBe(3);
    expect(v.value.delta).toEqual({ budget: 6 });
    const applied = applyDirectorEvent(startCity(), v.value);
    // The budget part moved through the books: outside money in, the meter follows the wallet.
    expect(applied.city.treasury.ledger).toEqual([expect.objectContaining({ id: 'r2-t1', rule: 'D1', from: 'grants', to: 'city', amount: millions(6) })]);
    expect(applied.city.indicators.budget).toBe(startCity().indicators.budget + 6);
  });

  it('"can we afford it?" is answered from the books; the model may only reword it', () => {
    const city = setWallet(startCity(), 'city', 3);
    const a = affordability(city, 2, 'seawall', 'mayor');
    expect(a.answer).toMatch(/Not from the budget: it will hold \$3M and this needs \$7M/);
    expect(a.facts.join(' ')).toMatch(/\$7M/);
    // A rewording that adds a number the facts do not hold is refused.
    expect(checkSpoken('The city could borrow $9M from the bond market.', { question: '', answer: a.answer, facts: a.facts })).toMatch(/9/);
    expect(affordability(startCity(), 1, 'hotel', 'resort').answer).toMatch(/Vance Hospitality capital can pay the \$6M itself/);
  });
});
