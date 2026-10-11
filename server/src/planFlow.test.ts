import { beforeEach, describe, expect, it } from 'vitest';
import { PLAN_ROUNDS, PLAN_RULES_VERSION, PLAN_SCENARIOS, STATUS_QUO, planOutcome, type PersonaId } from '@shared';
import { PROPOSE_BEAT_MS } from './planFlow';
import {
  RoomError, again, done, getOrCreateRoom, join, planDecide, planLead, planOffer, planPersonal, planPick, planStance, planVote, publicState, rooms, setBot, setPace, skip, start, tick,
  type Player, type Room,
} from './rooms';

const T0 = 1_000_000;

function table(code: string, human: PersonaId, others: PersonaId[] = []) {
  rooms.delete(code);
  const room = getOrCreateRoom(code, 0);
  const me = join(room, 'Ana', human);
  for (const p of others) join(room, `P-${p}`, p);
  return { room, me };
}
const seatOf = (room: Room, persona: PersonaId) => room.players.find((p) => p.persona === persona)!;
const bots = (room: Room, host: Player, personas: PersonaId[]) => personas.forEach((p) => setBot(room, host, p, true));

describe('Planning Edition: one round, step by step', () => {
  beforeEach(() => rooms.clear());

  it('fills every empty seat with a bot, so four votes and a Mayor always exist', () => {
    const { room, me } = table('QZAA', 'resident');
    start(room, me, T0);
    expect(room.rules).toBe('planning');
    expect(room.players.map((p) => p.persona).sort()).toEqual(['activist', 'mayor', 'resident', 'resort']);
    expect(room.players.filter((p) => p.bot)).toHaveLength(3);
    expect(room.record?.rulesVersion).toBe(PLAN_RULES_VERSION);
    expect(room.record?.plan?.scenarios).toEqual(PLAN_SCENARIOS.map((s) => s.id));
    expect(room.phase).toBe('select');
  });

  it('opens on the real story and the three cards together, then keeps each card private until the table reveals', () => {
    const { room, me } = table('QZAB', 'resident');
    start(room, me, T0);
    const s = publicState(room, me, T0);
    expect(s.plan?.scenarioId).toBe(PLAN_SCENARIOS[0]!.id);
    expect(room.phase).toBe('select');
    // bots have chosen, but nobody's card is public yet, and a viewer only sees their own pick
    expect(publicState(room, me, T0).plan?.picks).toBeNull();
    planPick(room, me, 'raise-roads', T0 + 2);
    expect(room.phase).toBe('propose');
    const open = publicState(room, me, T0 + 3);
    expect(open.plan?.picks?.[me.seat]).toBe('raise-roads');
    expect(Object.keys(open.plan!.picks!)).toHaveLength(4);
    expect(open.mine?.plan?.pick).toBe('raise-roads');
  });

  it('lets a person pick only one of the three projects, once', () => {
    const { room, me } = table('QZAC', 'resident');
    start(room, me, T0);
    expect(() => planPick(room, me, 'not-a-card', T0 + 2)).toThrow(RoomError);
    planPick(room, me, 'elevate-properties', T0 + 2);
    expect(() => planPick(room, me, 'raise-roads', T0 + 3)).toThrow(RoomError);
  });

  it('has the Mayor put one forward; others cannot, and it must be a card that was played', () => {
    const { room, me } = table('QZAD', 'mayor');
    start(room, me, T0);
    planPick(room, me, 'raise-roads', T0 + 2);
    expect(room.phase).toBe('propose');
    const resident = seatOf(room, 'resident');
    expect(() => planLead(room, resident, 'raise-roads', T0 + 3)).toThrow(/Mayor/);
    expect(() => planLead(room, me, 'made-up', T0 + 3)).toThrow(RoomError);
    planLead(room, me, 'raise-roads', T0 + 3);
    expect(room.phase).toBe('deal');
    expect(room.plan!.cur!.leading).toMatchObject({ option: 'raise-roads', chosenBySeat: me.seat });
  });

  it("plays the spec's example: the Resident asks for the Property Access Guarantee, the Mayor accepts, 3 of 4 vote, and it is the plan", () => {
    const { room, me } = table('QZAE', 'mayor');
    start(room, me, T0);
    planPick(room, me, 'raise-roads', T0 + 2);
    planLead(room, me, 'raise-roads', T0 + 3);
    // the Resident bot asks for its amendment on its own
    const resident = seatOf(room, 'resident');
    expect(room.plan!.cur!.offers.find((o) => o.seat === resident.seat)).toMatchObject({ amendment: 'access-guarantee', state: 'open' });
    planDecide(room, me, resident.seat, true, T0 + 4);
    expect(room.plan!.cur!.accepted).toEqual({ amendment: 'access-guarantee', bySeat: resident.seat });
    // a second amendment is no longer allowed
    expect(() => planOffer(room, seatOf(room, 'resort'), 'parking-relief', T0 + 5)).toThrow(RoomError);
    done(room, me, T0 + 6);
    expect(room.phase).toBe('vote');
    planVote(room, me, true, T0 + 7);
    expect(room.phase).toBe('result');
    const r = room.plan!.rounds[0]!;
    expect(r.adopted).toEqual({ option: 'raise-roads', amendment: 'access-guarantee' });
    expect(r.cost).toBe(9);
    expect(r.scores.find((x) => x.persona === 'resident')).toMatchObject({ mandate: 3, deal: 2, feasibility: 1, total: 6 });
    expect(r.scores.every((x) => x.total <= 6)).toBe(true);
    expect(room.record!.plan!.rounds[0]).toBe(r);
  });

  it('delays a plan that passes but breaks its constraint, and applies the status quo', () => {
    const { room, me } = table('QZAF', 'mayor');
    start(room, me, T0);
    planPick(room, me, 'raise-roads', T0 + 2);
    planLead(room, me, 'raise-roads', T0 + 3);
    // the Mayor declines the only amendment that would unblock the project
    const resident = seatOf(room, 'resident');
    planDecide(room, me, resident.seat, false, T0 + 4);
    done(room, me, T0 + 5);
    planVote(room, me, true, T0 + 6);
    const r = room.plan!.rounds[0]!;
    expect(['delayed', 'rejected']).toContain(r.verdict);
    expect(r.adopted).toEqual(STATUS_QUO);
    expect(r.scores.every((s) => s.feasibility === 0)).toBe(true);
  });

  it('only the sponsor settles a deal, and nobody offers to themselves', () => {
    const { room, me } = table('QZAG', 'resident');
    start(room, me, T0);
    planPick(room, me, 'raise-roads', T0 + 2); // the Mayor bot's own mandate favours raising roads
    expect(room.phase).toBe('propose');
    tick(room, T0 + 3 + PROPOSE_BEAT_MS);
    expect(room.phase).toBe('deal');
    const sponsor = room.players[room.plan!.cur!.leading!.sponsorSeat]!;
    expect(() => planOffer(room, sponsor, 'access-guarantee', T0 + 4)).toThrow(RoomError);
    expect(() => planDecide(room, me, 0, true, T0 + 4)).toThrow(RoomError);
  });

  it('takes a stance only while dealing', () => {
    const { room, me } = table('QZAH', 'resident');
    start(room, me, T0);
    expect(() => planStance(room, me, 'support', T0 + 1)).toThrow(RoomError);
    planPick(room, me, 'raise-roads', T0 + 2);
    tick(room, T0 + 3 + PROPOSE_BEAT_MS);
    planStance(room, me, 'oppose', T0 + 4 + PROPOSE_BEAT_MS);
    expect(publicState(room, me, T0).plan!.stances[me.seat]).toBe('oppose');
    expect(() => planStance(room, me, 'maybe' as never, T0 + 5)).toThrow(RoomError);
  });
});

describe('Planning Edition: a whole match', () => {
  beforeEach(() => rooms.clear());

  /** Drive a match with a person who picks the first card and takes no stand; skip when the table waits on a person. */
  function playThrough(room: Room, host: Player) {
    let t = T0;
    for (let i = 0; room.phase !== 'final' && i < 200; i++) {
      t += 1_000;
      if (room.phase === 'select' && !room.plan!.cur!.picks[host.seat]) planPick(room, host, room.plan!.cur!.scenario.options[0].id, t);
      else if (room.phase === 'vote' && room.plan!.cur!.votes[host.seat] === undefined) planVote(room, host, true, t);
      else skip(room, host, t);
    }
  }

  it('three rounds, one scenario each, ends on the plan, 18 points at most, saved in the record', () => {
    const { room, me } = table('QZAJ', 'resident');
    start(room, me, T0);
    playThrough(room, me);
    expect(room.phase).toBe('final');
    const m = room.plan!;
    expect(m.rounds).toHaveLength(PLAN_ROUNDS);
    expect(m.rounds.map((r) => r.scenarioId)).toEqual(PLAN_SCENARIOS.map((s) => s.id));
    expect(new Set(m.rounds.map((r) => r.district)).size).toBe(3);
    for (const t of m.final!.totals) {
      expect(t.total).toBeLessThanOrEqual(18);
      expect(t.total).toBe(t.mandate + t.deal + t.feasibility);
    }
    expect(m.final!.winners.length).toBeGreaterThan(0);
    expect(m.final!.plan).toEqual(m.rounds.map((r) => r.adopted));
    const rec = room.record!;
    expect(rec.rulesVersion).toBe(PLAN_RULES_VERSION);
    expect(rec.endedAt).not.toBeNull();
    expect(rec.plan!.final).toEqual(m.final);
    expect(rec.plan!.simulated).toMatchObject({ key: planOutcome(m.final!.plan).key });
    // the legacy fields stay empty: this is not the card game
    expect(rec.rounds).toHaveLength(0);
    expect(rec.final).toBeNull();
  });

  it('is deterministic: the same choices give the same plan and scores', () => {
    const run = (code: string) => {
      const { room, me } = table(code, 'resident');
      start(room, me, T0);
      playThrough(room, me);
      return room.plan!.rounds.map((r) => ({ verdict: r.verdict, adopted: r.adopted, totals: r.scores.map((s) => s.total) }));
    };
    expect(run('QZAK')).toEqual(run('QZAL'));
  });

  it('a sprint puts every step on a short deadline and finishes in about two minutes with nobody touching it', () => {
    const { room, me } = table('QZAM', 'resident');
    setPace(room, me, 'sprint');
    start(room, me, T0);
    let t = T0;
    while (room.phase !== 'final' && t - T0 < 300_000) {
      t += 250;
      tick(room, t);
    }
    expect(room.phase).toBe('final');
    expect(t - T0).toBeLessThanOrEqual(130_000);
    expect(room.plan!.rounds).toHaveLength(3);
    // nobody played, so nothing was put forward by a person; the bots' cards were still counted
    expect(room.plan!.rounds.every((r) => r.scores.every((s) => s.total <= 6))).toBe(true);
  });

  it('turn-based has no clock', () => {
    const { room, me } = table('QZAN', 'resident');
    start(room, me, T0);
    expect(room.endsAt).toBeNull();
    expect(tick(room, T0 + 3_600_000)).toBe(false);
    expect(room.phase).toBe('select');
  });

  it('can be played again from the lobby', () => {
    const { room, me } = table('QZAP', 'resident');
    start(room, me, T0);
    playThrough(room, me);
    again(room, me);
    expect(room.phase).toBe('lobby');
    expect(room.plan).toBeNull();
    start(room, me, T0 + 1_000_000);
    expect(room.phase).toBe('select');
    expect(room.plan!.rounds).toHaveLength(0);
  });
});

describe('Planning Edition: personal answers stay apart from the role', () => {
  beforeEach(() => rooms.clear());

  it('are voluntary, never scored, and kept in their own list', () => {
    const { room, me } = table('QZAQ', 'resident');
    start(room, me, T0);
    planPersonal(room, me, { stage: 'before', option: 'improve-drainage' }, T0 + 1);
    planPick(room, me, 'raise-roads', T0 + 3);
    expect(room.record!.plan!.personal).toHaveLength(1);
    expect(room.record!.plan!.personal[0]).toMatchObject({ persona: 'resident', participant: 'human', before: 'improve-drainage', after: null });
    // the role-play pick is untouched by it
    expect(room.plan!.cur!.picks[me.seat]).toBe('raise-roads');
    // 'after' only after the result
    expect(() => planPersonal(room, me, { stage: 'after', option: 'raise-roads', reason: 'safety' }, T0 + 4)).toThrow(RoomError);
    for (let t = 5; room.phase !== 'result' && t < 60; t++) {
      if (room.phase === 'vote' && room.plan!.cur!.votes[me.seat] === undefined) planVote(room, me, false, T0 + t);
      else skip(room, me, T0 + t);
    }
    expect(room.phase).toBe('result');
    planPersonal(room, me, { stage: 'after', option: 'raise-roads', reason: 'safety', moved: true, comment: '  keep  my   street dry ' }, T0 + 100);
    expect(room.record!.plan!.personal[0]).toMatchObject({ before: 'improve-drainage', after: 'raise-roads', reason: 'safety', movedByAmendment: true, comment: 'keep my street dry' });
    // scores were computed without it
    const r = room.plan!.rounds[0]!;
    expect(r.scores.every((s) => s.total <= 6)).toBe(true);
  });

  it('refuse bots, unknown projects and bad stages', () => {
    const { room, me } = table('QZAR', 'resident');
    start(room, me, T0);
    const bot = room.players.find((p) => p.bot)!;
    expect(() => planPersonal(room, bot, { stage: 'before', option: 'raise-roads' }, T0 + 1)).toThrow(/Bots/);
    expect(() => planPersonal(room, me, { stage: 'before', option: 'moon-base' }, T0 + 1)).toThrow(RoomError);
    expect(() => planPersonal(room, me, { stage: 'during', option: 'raise-roads' }, T0 + 1)).toThrow(RoomError);
    planPersonal(room, me, { stage: 'before', option: null }, T0 + 1);
    expect(room.record!.plan!.personal[0]!.before).toBe('none');
  });
});

describe('Planning Edition: a bot sponsor settles at the end of the deal', () => {
  beforeEach(() => rooms.clear());

  it('waits for the table, so a person can ask, and prefers the offer that clears a blocker', () => {
    const { room, me } = table('QZRA', 'activist');
    start(room, me, T0);
    planPick(room, me, 'elevate-properties', T0 + 2);
    tick(room, T0 + 3 + PROPOSE_BEAT_MS); // the Mayor bot put one forward and the table moves on
    const d = room.plan!.cur!;
    expect(room.phase).toBe('deal');
    // nothing is accepted yet, even though bots have asked
    expect(d.accepted).toBeNull();
    expect(d.offers.every((o) => o.state === 'open')).toBe(true);
    done(room, me, T0 + 4);
    expect(room.phase).toBe('vote');
    // by the time the vote opens the sponsor has answered every offer
    expect(d.offers.every((o) => o.state !== 'open')).toBe(true);
    expect(d.offers.filter((o) => o.state === 'accepted').length).toBeLessThanOrEqual(1);
  });

  it('takes a person\'s offer over a bot\'s when both would clear the same blocker', () => {
    const { room, me } = table('QZRB', 'resident');
    start(room, me, T0);
    planPick(room, me, 'raise-roads', T0 + 2); // the Mayor bot's mandate puts raise-roads forward
    tick(room, T0 + 3 + PROPOSE_BEAT_MS);
    expect(room.plan!.cur!.leading!.option).toBe('raise-roads');
    planOffer(room, me, 'access-guarantee', T0 + 4);
    done(room, me, T0 + 5);
    const r = room.plan!.cur!;
    expect(r.accepted).toEqual({ amendment: 'access-guarantee', bySeat: me.seat });
    expect(r.offers.find((o) => o.seat !== me.seat && o.state === 'accepted')).toBeUndefined();
  });
});
