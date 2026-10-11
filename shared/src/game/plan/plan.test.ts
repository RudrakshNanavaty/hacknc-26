import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isDistrictId } from '../districts';
import { checkSpoken, strayNumbers } from '../director';
import { PERSONAS } from '../content';
import {
  FUTURES, MODEL, PLAN_SCENARIOS, ROUND_BUDGET, STATUS_QUO, alternatives, allConfigs, areaOutcome, beatsShare, botAccepts, botMayorChoice, botOffer, botPick,
  checkOffer, configCost, divergence, enumeratePlans, isFeasible, mandatePoints, planOutcome, resolvePlanRound, scenarioById, stormResult, unmetConstraint,
  type AmendmentOffer, type PlanConfig, type PlanScenario,
} from './index';

interface CorpusItem { id: string; area: string; scope: string; facts: string[]; sources: { url: string; outlet: string; kind: string }[]; verification: { status: string } }
const corpus = JSON.parse(readFileSync(join(process.cwd(), 'pipeline/research/miami-beach-civic-corpus.json'), 'utf8')) as { items: CorpusItem[] };
const story = (id: string) => corpus.items.find((i) => i.id === id)!;

const [WEST, POINTE, MID] = PLAN_SCENARIOS as [PlanScenario, PlanScenario, PlanScenario];
const players = [
  { seat: 0, persona: 'mayor' as const },
  { seat: 1, persona: 'activist' as const },
  { seat: 2, persona: 'resort' as const },
  { seat: 3, persona: 'resident' as const },
];
const yes = (n: number): Record<number, boolean> => Object.fromEntries([0, 1, 2, 3].map((s) => [s, s < n]));

describe('the three scenarios', () => {
  it('are three different areas, each a real playable one', () => {
    expect(PLAN_SCENARIOS).toHaveLength(3);
    expect(new Set(PLAN_SCENARIOS.map((s) => s.district)).size).toBe(3);
    for (const s of PLAN_SCENARIOS) expect(isDistrictId(s.district)).toBe(true);
  });

  it('are verified stories pinned to the same area in the corpus', () => {
    for (const s of PLAN_SCENARIOS) {
      const item = story(s.storyId);
      expect(item.scope).toBe('area');
      expect(item.area).toBe(s.district);
      expect(['sources-checked', 'resolved']).toContain(item.verification.status);
      expect(s.verification.status).toBe(item.verification.status);
    }
  });

  it('cite exactly the corpus sources of their story (and of linked stories)', () => {
    for (const s of PLAN_SCENARIOS) {
      const own = s.sources.filter((x) => x.id.startsWith(`${s.storyId}#`)).map((x) => x.url);
      expect(own).toEqual(story(s.storyId).sources.map((x) => x.url));
      for (const link of s.linkedStories) expect(s.sources.filter((x) => x.id.startsWith(`${link}#`)).map((x) => x.url)).toEqual(story(link).sources.map((x) => x.url));
      expect(s.sources.every((x) => /^https:\/\//.test(x.url))).toBe(true);
    }
  });

  it('use only numbers from their cited facts, and the facts come from the corpus', () => {
    for (const s of PLAN_SCENARIOS) {
      expect(strayNumbers(s.situation, { facts: s.facts })).toEqual([]);
      expect(checkSpoken(s.situation, { facts: s.facts })).toBeNull();
      const known = [...story(s.storyId).facts, ...s.linkedStories.flatMap((l) => story(l).facts)];
      for (const f of s.facts) expect(known).toContain(f);
    }
  });

  it('are two sentences with a question and exactly three alternatives', () => {
    for (const s of PLAN_SCENARIOS) {
      expect(s.situation.split(/(?<=\.)\s+(?=[A-Z])/)).toHaveLength(2);
      expect(s.question.endsWith('?')).toBe(true);
      expect(s.options).toHaveLength(3);
      for (const o of s.options) expect(o.cost).toBeLessThanOrEqual(ROUND_BUDGET);
    }
  });

  it('have amendments that fit real options, answer a documented concern, and keep a plan inside the budget', () => {
    for (const s of PLAN_SCENARIOS) {
      expect(s.amendments.length).toBeGreaterThanOrEqual(2);
      for (const a of s.amendments) {
        expect(s.concerns).toContain(a.addresses);
        expect(a.appliesTo.length).toBeGreaterThan(0);
        for (const o of a.appliesTo) expect(s.options.some((x) => x.id === o)).toBe(true);
        expect(a.tradeoff.length).toBeGreaterThan(5);
      }
      // at least one option can be amended without breaking the budget
      expect(allConfigs(s).some((c) => c.amendment && isFeasible(s, c))).toBe(true);
    }
  });

  it('give every stakeholder a mandate that reads every option, and a bonus that can be earned', () => {
    for (const s of PLAN_SCENARIOS) {
      for (const p of PERSONAS) {
        const m = s.mandates[p];
        expect(s.concerns).toContain(m.concern);
        for (const o of s.options) expect([0, 1, 2]).toContain(m.base[o.id]);
        if (m.bonus.amendment) expect(s.amendments.some((a) => a.id === m.bonus.amendment)).toBe(true);
        // not everything pays the same: there is real conflict
        expect(new Set(s.options.map((o) => m.base[o.id])).size).toBeGreaterThan(1);
      }
      // the stakeholders do not all want the same option
      const favourite = PERSONAS.map((p) => [...s.options].sort((a, b) => s.mandates[p].base[b.id]! - s.mandates[p].base[a.id]!)[0]!.id);
      expect(new Set(favourite).size).toBeGreaterThan(1);
    }
  });

  it('have constraints grounded in the story (an option that cannot go ahead alone)', () => {
    expect(unmetConstraint(WEST, { option: 'raise-roads', amendment: null })?.requires).toBe('property-access');
    expect(unmetConstraint(WEST, { option: 'raise-roads', amendment: 'access-guarantee' })).toBeNull();
    expect(unmetConstraint(POINTE, { option: 'tower-for-park', amendment: null })?.requires).toBe('park-guaranteed');
    expect(unmetConstraint(POINTE, { option: 'tower-for-park', amendment: 'park-open-to-all' })).toBeNull();
    expect(unmetConstraint(POINTE, { option: 'tower-for-park', amendment: 'cap-the-units' })?.requires).toBe('park-guaranteed');
    expect(unmetConstraint(MID, { option: 'more-sand', amendment: null })).toBeNull();
  });
});

describe('mandate points', () => {
  it('follow the inspectable table: option 0-2 plus a bonus of 1, never above 3', () => {
    expect(mandatePoints(WEST, 'resident', { option: 'raise-roads', amendment: null }).points).toBe(2);
    expect(mandatePoints(WEST, 'resident', { option: 'raise-roads', amendment: 'access-guarantee' }).points).toBe(3);
    expect(mandatePoints(WEST, 'resort', { option: 'raise-roads', amendment: null }).points).toBe(0);
    expect(mandatePoints(WEST, 'resort', { option: 'improve-drainage', amendment: 'parking-relief' }).points).toBe(3);
    for (const s of PLAN_SCENARIOS) for (const p of PERSONAS) for (const c of allConfigs(s)) expect(mandatePoints(s, p, c).points).toBeLessThanOrEqual(3);
  });

  it('give nothing for the status quo', () => {
    for (const s of PLAN_SCENARIOS) for (const p of PERSONAS) expect(mandatePoints(s, p, STATUS_QUO).points).toBe(0);
  });

  it('pay the headroom bonus only when the budget is left over', () => {
    expect(mandatePoints(WEST, 'mayor', { option: 'improve-drainage', amendment: null }).points).toBe(2);
    // 7 of 10 spent leaves 3 (bonus); with the 2-unit guarantee 9 is spent and only 1 is left (no bonus)
    expect(mandatePoints(WEST, 'mayor', { option: 'raise-roads', amendment: null }).points).toBe(3);
    expect(mandatePoints(WEST, 'mayor', { option: 'raise-roads', amendment: 'access-guarantee' }).points).toBe(2);
  });
});

describe('the round: vote, verdict and 3+2+1', () => {
  const leading = { option: 'raise-roads', sponsorSeat: 0 };
  const accepted: AmendmentOffer[] = [{ seat: 3, amendment: 'access-guarantee', state: 'accepted' }];

  it("plays the spec's example: Raise Roads + Property Access Guarantee costs 9 of 10 and passes 3-1", () => {
    const r = resolvePlanRound({ scenario: WEST, players, leading, offers: accepted, votes: yes(3) });
    expect(r.verdict).toBe('approved');
    expect(r.adopted).toEqual({ option: 'raise-roads', amendment: 'access-guarantee' });
    expect(r.cost).toBe(9);
    const resident = r.scores.find((s) => s.persona === 'resident')!;
    expect(resident).toMatchObject({ mandate: 3, deal: 2, feasibility: 1, total: 6 });
    const mayor = r.scores.find((s) => s.persona === 'mayor')!;
    expect(mayor).toMatchObject({ mandate: 2, deal: 1, feasibility: 1, total: 4 });
    const resort = r.scores.find((s) => s.persona === 'resort')!;
    expect(resort).toMatchObject({ mandate: 0, deal: 0, feasibility: 1 });
    for (const s of r.scores) {
      expect(s.total).toBeLessThanOrEqual(6);
      expect(s.parts.mandate.length + s.parts.deal.length + s.parts.feasibility.length).toBeGreaterThanOrEqual(3);
      for (const part of [...s.parts.mandate, ...s.parts.deal, ...s.parts.feasibility]) expect(part.because.length).toBeGreaterThan(5);
    }
  });

  it('needs three of four votes, otherwise the status quo stands and nobody scores', () => {
    const r = resolvePlanRound({ scenario: WEST, players, leading, offers: accepted, votes: yes(2) });
    expect(r.verdict).toBe('rejected');
    expect(r.adopted).toEqual(STATUS_QUO);
    expect(r.scores.every((s) => s.total === 0)).toBe(true);
  });

  it('delays a plan that passes the vote but breaks a constraint, and applies the status quo', () => {
    const r = resolvePlanRound({ scenario: WEST, players, leading, offers: [], votes: yes(4) });
    expect(r.verdict).toBe('delayed');
    expect(r.blockedBy).toMatch(/liability|property-access/i);
    expect(r.adopted).toEqual(STATUS_QUO);
    expect(r.scores.every((s) => s.total === 0)).toBe(true);
  });

  it('pays deal-making only to an author whose own concern the amendment answers', () => {
    const offers: AmendmentOffer[] = [{ seat: 2, amendment: 'parking-relief', state: 'accepted' }];
    const r = resolvePlanRound({ scenario: WEST, players, leading: { option: 'improve-drainage', sponsorSeat: 0 }, offers, votes: yes(3) });
    expect(r.verdict).toBe('approved');
    expect(r.scores.find((s) => s.persona === 'resort')!.deal).toBe(2);
    // the resident offering the same amendment would not be rewarded for it
    const other = resolvePlanRound({ scenario: WEST, players, leading: { option: 'improve-drainage', sponsorSeat: 0 }, offers: [{ seat: 3, amendment: 'parking-relief', state: 'accepted' }], votes: yes(3) });
    expect(other.scores.find((s) => s.persona === 'resident')!.deal).toBe(0);
  });

  it('gives no deal points when the vote fails, even with an accepted amendment', () => {
    const r = resolvePlanRound({ scenario: WEST, players, leading, offers: accepted, votes: yes(1) });
    expect(r.scores.every((s) => s.deal === 0)).toBe(true);
  });

  it('keeps every round at six points or fewer for every possible plan', () => {
    for (const sc of PLAN_SCENARIOS) {
      for (const c of allConfigs(sc)) {
        if (!c.option) continue;
        const offers: AmendmentOffer[] = c.amendment ? [{ seat: 3, amendment: c.amendment, state: 'accepted' }] : [];
        const r = resolvePlanRound({ scenario: sc, players, leading: { option: c.option, sponsorSeat: 0 }, offers, votes: yes(4) });
        for (const s of r.scores) expect(s.total).toBeLessThanOrEqual(6);
      }
    }
  });

  it('is deterministic', () => {
    const a = resolvePlanRound({ scenario: MID, players, leading: { option: 'green-grey', sponsorSeat: 0 }, offers: [], votes: yes(3) });
    const b = resolvePlanRound({ scenario: MID, players, leading: { option: 'green-grey', sponsorSeat: 0 }, offers: [], votes: yes(3) });
    expect(a).toEqual(b);
  });
});

describe('offering an amendment', () => {
  it('must fit the project, the budget and the one-per-round limit', () => {
    expect(checkOffer(WEST, 'raise-roads', 'access-guarantee', 3, 0, [])).toBeNull();
    expect(checkOffer(WEST, 'raise-roads', 'nonsense', 3, 0, [])).toMatch(/not an amendment/);
    expect(checkOffer(WEST, 'improve-drainage', 'access-guarantee', 3, 0, [])).toMatch(/does not fit/);
    expect(checkOffer(WEST, 'raise-roads', 'access-guarantee', 0, 0, [])).toMatch(/sponsor/);
    expect(checkOffer(WEST, 'raise-roads', 'parking-relief', 3, 0, [{ seat: 3, amendment: 'access-guarantee', state: 'open' }])).toMatch(/already made/);
    expect(checkOffer(WEST, 'raise-roads', 'parking-relief', 2, 0, [{ seat: 3, amendment: 'access-guarantee', state: 'accepted' }])).toMatch(/already accepted/);
    expect(checkOffer(POINTE, 'city-park', 'park-open-to-all', 2, 0, [])).toBeNull();
    expect(checkOffer(MID, 'groins-breakwaters', 'worst-blocks-first', 2, 0, [])).toBeNull();
  });
});

describe('bots play their mandate', () => {
  it('pick the card their table likes best', () => {
    expect(botPick(WEST, 'resort')).toBe('improve-drainage');
    expect(botPick(WEST, 'activist')).toBe('elevate-properties');
    expect(botPick(MID, 'mayor')).toBe('more-sand');
  });
  it('the Mayor bot puts forward the submitted card it likes best', () => {
    expect(botMayorChoice(WEST, { 0: 'raise-roads', 1: 'elevate-properties', 2: 'improve-drainage', 3: 'raise-roads' })).toBe('raise-roads');
    // a tie on the Mayor's mandate goes to the cheaper project
    expect(botMayorChoice(WEST, { 1: 'elevate-properties', 2: 'improve-drainage' })).toBe('improve-drainage');
    expect(botMayorChoice(WEST, {})).toBeNull();
  });
  it('offer the amendment that fixes their concern or unblocks the project, and sponsors accept sensible ones', () => {
    expect(botOffer(WEST, 'resident', 'raise-roads')).toBe('access-guarantee');
    expect(botOffer(POINTE, 'resident', 'tower-for-park')).toBe('step-the-tower-back');
    expect(botOffer(POINTE, 'mayor', 'tower-for-park')).toBe('park-open-to-all');
    expect(botAccepts(WEST, 'mayor', 'raise-roads', 'access-guarantee')).toBe(true);
    expect(botAccepts(POINTE, 'mayor', 'tower-for-park', 'park-open-to-all')).toBe(true);
    // an amendment that does not fit the project is never accepted
    expect(botAccepts(POINTE, 'mayor', 'shorter-tower', 'step-the-tower-back')).toBe(false);
  });
});

describe('the simulator', () => {
  it('enumerates every plan, with every amendment, under three futures', () => {
    const per = PLAN_SCENARIOS.map((s) => allConfigs(s).length);
    expect(per).toEqual([10, 10, 14]);
    const all = enumeratePlans();
    expect(all).toHaveLength(per[0]! * per[1]! * per[2]!);
    expect(all.every((p) => p.byFuture.length === 3)).toBe(true);
    expect(new Set(all.map((p) => p.key)).size).toBe(all.length);
    expect(FUTURES.map((f) => f.id)).toEqual(['ordinary', 'high-tide-rain', 'extreme']);
    // the 27 base plans (an option in each area, no amendment) are all in there
    expect(all.filter((p) => p.plan.every((c) => c.option && !c.amendment))).toHaveLength(27);
  });

  it('is deterministic', () => {
    const plan: PlanConfig[] = [{ option: 'raise-roads', amendment: 'access-guarantee' }, { option: 'shorter-tower', amendment: null }, STATUS_QUO];
    expect(planOutcome(plan)).toEqual(planOutcome(plan));
  });

  it('evaluates an amended plan as itself, not as the base plan', () => {
    const base = areaOutcome(WEST, { option: 'raise-roads', amendment: null }, 'extreme');
    const amended = areaOutcome(WEST, { option: 'raise-roads', amendment: 'access-guarantee' }, 'extreme');
    expect(amended.access).toBeGreaterThan(base.access);
    expect(amended.flood).toBe(base.flood);
    const federal = areaOutcome(MID, { option: 'more-sand', amendment: 'use-the-federal-share' }, 'extreme');
    const full = areaOutcome(MID, { option: 'more-sand', amendment: null }, 'extreme');
    expect(federal.flood).toBeGreaterThan(full.flood);
    expect(configCost(MID, { option: 'more-sand', amendment: 'use-the-federal-share' })).toBe(3);
  });

  it('never makes a worse future better, and never lets a project make flooding worse than doing nothing', () => {
    for (const sc of PLAN_SCENARIOS) {
      for (const c of allConfigs(sc)) {
        const [o, h, e] = FUTURES.map((f) => areaOutcome(sc, c, f.id).flood);
        expect(o!).toBeLessThanOrEqual(h!);
        expect(h!).toBeLessThanOrEqual(e!);
        for (const f of FUTURES) expect(areaOutcome(sc, c, f.id).flood).toBeLessThanOrEqual(areaOutcome(sc, STATUS_QUO, f.id).flood);
        for (const f of FUTURES) {
          const v = areaOutcome(sc, c, f.id);
          expect(v.flood).toBeGreaterThanOrEqual(0);
          expect(v.flood).toBeLessThanOrEqual(100);
          expect(v.access).toBeGreaterThanOrEqual(0);
          expect(v.access).toBeLessThanOrEqual(100);
        }
      }
    }
  });

  it('raising protection lowers modelled exposure (monotone in the raise)', () => {
    for (const sc of PLAN_SCENARIOS) {
      const raisers = sc.options.filter((o) => o.sim.raiseFt > 0);
      for (const o of raisers) expect(areaOutcome(sc, { option: o.id, amendment: null }, 'extreme').flood).toBeLessThan(areaOutcome(sc, STATUS_QUO, 'extreme').flood);
    }
  });

  it('prices a plan as the sum of its areas and marks over-budget or blocked ones infeasible', () => {
    const ok = planOutcome([{ option: 'raise-roads', amendment: 'access-guarantee' }, { option: 'shorter-tower', amendment: null }, { option: 'dune-restore', amendment: null }]);
    expect(ok.cost).toBe(9 + 3 + 4);
    expect(ok.feasible).toBe(true);
    expect(planOutcome([{ option: 'raise-roads', amendment: null }, STATUS_QUO, STATUS_QUO]).feasible).toBe(false);
    expect(planOutcome([STATUS_QUO, STATUS_QUO, STATUS_QUO]).feasible).toBe(false);
  });

  it('offers three different feasible alternatives and a standing against all plans', () => {
    const alts = alternatives();
    expect(alts.map((a) => a.id)).toEqual(['most-protective', 'lowest-cost', 'most-access']);
    for (const a of alts) expect(a.outcome.feasible).toBe(true);
    expect(new Set(alts.map((a) => a.outcome.key)).size).toBeGreaterThan(1);
    const share = beatsShare(alts[0]!.outcome);
    expect(share).toBeGreaterThanOrEqual(0);
    expect(share).toBeLessThanOrEqual(1);
    expect(beatsShare(planOutcome([STATUS_QUO, STATUS_QUO, STATUS_QUO]))).toBe(0);
  });

  it('the storm holds for the most protective plan and not for doing nothing', () => {
    expect(stormResult(alternatives()[0]!.outcome).held).toBe(true);
    const none = stormResult(planOutcome([STATUS_QUO, STATUS_QUO, STATUS_QUO]));
    expect(none.held).toBe(false);
    expect(none.limit).toBe(MODEL.stormHeldMax);
  });

  it('shows where what was built, what people prefer and the model part ways', () => {
    const plan: PlanConfig[] = [{ option: 'improve-drainage', amendment: null }, { option: 'shorter-tower', amendment: null }, { option: 'dune-restore', amendment: null }];
    const d = divergence(plan, { [WEST.id]: ['raise-roads', 'raise-roads', 'improve-drainage'] });
    expect(d).toHaveLength(3);
    expect(d[0]!.personal).toEqual([{ option: 'raise-roads', count: 2 }, { option: 'improve-drainage', count: 1 }]);
    expect(d[0]!.personalAgrees).not.toBeNull();
    expect(d[1]!.personalAgrees).toBeNull();
    expect(scenarioById('nope')).toBeNull();
  });
});

describe('the cached simulator results', () => {
  it('match what the code computes today (regenerate with: npx tsx pipeline/plan-sim.ts)', () => {
    const cached = JSON.parse(readFileSync(join(process.cwd(), 'shared/src/data/plan-sim.json'), 'utf8')) as { plans: { k: string; c: number; f: boolean; fl: number[]; ac: number }[]; rulesVersion: string; assumptions: unknown[] };
    const live = enumeratePlans();
    expect(cached.rulesVersion).toBe('coastal-clash-rules/planning-1.0.0');
    expect(cached.plans).toHaveLength(live.length);
    expect(cached.plans).toEqual(live.map((p) => ({ k: p.key, c: p.cost, f: p.feasible, fl: p.byFuture.map((x) => x.flood), ac: p.access })));
    expect(cached.assumptions.length).toBeGreaterThan(10);
  });
});
