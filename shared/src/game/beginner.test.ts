import { describe, expect, it } from 'vitest';
import { BEGINNER_RULES_VERSION, CARDS, PERSONAS, START_INDICATORS, SUGGESTED_CHANGES, handOf, type CardId, type PersonaId } from './content';
import { cardEligibility } from './districts';
import { buildBoard, crisisFor, resolveRound, startCity, type Board } from './engine';
import type { Crisis } from './scenario';
import {
  AGENDA, AUTHORED_CONFLICTS, BEGINNER_HAND, beginnerBotMove, beginnerBotPlay, beginnerConflict, beginnerEnd, beginnerHand,
  checkBeginnerMove, checkBeginnerPlay, keyDecision, personalQuestion, suggestion, type Conflict,
} from './beginner';
import { newMatchRecord, studioSummary, supportsChoice, type MatchRecord } from './record';

const story = (base: Crisis, spotlight: string[], hands: Record<PersonaId, CardId[]>, summary = 'The city raised West Avenue and added stormwater pumps.'): Crisis => ({
  ...base, spotlight, hands,
  story: { id: 'test-story', title: 'A real story', years: '2020', summary, facts: [], sources: [], verification: 'checked' } as unknown as Crisis['story'],
});

function handsAreSound(c: Conflict) {
  for (const p of PERSONAS) {
    const hand = beginnerHand(p, c);
    if (p === c.owner) {
      expect(hand).toEqual([c.card]);
      continue;
    }
    expect(hand.length, `${p} in ${c.district}`).toBeGreaterThanOrEqual(BEGINNER_HAND.min);
    expect(hand.length).toBeLessThanOrEqual(BEGINNER_HAND.max);
    for (const id of hand) {
      expect(CARDS[id].persona).toBe(p);
      expect(checkBeginnerPlay(p, id, c), `${id} in ${c.district}`).toBeNull();
    }
    // At least one card acts on the conflict's project itself (no one is left with only side effects).
    expect(hand.some((id) => (CARDS[id].acts ?? []).includes(c.project) || !!CARDS[id].project), `${p} has a card that matters`).toBe(true);
  }
}

describe('Beginner Mode: one conflict a round', () => {
  it('the authored conflicts are legal on the real zoning and FEMA layers, with sound hands', () => {
    for (const [i, a] of AUTHORED_CONFLICTS.entries()) {
      expect(cardEligibility(a.card, a.district).ok, a.card).toBe(true);
      const c = beginnerConflict(i + 1, null);
      expect(c.district).toBe(c.crisis.spotlight[0]);
      handsAreSound(c);
    }
  });

  it('is deterministic', () => {
    for (const r of [1, 2, 3]) expect(beginnerConflict(r, crisisFor(r))).toEqual(beginnerConflict(r, crisisFor(r)));
  });

  it('uses a documented story only when its own deal has a project its place allows', () => {
    const base = crisisFor(1);
    const fits = story(base, ['west-avenue'], { mayor: ['drainage-upgrade', 'emergency-funding'], activist: ['public-campaign'], resort: ['private-investment'], resident: ['flood-watch'] });
    const c = beginnerConflict(1, fits);
    expect(c.source).toBe('story');
    expect(c).toMatchObject({ district: 'west-avenue', card: 'drainage-upgrade', owner: 'mayor' });
    handsAreSound(c);
    // The story's cards come first in its players' hands.
    expect(beginnerHand('activist', c)[0]).toBe('public-campaign');

    // A hotel story set where hotels are not zoned: the story does not fit, so the round is authored and says so.
    const misfit = story(base, ['north-beach-oceanside'], { mayor: ['fast-track'], activist: ['habitat-survey'], resort: ['hotel-development'], resident: ['rent-shield'] });
    const a = beginnerConflict(1, misfit);
    expect(a.source).toBe('authored');
    expect(a.crisis.story).toBeUndefined();
    expect(a).toMatchObject({ district: AUTHORED_CONFLICTS[0]!.district, card: AUTHORED_CONFLICTS[0]!.card });

    // Legal on the map but not what the story is about (street trees, not pumps): authored, and labelled so.
    const offTopic = story(base, ['west-avenue'], { mayor: ['drainage-upgrade', 'emergency-funding'], activist: ['public-campaign'], resort: ['private-investment'], resident: ['flood-watch'] }, 'Palms were swapped for shade trees along 41st Street.');
    expect(beginnerConflict(1, offTopic).source).toBe('authored');
  });

  it('every persona can be the one who is not the owner, for every project a conflict can be about', () => {
    for (const card of Object.values(CARDS).filter((c) => c.project)) {
      for (const district of ['west-avenue', 'collins-mid-beach', 'north-beach-oceanside', 'south-pointe']) {
        if (!cardEligibility(card.id, district).ok) continue;
        const c: Conflict = { round: 1, district, card: card.id, project: card.project!, owner: card.persona, source: 'authored', crisis: crisisFor(1) };
        for (const p of PERSONAS) if (p !== c.owner) expect(beginnerHand(p, c).length, `${p} vs ${card.id} in ${district}`).toBeGreaterThanOrEqual(BEGINNER_HAND.min);
      }
    }
  });

  it('only the round\'s cards can be played, and only there', () => {
    const c = beginnerConflict(1, null);
    const other = handOf('activist').find((id) => !beginnerHand('activist', c).includes(id))!;
    expect(checkBeginnerPlay('activist', other, c)).toMatch(/not one of your cards/);
    expect(checkBeginnerPlay('mayor', 'hotel-development', c)).toMatch(/not one of your cards/);
  });
});

describe('Beginner Mode: the table', () => {
  const c = beginnerConflict(1, null); // the Mayor's drainage in West Avenue
  const plays = PERSONAS.flatMap((p, seat) => {
    const card = beginnerBotPlay(p, c);
    return card ? [{ seat, persona: p, card, district: c.district }] : [];
  });
  const fresh = (): Board => structuredClone(buildBoard(1, plays, [], c.crisis));

  it('support, oppose and suggest a change are the only moves, and only on what is on the table', () => {
    const b = fresh();
    const pid = b.proposals[0]!.id;
    const owner = b.proposals[0]!.seat;
    expect(checkBeginnerMove(b, 1, 'fund', pid)).toMatch(/Support, oppose, or suggest/);
    expect(checkBeginnerMove(b, 1, 'back', 'nope')).toMatch(/not on the table/);
    expect(checkBeginnerMove(b, owner, 'oppose', pid)).toMatch(/your own/);
    expect(checkBeginnerMove(b, owner, 'suggest', pid)).toMatch(/your own/);
    expect(checkBeginnerMove(b, owner, 'back', pid)).toBeNull();
    b.compromises.push(suggestion(b, pid, 1));
    expect(checkBeginnerMove(b, 1, 'suggest', pid)).toMatch(/already suggested/);
  });

  it('a suggested change is a real engine rule: accepted adds support and its effect (C5), not accepted adds opposition (O8)', () => {
    const city = startCity();
    const base = fresh();
    const p = base.proposals[0]!;
    const before = resolveRound(base, [], city).outcomes.find((o) => o.proposalId === p.id)!;
    const run = (accept: boolean) => {
      const b = fresh();
      const s = suggestion(b, p.id, 1);
      s.accepted = accept;
      b.compromises.push(s);
      return resolveRound(b, [{ seat: 1, persona: PERSONAS[1]!, move: 'suggest', proposalId: p.id }], city);
    };
    const yes = run(true);
    const yo = yes.outcomes.find((o) => o.proposalId === p.id)!;
    expect(yo.support).toBe(before.support + 1);
    expect(yes.events.some((e) => e.rule === 'C5')).toBe(true);
    if (yo.status === 'approved') {
      expect(yo.conditions).toContain(SUGGESTED_CHANGES[p.kind].title);
      for (const [k, v] of Object.entries(SUGGESTED_CHANGES[p.kind].ifBuilt)) if (k !== 'budget') expect(yo.delta[k as 'flood'], k).toBe((before.status === 'approved' ? before.delta[k as 'flood'] ?? 0 : yo.delta[k as 'flood']! - v!) + v!);
    }
    const no = run(false);
    expect(no.outcomes.find((o) => o.proposalId === p.id)!.opposition).toBe(before.opposition + 1);
    expect(no.events.some((e) => e.rule === 'O8')).toBe(true);
  });

  it('bots argue their agenda, and every human choice changes a real result', () => {
    expect(beginnerBotPlay('mayor', c)).toBe(c.card);
    for (const kind of Object.keys(AGENDA) as (keyof typeof AGENDA)[]) {
      const ag = Object.values(AGENDA[kind]);
      expect(ag, kind).toContain('for');
      expect(ag.some((x) => x !== 'for'), `${kind} is contested`).toBe(true);
    }
    // Every authored round, every seat a human could take: whether they back it or fight it changes the result.
    for (const r of [1, 2, 3]) {
      const conflict = beginnerConflict(r, null);
      for (const [hs, human] of PERSONAS.entries()) {
        if (human === conflict.owner) continue;
        const result = (side: 'for' | 'against' | 'change') => {
          const hand = beginnerHand(human, conflict);
          const acts = (id: CardId) => (CARDS[id].acts ?? []).includes(conflict.project);
          const card = hand.find((id) => acts(id) && CARDS[id].category === (side === 'for' ? 'support' : side === 'against' ? 'opposition' : 'negotiation'));
          const plays = PERSONAS.flatMap((p, seat) => {
            const pick = seat === hs ? card : beginnerBotPlay(p, conflict);
            return pick ? [{ seat, persona: p, card: pick, district: conflict.district }] : [];
          });
          const b = structuredClone(buildBoard(r, plays, [], conflict.crisis));
          const pid = b.proposals[0]!.id;
          const actions = PERSONAS.flatMap((p, seat) => {
            if (seat === hs) {
              const move = side === 'for' ? ('back' as const) : side === 'against' ? ('oppose' as const) : ('suggest' as const);
              if (move === 'suggest') b.compromises.push(suggestion(b, pid, seat));
              return [{ seat, persona: p, move, proposalId: pid }];
            }
            const m = beginnerBotMove(p, seat, b, conflict);
            if (!m) return [];
            if (m.move === 'suggest') b.compromises.push({ ...suggestion(b, m.proposalId, seat), accepted: true });
            return [{ seat, persona: p, ...m }];
          });
          for (const x of b.compromises) x.accepted = true; // the owner is a bot: it takes every deal
          const o = resolveRound(b, actions, startCity()).outcomes.find((x) => x.proposalId === pid)!;
          // A real result: the verdict, the conditions built in, who pays, and what it does to the city.
          return `${o.status}|${o.conditions.join(',')}|${o.funding}|${JSON.stringify(o.delta)}`;
        };
        // Backing it passes it; and fighting it or asking for a change gives a different city.
        const yes = result('for');
        expect(yes.startsWith('approved'), `round ${r}, ${human} backing it`).toBe(true);
        expect(new Set([yes, result('against'), result('change')]).size, `round ${r}, ${human}: their choice changes the result`).toBeGreaterThan(1);
      }
    }
    const b = fresh();
    for (const [seat, p] of PERSONAS.entries()) {
      const m = beginnerBotMove(p, seat, b, c);
      expect(m, p).not.toBeNull();
      expect(checkBeginnerMove(b, seat, m!.move, m!.proposalId)).toBeNull();
    }
  });
});

describe('Beginner Mode: the end of the match', () => {
  it('reports viability, the storm and each stakeholder goal from the city and outcomes', () => {
    const end = beginnerEnd(START_INDICATORS, { ...START_INDICATORS, flood: 58, environment: 44, budget: 6 }, [], [...PERSONAS]);
    expect(end.viable).toBe(true);
    expect(end.goals.find((g) => g.persona === 'mayor')!.achieved).toBe(true);
    expect(end.goals.find((g) => g.persona === 'activist')!.achieved).toBe(true);
    expect(end.goals.find((g) => g.persona === 'resort')!.achieved).toBe(false);
    const low = beginnerEnd(START_INDICATORS, { ...START_INDICATORS, access: 20 }, [], ['resident']);
    expect(low.viable).toBe(false);
    expect(low.failing).toEqual(['access']);
  });

  it('the storm: a deterministic fixture loses it, the same round with flood safety survives it', () => {
    const c = beginnerConflict(3, null);
    const board = buildBoard(3, [{ seat: 0, persona: c.owner, card: c.card, district: c.district }], [], c.crisis);
    const run = (flood: number) => {
      const city = startCity();
      city.indicators = { ...city.indicators, flood };
      const r = resolveRound(board, [], city);
      return beginnerEnd(START_INDICATORS, r.after, [r], ['mayor']).storm!;
    };
    expect(run(20).held).toBe(false);
    expect(run(20).loss).toBeGreaterThan(0);
    expect(run(70).held).toBe(true);
  });

  it('asks the personal question about the most contested real decision, and a "no" never counts as support', () => {
    const c = beginnerConflict(1, null);
    const b = buildBoard(1, [{ seat: 0, persona: c.owner, card: c.card, district: c.district }], [], c.crisis);
    const r = resolveRound(b, [{ seat: 1, persona: 'activist', move: 'oppose', proposalId: b.proposals[0]!.id }], startCity());
    const k = keyDecision([{ resolution: r }])!;
    expect(k.proposalId).toBe(b.proposals[0]!.id);
    expect(personalQuestion(k, 'activist')).toMatch(/^Personally, not as the Environmental Activist: should Miami Beach build the drainage/);

    const m: MatchRecord = { ...newMatchRecord('m1', 'ABCD', 'community', [{ seat: 0, name: 'A', persona: 'mayor', participant: 'human' }]), rulesVersion: BEGINNER_RULES_VERSION, mode: 'beginner' };
    const resp = (stance: 'yes' | 'no' | 'unsure') => ({ seat: 0, persona: 'mayor' as const, participant: 'human' as const, choice: k.proposalId, kind: k.kind, district: k.district, at: '', stance });
    expect([resp('yes'), resp('no'), resp('unsure')].map(supportsChoice)).toEqual([true, false, false]);
    expect(studioSummary([{ ...m, responses: [resp('no')] }]).responses).toBe(0);
    expect(studioSummary([{ ...m, responses: [resp('yes')] }]).responses).toBe(1);
  });
});

describe('Beginner Mode: a short table', () => {
  it('the conflict is always proposed by someone at the table', () => {
    for (const seated of [['resident', 'mayor'], ['activist'], ['resort', 'resident'], ['mayor']] as PersonaId[][]) {
      for (const r of [1, 2, 3]) {
        const c = beginnerConflict(r, crisisFor(r), seated);
        expect(seated, `round ${r}`).toContain(c.owner);
        expect(cardEligibility(c.card, c.district).ok).toBe(true);
      }
    }
  });
});

describe('Suggest a Change, asked twice', () => {
  it('is built once; each player who asked still adds +1 support', () => {
    const c = beginnerConflict(1, null);
    const b = structuredClone(buildBoard(1, [{ seat: 0, persona: c.owner, card: c.card, district: c.district }], [], c.crisis));
    const pid = b.proposals[0]!.id;
    const one = structuredClone(b);
    one.compromises.push({ ...suggestion(one, pid, 1), accepted: true });
    const r1 = resolveRound(one, [{ seat: 1, persona: 'activist', move: 'suggest', proposalId: pid }], startCity()).outcomes[0]!;
    b.compromises.push({ ...suggestion(b, pid, 1), accepted: true }, { ...suggestion(b, pid, 2), accepted: true });
    const r2 = resolveRound(b, [{ seat: 1, persona: 'activist', move: 'suggest', proposalId: pid }, { seat: 2, persona: 'resort', move: 'suggest', proposalId: pid }], startCity()).outcomes[0]!;
    expect(r2.support).toBe(r1.support + 1);
    expect(r2.conditions).toEqual(r1.conditions);
    expect(r2.delta).toEqual(r1.delta);
  });
});
