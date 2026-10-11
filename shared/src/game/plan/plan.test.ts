import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isDistrictId } from '../districts';
import { checkSpoken, strayNumbers } from '../director';
import { PERSONAS, type PersonaId } from '../content';
import {
  FUTURES, MODEL, PLAN_SCENARIOS, approvedOutcome, blockedOutcome, botValue, botVote, outcomePoints, ROUND_BUDGET, STATUS_QUO, alternatives, allConfigs, areaOutcome, beatsShare, botAccepts, botMayorChoice, botOffer, botPick,
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

  it('give every stakeholder explicit objectives that add up to three points, with a real 0 and a real 3 in reach', () => {
    for (const s of PLAN_SCENARIOS) {
      const outs = [
        ...allConfigs(s).filter((c) => c.option && isFeasible(s, c)).map(approvedOutcome),
        ...s.options.map((o) => blockedOutcome(o.id)),
        blockedOutcome(null),
      ];
      for (const p of PERSONAS) {
        const m = s.mandates[p];
        expect(s.concerns).toContain(m.concern);
        expect(m.objectives).toHaveLength(3);
        expect(m.objectives.reduce((n, o) => n + o.points, 0)).toBe(3);
        for (const o of m.objectives) expect(o.label.length).toBeGreaterThan(8);
        const pts = outs.map((o) => outcomePoints(s, p, o).points);
        expect(Math.min(...pts), `${s.district} ${p} can score 0`).toBe(0);
        expect(Math.max(...pts), `${s.district} ${p} can score 3`).toBe(3);
      }
      // real conflict: no single plan gives all four stakeholders the full 3
      const everyoneHappy = allConfigs(s).filter((c) => c.option && isFeasible(s, c)).filter((c) => PERSONAS.every((p) => mandatePoints(s, p, c).points === 3));
      expect(everyoneHappy).toEqual([]);
      // and the stakeholders do not all pick the same project
      const favourites = new Set(PERSONAS.map((p) => botPick(s, p)));
      expect(favourites.size).toBeGreaterThan(1);
    }
  });

  it('measure the Mayor against citywide objectives that are not the shared City point', () => {
    for (const s of PLAN_SCENARIOS) {
      const m = s.mandates.mayor;
      expect(m.critical).toBeDefined();
      // financial responsibility is a reserve held back, strictly below the round budget the City point checks
      const reserve = m.objectives.find((o) => 'cost' in o.check);
      expect(reserve && 'cost' in reserve.check && reserve.check.cost).toBeLessThan(ROUND_BUDGET);
      // and nothing in the mandate is "the plan was approved": that is the City point's job
      expect(m.objectives.some((o) => o.label.toLowerCase().includes('approved'))).toBe(false);
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
  const pts = (sc: PlanScenario, p: PersonaId, c: PlanConfig) => mandatePoints(sc, p, c).points;

  it('score what the plan that stands actually does, never above 3', () => {
    expect(pts(WEST, 'mayor', { option: 'improve-drainage', amendment: 'parking-relief' })).toBe(3);
    expect(pts(WEST, 'mayor', { option: 'raise-roads', amendment: 'access-guarantee' })).toBe(2);
    expect(pts(WEST, 'resident', { option: 'elevate-properties', amendment: 'access-guarantee' })).toBe(3);
    expect(pts(WEST, 'activist', { option: 'improve-drainage', amendment: 'discharge-monitoring' })).toBe(3);
    expect(pts(WEST, 'resort', { option: 'improve-drainage', amendment: 'parking-relief' })).toBe(3);
    for (const s of PLAN_SCENARIOS) for (const p of PERSONAS) for (const c of allConfigs(s)) expect(pts(s, p, c)).toBeLessThanOrEqual(3);
  });

  it('give nothing for doing nothing to a stakeholder who needed something built', () => {
    for (const s of PLAN_SCENARIOS) for (const p of PERSONAS) expect(pts(s, p, STATUS_QUO)).toBe(0);
  });

  it('can zero the Mayor on a plan the Mayor controls and the city approves', () => {
    // Mid-Beach: groins and breakwaters are approved, protect the shore, and still fail the Mayor's reserve, federal-share and open-beach objectives
    const g: PlanConfig = { option: 'groins-breakwaters', amendment: null };
    expect(isFeasible(MID, g)).toBe(true);
    const r = resolvePlanRound({ scenario: MID, players, leading: { option: 'groins-breakwaters', sponsorSeat: 0 }, offers: [], votes: yes(4) });
    expect(r.verdict).toBe('approved');
    expect(r.scores.find((s) => s.persona === 'mayor')).toMatchObject({ mandate: 0, feasibility: 1 });
    // ...and the critical objective zeroes it when the problem is not addressed at all
    expect(pts(WEST, 'mayor', { option: 'elevate-properties', amendment: null })).toBe(1);
    const failed = outcomePoints(WEST, 'mayor', blockedOutcome('improve-drainage'));
    expect(failed.points).toBe(0);
    expect(failed.parts[0]!.because).toMatch(/Critical/);
  });

  it('score a failed proposal by what it did to each stakeholder', () => {
    const stopped = (sc: PlanScenario, p: PersonaId, option: string | null) => outcomePoints(sc, p, blockedOutcome(option)).points;
    // stopping a harmful or unaffordable project is a real success for some, and a failure for others
    expect(stopped(MID, 'activist', 'groins-breakwaters')).toBe(1);
    expect(stopped(MID, 'mayor', 'groins-breakwaters')).toBe(1);
    expect(stopped(MID, 'resort', 'groins-breakwaters')).toBe(0);
    expect(stopped(WEST, 'resort', 'raise-roads')).toBe(1);
    expect(stopped(WEST, 'mayor', 'raise-roads')).toBe(0);
    expect(stopped(POINTE, 'activist', 'tower-for-park')).toBe(1);
    expect(stopped(POINTE, 'resident', 'tower-for-park')).toBe(1);
    expect(stopped(POINTE, 'resort', 'tower-for-park')).toBe(0);
    expect(stopped(POINTE, 'mayor', 'city-park')).toBe(1);
    expect(stopped(POINTE, 'mayor', 'tower-for-park')).toBe(0);
    // nothing put forward at all
    for (const s of PLAN_SCENARIOS) for (const p of PERSONAS) expect(stopped(s, p, null)).toBe(0);
  });

  it('tell the player which objective was met and which was missed', () => {
    const r = mandatePoints(WEST, 'mayor', { option: 'raise-roads', amendment: 'access-guarantee' });
    expect(r.parts.some((p) => p.because.startsWith('✔'))).toBe(true);
    expect(r.parts.some((p) => p.because.startsWith('✘'))).toBe(true);
    expect(r.parts.map((p) => p.points).reduce((a, b) => a + b, 0)).toBe(r.points);
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
    expect(resident).toMatchObject({ mandate: 2, deal: 2, feasibility: 1, total: 5 });
    const mayor = r.scores.find((s) => s.persona === 'mayor')!;
    expect(mayor).toMatchObject({ mandate: 2, deal: 1, feasibility: 1, total: 4 });
    const resort = r.scores.find((s) => s.persona === 'resort')!;
    expect(resort).toMatchObject({ mandate: 1, deal: 0, feasibility: 1 });
    for (const s of r.scores) {
      expect(s.total).toBeLessThanOrEqual(6);
      expect(s.parts.mandate.length + s.parts.deal.length + s.parts.feasibility.length).toBeGreaterThanOrEqual(3);
      for (const part of [...s.parts.mandate, ...s.parts.deal, ...s.parts.feasibility]) expect(part.because.length).toBeGreaterThan(5);
    }
  });

  it('needs three of four votes, otherwise the status quo stands and each role scores what that means for them', () => {
    const r = resolvePlanRound({ scenario: WEST, players, leading, offers: accepted, votes: yes(2) });
    expect(r.verdict).toBe('rejected');
    expect(r.adopted).toEqual(STATUS_QUO);
    // no deal and no city point, but stopping the road works is a success for the Resort Owner and nobody else
    expect(r.scores.every((s) => s.deal === 0 && s.feasibility === 0)).toBe(true);
    expect(Object.fromEntries(r.scores.map((s) => [s.persona, s.mandate]))).toEqual({ mayor: 0, activist: 0, resort: 1, resident: 0 });
  });

  it('delays a plan that passes the vote but breaks a constraint, and applies the status quo', () => {
    const r = resolvePlanRound({ scenario: WEST, players, leading, offers: [], votes: yes(4) });
    expect(r.verdict).toBe('delayed');
    expect(r.blockedBy).toMatch(/liability|property-access/i);
    expect(r.adopted).toEqual(STATUS_QUO);
    expect(r.scores.every((s) => s.feasibility === 0 && s.deal === 0)).toBe(true);
    // a delayed plan is a stopped plan for scoring: the Resort Owner, who wanted the road works stopped, still gets that
    expect(r.scores.find((s) => s.persona === 'resort')!.mandate).toBe(1);
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

describe('bots play their own objectives', () => {
  it('pick the project that serves them best', () => {
    expect(botPick(WEST, 'resort')).toBe('improve-drainage');
    expect(botPick(WEST, 'resident')).toBe('elevate-properties');
    expect(botPick(MID, 'mayor')).toBe('more-sand');
    expect(botPick(MID, 'activist')).not.toBe('groins-breakwaters');
  });
  it('the Mayor bot puts forward the submitted card that serves the Mayor best', () => {
    expect(botMayorChoice(WEST, { 0: 'raise-roads', 1: 'elevate-properties', 2: 'improve-drainage', 3: 'raise-roads' })).toBe('improve-drainage');
    expect(botMayorChoice(WEST, { 1: 'elevate-properties', 3: 'raise-roads' })).toBe('raise-roads');
    expect(botMayorChoice(WEST, {})).toBeNull();
  });
  it('ask for the amendment that lifts their own score, and sponsors accept sensible ones', () => {
    expect(botOffer(WEST, 'resident', 'raise-roads')).toBe('access-guarantee');
    expect(botOffer(POINTE, 'resident', 'tower-for-park')).toBe('park-open-to-all');
    expect(botOffer(POINTE, 'mayor', 'tower-for-park')).toBe('park-open-to-all');
    expect(botAccepts(WEST, 'mayor', 'raise-roads', 'access-guarantee')).toBe(true);
    expect(botAccepts(POINTE, 'mayor', 'tower-for-park', 'park-open-to-all')).toBe(true);
    // an amendment that does not fit the project is never accepted
    expect(botAccepts(POINTE, 'mayor', 'shorter-tower', 'step-the-tower-back')).toBe(false);
  });
  it('vote on what a plan really does against what stopping it does', () => {
    // the Activist would rather see the tower stopped than approved with only a park guarantee
    expect(botVote(POINTE, 'activist', { option: 'tower-for-park', amendment: 'park-open-to-all' })).toBe(false);
    // the Resort Owner wants it
    expect(botVote(POINTE, 'resort', { option: 'tower-for-park', amendment: 'park-open-to-all' })).toBe(true);
    // a plan that cannot go ahead is judged as a stopped plan: the Mayor gains nothing from it
    expect(botVote(WEST, 'mayor', { option: 'raise-roads', amendment: null })).toBe(false);
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
