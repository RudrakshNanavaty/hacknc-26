import { beforeEach, describe, expect, it } from 'vitest';
import { PLAN_CSV_COLUMNS, PLAN_SCENARIOS, isPlanMatch, planAtlas, planCsv, type MatchRecord, type PersonaId } from '@shared';
import { done, getOrCreateRoom, join, planOffer, planPersonal, planPick, planVote, rooms, setBot, skip, start, type Room } from './rooms';

const T0 = 2_000_000;

/** A finished match with one person playing `persona`, who picks `pick` every round and may say what they personally prefer (the option at index `personal`). */
function match(code: string, persona: PersonaId, pick: string | ((round: number) => string), opts: { kind?: 'demo' | 'community'; personal?: number; offer?: boolean } = {}): { room: Room; record: MatchRecord } {
  rooms.delete(code);
  const room = getOrCreateRoom(code, 0);
  const me = join(room, 'Ana', persona);
  if (opts.kind) room.sessionKind = opts.kind;
  start(room, me, T0);
  let t = T0;
  for (let i = 0; room.phase !== 'final' && i < 300; i++) {
    t += 1000;
    if (room.phase === 'select' && opts.personal !== undefined && !room.plan!.cur!.personal.get(me.seat)?.before) planPersonal(room, me, { stage: 'before', option: room.plan!.cur!.scenario.options[opts.personal]!.id }, t);
    if (room.phase === 'select' && !room.plan!.cur!.picks[me.seat]) {
      const sc = room.plan!.cur!.scenario;
      planPick(room, me, typeof pick === 'string' ? sc.options.find((o) => o.id === pick)?.id ?? sc.options[0]!.id : pick(room.round), t);
    } else if (room.phase === 'deal' && opts.offer && !room.plan!.cur!.offers.some((o) => o.seat === me.seat) && room.plan!.cur!.leading!.sponsorSeat !== me.seat) {
      const sc = room.plan!.cur!.scenario;
      const a = sc.amendments.find((x) => x.appliesTo.includes(room.plan!.cur!.leading!.option));
      if (a) planOffer(room, me, a.id, t);
      skip(room, me, t);
    } else if (room.phase === 'vote' && room.plan!.cur!.votes[me.seat] === undefined) planVote(room, me, true, t);
    else if (room.phase === 'result' && opts.personal !== undefined) {
      if (!room.plan!.cur!.personal.get(me.seat)?.after) planPersonal(room, me, { stage: 'after', option: room.plan!.cur!.scenario.options[opts.personal]!.id, reason: 'safety', moved: false }, t);
      skip(room, me, t);
    } else skip(room, me, t);
  }
  return { room, record: room.record! };
}

describe('Civic Atlas, Planning Edition', () => {
  beforeEach(() => rooms.clear());

  it('adds matches up with sample sizes, and keeps demo, community and bots apart', () => {
    const a = match('QZSA', 'resident', 'raise-roads', { kind: 'demo' }).record;
    const b = match('QZSB', 'resort', 'improve-drainage', { kind: 'community' }).record;
    expect(isPlanMatch(a) && isPlanMatch(b)).toBe(true);
    const all = planAtlas([a, b], { sessionKind: 'all', humansOnly: true });
    expect(all.scope).toMatchObject({ matches: 2, completed: 2, humanSeats: 2, botSeats: 6, sessions: { community: 1, demo: 1 } });
    expect(planAtlas([a, b], { sessionKind: 'community', humansOnly: true }).scope.matches).toBe(1);
    // with bots left out, only the two people's cards are counted
    const west = all.decisions[0]!;
    expect(west.rounds).toBe(2);
    expect(west.picks.reduce((s, p) => s + p.rate.k, 0)).toBe(2);
    expect(planAtlas([a, b], { sessionKind: 'all', humansOnly: false }).decisions[0]!.picks.reduce((s, p) => s + p.rate.k, 0)).toBe(8);
    expect(west.picks[0]!.rate.n).toBe(2);
  });

  it('shows the real issues with their sources, options and amendments', () => {
    const a = planAtlas([], { sessionKind: 'all', humansOnly: true });
    expect(a.issues).toHaveLength(3);
    for (const i of a.issues) {
      expect(i.sources.length).toBeGreaterThanOrEqual(2);
      expect(i.options).toHaveLength(3);
      expect(i.amendments.length).toBeGreaterThanOrEqual(2);
    }
    expect(a.scope.matches).toBe(0);
    expect(a.insights).toEqual([]);
  });

  it('counts requested and accepted amendments, and the model comparison', () => {
    const { record } = match('QZSC', 'resident', 'raise-roads', { offer: true });
    const a = planAtlas([record], { sessionKind: 'all', humansOnly: true });
    const west = a.decisions[0]!;
    expect(west.amendments.some((x) => x.offered >= 1)).toBe(true);
    expect(a.explorer.finished).toBe(1);
    expect(a.explorer.distinctPlans).toBe(1);
    expect(a.explorer.top[0]!.count).toBe(1);
    expect(a.explorer.totalPlans).toBe(1400);
    expect(a.explorer.alternatives).toHaveLength(3);
    expect(a.explorer.agreement).toHaveLength(3);
    expect(a.insights.length).toBeGreaterThan(0);
    // every finding names its sample, and a handful of matches is a lead, not a conclusion
    for (const i of a.insights) {
      expect(i.n).toBeGreaterThan(0);
      expect(i.strength).toBe('lead');
      expect(i.matchIds.length).toBeGreaterThan(0);
    }
  });

  it('keeps personal answers apart from role picks', () => {
    const { record } = match('QZSD', 'resident', 'raise-roads', { personal: 1 });
    const west = planAtlas([record], { sessionKind: 'all', humansOnly: true }).decisions[0]!;
    expect(west.personal.answers).toBe(1);
    expect(west.personal.before['improve-drainage']).toBe(1);
    expect(west.personal.after['improve-drainage']).toBe(1);
    expect(west.personal.reasons.safety).toBe(1);
    expect(west.picks.find((p) => p.option === 'improve-drainage')!.rate.k).toBe(0);
    expect(west.personal.sameAsRolePick.n).toBe(1);
    expect(west.personal.sameAsRolePick.k).toBe(0);
  });

  it('leaves bots out of personal answers and exports one row per seat per round', () => {
    const { record } = match('QZSE', 'mayor', 'raise-roads', { personal: 0 });
    const csv = planCsv([record]).trim().split('\n');
    expect(csv[0]!.split(',')).toEqual([...PLAN_CSV_COLUMNS]);
    expect(csv).toHaveLength(1 + 3 * 4);
    const header = csv[0]!.split(',');
    const col = (row: string, name: string) => row.split(',')[header.indexOf(name)];
    const humanRows = csv.slice(1).filter((r) => col(r, 'participant') === 'human');
    expect(humanRows).toHaveLength(3);
    expect(humanRows.every((r) => col(r, 'personal_after') !== '')).toBe(true);
    expect(csv.slice(1).filter((r) => col(r, 'participant') === 'bot').every((r) => col(r, 'personal_after') === '')).toBe(true);
    expect(PLAN_SCENARIOS.map((s) => s.id)).toContain(col(csv[1]!, 'scenario'));
    void done;
    void setBot;
  });
});
