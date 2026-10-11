import { describe, expect, it } from 'vitest';
import { MIN_N, atlasInsights, atlasTables, casesOf, compare, rate } from './atlas';
import { makeCrisis, type CrisisKind } from './scenario';
import { newMatchRecord, type MatchRecord, type ParticipantKind, type SessionKind } from './record';
import type { Outcome } from './engine';
import type { PersonaId, ProjectKind } from './content';

let uid = 0;
interface P { kind: ProjectKind; district: string; persona?: PersonaId; status: Outcome['status']; support?: number; opposition?: number; rules?: string[]; offered?: 'access' | 'setback'; accepted?: boolean }

/** A finished match of `rounds`, each round `crisis` and proposals `ps`. */
function match(ps: P[][], opts: { crisis?: CrisisKind; session?: SessionKind; participant?: ParticipantKind; viable?: boolean } = {}): MatchRecord {
  const players = (['mayor', 'activist', 'resort', 'resident'] as PersonaId[]).map((persona, seat) => ({ seat, name: `P${seat}`, persona, participant: opts.participant ?? 'human' }));
  const m = newMatchRecord(`00000000-0000-4000-8000-${String(++uid).padStart(12, '0')}`, 'TEST', opts.session ?? 'demo', players, new Date('2026-10-11T12:00:00Z'));
  const ind = { flood: 40, economy: 50, environment: 40, access: 50, budget: 30 };
  ps.forEach((round, i) => {
    const r = i + 1;
    const proposals = round.map((p, j) => ({ id: `r${r}-p${j}`, round: r, seat: players.findIndex((x) => x.persona === (p.persona ?? 'mayor')), persona: p.persona ?? 'mayor', kind: p.kind, district: p.district, carried: false }));
    m.rounds.push({
      round: r, crisis: makeCrisis(r, opts.crisis ?? 'flood', 'T', 'text', ['south-pointe'], [], 'authored'),
      proposals, attachments: [],
      compromises: round.flatMap((p, j) => (p.offered ? [{ id: `c${r}-${j}`, kind: p.offered, proposalId: `r${r}-p${j}`, offeredBy: 1, owner: 0, accepted: !!p.accepted, title: p.offered, text: '' }] : [])),
      actions: [], events: round.flatMap((p, j) => (p.rules ?? []).map((rule, k) => ({ id: `e${r}-${j}-${k}`, rule, text: rule, proposalId: `r${r}-p${j}` }))),
      outcomes: round.map((p, j) => ({
        proposalId: `r${r}-p${j}`, kind: p.kind, district: p.district, seat: proposals[j]!.seat, persona: p.persona ?? 'mayor', status: p.status,
        support: p.support ?? 1, opposition: p.opposition ?? 0, ignored: 0, funding: null, delta: {}, conditions: [], rules: (p.rules ?? []).map((_, k) => `e${r}-${j}-${k}`),
      })),
      before: ind, after: ind, headline: 'h', resolvedAt: '2026-10-11T12:00:00Z',
    });
  });
  m.final = { indicators: ind, viable: opts.viable ?? true, failing: [], scores: players.map((p) => ({ persona: p.persona, total: 10, parts: [] })), winners: ['mayor'] };
  m.endedAt = '2026-10-11T12:30:00Z';
  return m;
}

describe('statistics', () => {
  it('Wilson interval brackets the rate and tightens with more cases', () => {
    const a = rate(8, 10);
    const b = rate(80, 100);
    expect(a.p).toBe(0.8);
    expect(a.lo!).toBeLessThan(0.8);
    expect(a.hi!).toBeGreaterThan(0.8);
    expect(b.hi! - b.lo!).toBeLessThan(a.hi! - a.lo!);
    expect(rate(0, 0).p).toBeNull();
  });
  it('calls a difference real only when the test passes on enough cases', () => {
    expect(compare(rate(18, 20), rate(4, 20))!.significant).toBe(true);
    expect(compare(rate(3, 4), rate(0, 4))!.significant).toBe(false); // too few, however large the gap
    expect(compare(rate(10, 20), rate(11, 20))!.significant).toBe(false);
  });
});

describe('cases', () => {
  it('follows a proposal across rounds to its final outcome, counted once', () => {
    const m = match([[{ kind: 'hotel', district: 'south-pointe', status: 'delayed' }], [{ kind: 'drainage', district: 'west-avenue', status: 'approved' }]]);
    // The same proposal id comes back approved in round 2.
    m.rounds[1]!.proposals.push({ ...m.rounds[0]!.proposals[0]!, carried: true });
    m.rounds[1]!.outcomes.push({ ...m.rounds[0]!.outcomes[0]!, status: 'approved' });
    const cs = casesOf([m]);
    expect(cs).toHaveLength(2);
    const hotel = cs.find((c) => c.kind === 'hotel')!;
    expect(hotel.status).toBe('approved');
    expect(hotel.delayed).toBe(true);
  });
  it('leaves bots out unless asked', () => {
    const bots = match([[{ kind: 'dune', district: 'south-pointe', status: 'approved' }]], { participant: 'bot' });
    expect(casesOf([bots])).toHaveLength(0);
    expect(casesOf([bots], false)).toHaveLength(1);
  });
});

describe('atlas', () => {
  const many = (n: number, f: (i: number) => P[][], opts?: Parameters<typeof match>[1]) => Array.from({ length: n }, (_, i) => match(f(i), opts));

  it('counts add up: every proposal is in exactly one area and one project kind', () => {
    const ms = many(10, () => [[{ kind: 'dune', district: 'south-pointe', status: 'approved' }, { kind: 'hotel', district: 'west-avenue', status: 'rejected', opposition: 3 }]]);
    const a = atlasInsights(ms);
    expect(a.scope.cases).toBe(20);
    expect(a.places.reduce((n, p) => n + p.n, 0)).toBe(20);
    expect(a.kinds.reduce((n, k) => n + k.n, 0)).toBe(20);
    expect(a.scope.decisions).toBeGreaterThan(20);
  });

  it('only states a place difference when both places have enough cases', () => {
    const thin = atlasInsights(many(2, () => [[{ kind: 'dune', district: 'south-pointe', status: 'approved' }, { kind: 'hotel', district: 'west-avenue', status: 'rejected' }]]));
    expect(thin.insights.filter((i) => i.tab === 'places')).toHaveLength(0);
    const firm = atlasInsights(many(MIN_N + 2, () => [[{ kind: 'dune', district: 'south-pointe', status: 'approved' }, { kind: 'hotel', district: 'west-avenue', status: 'rejected' }]]));
    const f = firm.insights.find((i) => i.tab === 'places');
    expect(f?.text).toMatch(/South Pointe/);
    expect(['strong', 'moderate']).toContain(f?.strength);
  });

  it('measures what a concession buys against the same projects without it', () => {
    const withDeal = many(12, () => [[{ kind: 'hotel', district: 'collins-mid-beach', status: 'approved', offered: 'access', accepted: true }]]);
    const without = many(12, () => [[{ kind: 'hotel', district: 'collins-mid-beach', status: 'rejected' }]]);
    // A hotel with the access guarantee taken vs a hotel that was never offered one.
    const a = atlasInsights([...withDeal, ...without]);
    const c = a.concessions.find((x) => x.kind === 'access')!;
    expect(c.passAccepted.p).toBe(1);
    expect(c.passNone.p).toBe(0);
    expect(c.lift).toBe(1);
    expect(c.significant).toBe(true);
    expect(a.insights.some((i) => /Public access guarantee/.test(i.text))).toBe(true);
  });

  it('conditions scenario comparisons on the crisis the proposal was made under', () => {
    const flood = many(10, () => [[{ kind: 'drainage', district: 'south-pointe', status: 'approved' }]], { crisis: 'flood' });
    const dev = many(10, () => [[{ kind: 'hotel', district: 'south-pointe', status: 'rejected' }]], { crisis: 'development' });
    const a = atlasInsights([...flood, ...dev]);
    const f = a.scenarios.find((s) => s.kind === 'flood')!;
    expect(f.approved.p).toBe(1);
    expect(f.lift).toBe(1);
    expect(f.mix[0]!.kind).toBe('drainage');
    const only = atlasInsights([...flood, ...dev], { scenario: 'development' });
    expect(only.scope.cases).toBe(10);
    expect(only.kinds.map((k) => k.kind)).toEqual(['hotel']);
    // The comparison dimension itself is never filtered away.
    expect(only.scenarios.map((s) => s.kind).sort()).toEqual(['development', 'flood']);
  });

  it('separates regulatory stops from social ones', () => {
    const ms = many(10, (i) => [[{ kind: 'hotel', district: 'south-pointe', status: i % 2 ? 'blocked' : 'rejected', rules: [i % 2 ? 'R1' : 'O2'] }]]);
    const a = atlasInsights(ms);
    expect(a.rules.find((r) => r.rule === 'R1')?.type).toBe('regulatory');
    expect(a.rules.find((r) => r.rule === 'O2')?.type).toBe('social');
    expect(a.insights.some((i) => /regulatory rule/.test(i.text))).toBe(true);
  });

  it('keeps sessions apart and exports every table as flat rows', () => {
    const ms = [...many(4, () => [[{ kind: 'dune', district: 'south-pointe', status: 'approved' }]], { session: 'community' }), ...many(6, () => [[{ kind: 'hotel', district: 'south-pointe', status: 'rejected' }]], { session: 'demo' })];
    expect(atlasInsights(ms, { sessionKind: 'community' }).scope.cases).toBe(4);
    expect(atlasInsights(ms, { sessionKind: 'demo' }).scope.sessions).toEqual({ demo: 6, community: 0 });
    const t = atlasTables(atlasInsights(ms));
    for (const [name, table] of Object.entries(t)) {
      expect(table.columns.length, name).toBeGreaterThan(0);
      for (const row of table.rows) expect(row.length, name).toBe(table.columns.length);
    }
  });
});
