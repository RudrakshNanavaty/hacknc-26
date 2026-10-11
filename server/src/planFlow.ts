// The Planning Edition's round machine (rules planning-1.0.0). rooms.ts owns the room, the lobby and the
// players; this module owns what happens between Start and the finale. Like rooms.ts it has no sockets and
// no I/O: synchronous actions record input, `planTick` moves time, and every outcome comes from the shared
// rules (shared/src/game/plan). A model never decides a vote, a verdict or a point.
//
//   select -> propose -> deal -> vote -> result   (x3)   -> final
//
// select: the real story and the three projects on one screen; everyone privately picks one. propose: the Mayor puts one forward. deal: support or
// oppose, and one amendment the sponsor may accept. vote: 3 of 4 approve. result: verdict and 3+2+1 points.
import {
  PERSONAS, PERSONAL_REASONS, PLAN_ROUNDS, PLAN_RULES_VERSION, PLAN_SPRINT_MS, PERSONA_INFO, ROUND_BUDGET, STATUS_QUO, VOTES_TO_APPROVE,
  botAccepts, botMayorChoice, districtById, botOffer, botPick, botStance, botVote, checkOffer, configCost, describeConfig, optionOf, planOutcome, resolvePlanRound, scenarioForRound, stormResult, unmetConstraint,
  type AmendmentOffer, type Bubble, type PersonalPick, type PersonalReason, type PersonaId, type PlanConfig, type PlanFinal, type PlanMine, type PlanPublic, type PlanRound,
  type PlanScenario, type RoomPhase, type Stance,
} from '@shared';
import { RoomError, present, type Player, type Room } from './rooms';

/** One round in progress. Picks are private until the table reveals them. */
export interface PlanDraft {
  round: number;
  scenario: PlanScenario;
  picks: Record<number, string>;
  revealed: boolean;
  leading: PlanRound['leading'];
  stances: Record<number, Stance>;
  stancesBefore: Record<number, Stance> | null;
  offers: AmendmentOffer[];
  accepted: PlanRound['accepted'];
  votes: Record<number, boolean>;
  /** Each seat's voluntary personal answer for this round (humans only). */
  personal: Map<number, PersonalPick>;
}

export interface PlanMatch {
  rounds: PlanRound[];
  cur: PlanDraft | null;
  personal: PersonalPick[];
  final: PlanFinal | null;
}

export const PLAN_PHASES: RoomPhase[] = ['select', 'propose', 'deal', 'vote', 'result'];
export const isPlanPhase = (p: RoomPhase) => PLAN_PHASES.includes(p);

const touch = (room: Room, now: number) => void (room.touchedAt = now);
const humansHere = (room: Room, now: number) => present(room, now).filter((p) => !p.bot);
const mayor = (room: Room) => room.players.find((p) => p.persona === 'mayor')!;
const seatOf = (room: Room, persona: PersonaId) => room.players.find((p) => p.persona === persona)!.seat;

export function newPlanMatch(): PlanMatch {
  return { rounds: [], cur: null, personal: [], final: null };
}

function draft(room: Room): PlanDraft {
  const d = room.plan?.cur;
  if (!d) throw new RoomError('There is no round in progress.');
  return d;
}

/** How long a bot Mayor's reveal is shown before the deal opens in turn-based play. */
export const PROPOSE_BEAT_MS = 4_000;

const deadline = (room: Room, phase: keyof typeof PLAN_SPRINT_MS, now: number): number | null => (room.pace === 'sprint' ? now + PLAN_SPRINT_MS[phase] : null);

// ---------- Starting ----------

/** Called by rooms.start() after it has made the record: fill every empty seat with a bot (so the Mayor and four votes always exist) and begin. */
export function startPlan(room: Room, now: number, newBot: (persona: PersonaId) => Player): void {
  for (const persona of PERSONAS) if (!room.players.some((p) => p.persona === persona)) room.players.push(newBot(persona));
  room.players.forEach((p, i) => (p.seat = i));
  const record = room.record!;
  record.rulesVersion = PLAN_RULES_VERSION;
  record.players = room.players.map((p) => ({ seat: p.seat, name: p.name, persona: p.persona, participant: p.bot ? 'bot' : 'human' }));
  record.plan = { version: PLAN_RULES_VERSION, scenarios: Array.from({ length: PLAN_ROUNDS }, (_, i) => scenarioForRound(i + 1).id), rounds: [], personal: [], final: null };
  room.plan = newPlanMatch();
  room.plan.personal = record.plan.personal; // one list: what the match keeps is what the record saves
  room.round = 1;
  beginRound(room, now);
}

// ---------- Phases ----------

function bubbles(room: Room, moment: string, line: (persona: PersonaId) => [string, Bubble['reaction']]): void {
  const sc = room.plan?.cur?.scenario ?? scenarioForRound(Math.max(1, room.round));
  room.bubbles = {
    key: moment,
    list: room.players.map((p) => {
      const [text, reaction] = line(p.persona);
      return { id: `${moment}:${p.persona}`, speaker: p.persona, text, reaction, district: sc.district, source: 'template' as const };
    }),
  };
}

/** A round opens on one screen: the real story, your goal and the three projects. Everyone is already "ready" to read it; the step ends when everyone has played a card. */
function beginRound(room: Room, now: number): void {
  const scenario = scenarioForRound(room.round);
  const d: PlanDraft = { round: room.round, scenario, picks: {}, revealed: false, leading: null, stances: {}, stancesBefore: null, offers: [], accepted: null, votes: {}, personal: new Map() };
  room.plan!.cur = d;
  room.phase = 'select';
  room.endsAt = deadline(room, 'select', now);
  for (const p of room.players) {
    p.done = p.bot;
    if (p.bot) d.picks[p.seat] = botPick(scenario, p.persona);
  }
  room.headline = { text: scenario.title, source: 'template', key: `select-${room.round}` };
  bubbles(room, `select-${room.round}`, (persona) => [scenario.mandates[persona].objective, 'worry']);
  room.effects.push({ t: 'crisis', key: `select-${room.round}`, round: room.round }, { t: 'record' });
  touch(room, now);
  maybeLock(room, now);
}

function maybeLock(room: Room, now: number): void {
  if (room.phase !== 'select') return;
  const d = draft(room);
  const here = present(room, now);
  if (here.length && here.every((p) => d.picks[p.seat])) enterPropose(room, now);
}

function enterPropose(room: Room, now: number): void {
  const d = draft(room);
  d.revealed = true;
  room.phase = 'propose';
  // A bot Mayor has nothing to wait for: the table sees the cards for a few seconds, then moves on, even without a clock.
  room.endsAt = mayor(room).bot && room.pace !== 'sprint' ? now + PROPOSE_BEAT_MS : deadline(room, 'propose', now);
  for (const p of room.players) p.done = p.bot;
  const m = mayor(room);
  if (!Object.keys(d.picks).length) {
    // Nobody chose a project: there is nothing to put forward.
    d.leading = null;
    return enterResult(room, now);
  }
  room.headline = { text: m.bot ? 'The cards are in. The Mayor puts one forward.' : 'The cards are in. The Mayor chooses which one goes forward.', source: 'template', key: `propose-${room.round}` };
  bubbles(room, `propose-${room.round}`, (persona) => {
    const o = optionOf(d.scenario, d.picks[seatOf(room, persona)]);
    return [o ? `I am backing: ${o.name}.` : 'I have not chosen yet.', 'negotiate'];
  });
  // A bot Mayor chooses at once; a person chooses by tapping (or the sprint chooses for them).
  if (m.bot) lead(room, m, botMayorChoice(d.scenario, d.picks)!, now, false);
  touch(room, now);
}

function lead(room: Room, by: Player, option: string, now: number, auto: boolean): void {
  const d = draft(room);
  const sponsor = Object.entries(d.picks).filter(([, o]) => o === option).map(([s]) => Number(s)).sort((a, b) => (a === by.seat ? -1 : b === by.seat ? 1 : a - b))[0];
  if (sponsor === undefined) throw new RoomError('Put forward one of the cards the table played.');
  d.leading = { option, sponsorSeat: sponsor, chosenBySeat: by.seat };
  if (auto && room.record?.plan) touch(room, now);
  // A person leading moves the table on at once; a bot Mayor waits for the table to look at the cards.
  if (!by.bot) enterDeal(room, now);
}

function enterDeal(room: Room, now: number): void {
  const d = draft(room);
  if (!d.leading) return enterResult(room, now);
  room.phase = 'deal';
  room.endsAt = deadline(room, 'deal', now);
  for (const p of room.players) p.done = p.bot;
  const o = optionOf(d.scenario, d.leading.option)!;
  room.headline = { text: `${o.name} is on the table. Support it, oppose it, or make a deal.`, source: 'template', key: `deal-${room.round}` };
  // Bots take a side by their own mandate and ask for the amendment their mandate names.
  for (const p of room.players) if (p.bot) d.stances[p.seat] = botStance(d.scenario, p.persona, { option: d.leading.option, amendment: null });
  for (const p of room.players) {
    if (!p.bot || p.seat === d.leading.sponsorSeat) continue;
    const a = botOffer(d.scenario, p.persona, d.leading.option, ROUND_BUDGET);
    if (a && !checkOffer(d.scenario, d.leading.option, a, p.seat, d.leading.sponsorSeat, d.offers)) d.offers.push({ seat: p.seat, amendment: a, state: 'open' });
  }
  bubbles(room, `deal-${room.round}`, (persona) => {
    const s = d.stances[seatOf(room, persona)];
    const o2 = d.offers.find((x) => x.seat === seatOf(room, persona));
    const text = o2 ? `I can support this if we add ${d.scenario.amendments.find((a) => a.id === o2.amendment)!.name}.` : s === 'support' ? 'This works for me.' : s === 'oppose' ? 'This does not meet my goal.' : 'Let me hear the deal first.';
    return [text, o2 ? 'conditional-support' : s === 'oppose' ? 'protest' : 'negotiate'];
  });
  touch(room, now);
}

/**
 * A bot sponsor settles when the table is ready to vote, not the moment an offer is made, so a person always
 * has time to ask. It takes the best offer it can live with: one that clears a blocker first, then one a person
 * asked for, then the lowest seat; every other offer is declined.
 */
function settleForBotSponsor(room: Room): void {
  const d = draft(room);
  if (!d.leading) return;
  const sponsor = room.players[d.leading.sponsorSeat]!;
  if (!sponsor.bot || d.accepted) return;
  const base: PlanConfig = { option: d.leading.option, amendment: null };
  const clears = (o: AmendmentOffer) => !!unmetConstraint(d.scenario, base) && !unmetConstraint(d.scenario, { option: base.option, amendment: o.amendment });
  const rank = (o: AmendmentOffer) => (clears(o) ? 0 : 10) + (room.players[o.seat]?.bot ? 1 : 0);
  for (const o of d.offers.filter((x) => x.state === 'open').sort((a, b) => rank(a) - rank(b) || a.seat - b.seat)) {
    if (!d.accepted && botAccepts(d.scenario, sponsor.persona, d.leading.option, o.amendment, ROUND_BUDGET)) acceptOffer(room, o);
    else o.state = 'declined';
  }
}

function acceptOffer(room: Room, o: AmendmentOffer): void {
  const d = draft(room);
  d.stancesBefore = { ...d.stances };
  o.state = 'accepted';
  d.accepted = { amendment: o.amendment, bySeat: o.seat };
  for (const other of d.offers) if (other !== o && other.state === 'open') other.state = 'declined';
  // Bots look at the amended plan and may change sides.
  const config: PlanConfig = { option: d.leading!.option, amendment: o.amendment };
  for (const p of room.players) if (p.bot) d.stances[p.seat] = botStance(d.scenario, p.persona, config);
}

function enterVote(room: Room, now: number): void {
  const d = draft(room);
  room.phase = 'vote';
  room.endsAt = deadline(room, 'vote', now);
  for (const p of room.players) p.done = p.bot;
  const config: PlanConfig = { option: d.leading!.option, amendment: d.accepted?.amendment ?? null };
  room.headline = { text: `Vote: ${describeConfig(d.scenario, config)}. It needs ${VOTES_TO_APPROVE} of 4.`, source: 'template', key: `vote-${room.round}` };
  for (const p of room.players) if (p.bot) d.votes[p.seat] = botVote(d.scenario, p.persona, config);
  touch(room, now);
  maybeResult(room, now);
}

function maybeResult(room: Room, now: number): void {
  if (room.phase !== 'vote') return;
  const d = draft(room);
  const here = present(room, now);
  if (here.length && here.every((p) => d.votes[p.seat] !== undefined)) enterResult(room, now);
}

const VERDICT_TEXT = { approved: 'Approved', rejected: 'Rejected', delayed: 'Delayed', 'no-money': 'No money' } as const;

function enterResult(room: Room, now: number): void {
  const m = room.plan!;
  const d = draft(room);
  const out = resolvePlanRound({
    scenario: d.scenario, players: room.players.map((p) => ({ seat: p.seat, persona: p.persona })), leading: d.leading, offers: d.offers, votes: d.votes, budget: ROUND_BUDGET,
  });
  const round: PlanRound = {
    round: d.round, scenarioId: d.scenario.id, district: d.scenario.district, budget: ROUND_BUDGET, picks: d.picks, leading: d.leading,
    stancesBefore: d.stancesBefore ?? { ...d.stances }, stancesAfter: { ...d.stances }, offers: d.offers, accepted: out.accepted, votes: d.votes,
    verdict: out.verdict, adopted: out.adopted, cost: out.cost, feasible: out.feasible, blockedBy: out.blockedBy, scores: out.scores,
  };
  m.rounds.push(round);
  room.record?.plan?.rounds.push(round);
  room.phase = 'result';
  room.endsAt = deadline(room, 'result', now);
  for (const p of room.players) p.done = p.bot;
  const what = describeConfig(d.scenario, out.adopted);
  room.headline = {
    text: out.verdict === 'approved' ? `${VERDICT_TEXT.approved}: ${what}.` : out.verdict === 'rejected' ? `${VERDICT_TEXT.rejected}. ${d.leading ? 'Fewer than 3 votes: the status quo stands.' : 'No project was put forward.'}` : `${VERDICT_TEXT[out.verdict]}. ${out.blockedBy ?? ''}`.trim(),
    source: 'template', key: `result-${room.round}`,
  };
  bubbles(room, `result-${room.round}`, (persona) => {
    const s = out.scores.find((x) => x.persona === persona)!;
    return s.total >= 5 ? ['Exactly what I came for.', 'celebrate'] : s.total >= 3 ? ['A fair deal. I can live with it.', 'congratulate'] : out.verdict === 'rejected' ? ['We got nothing done.', 'worry'] : ['That does not meet my goal.', 'protest'];
  });
  room.effects.push({ t: 'resolved', key: `result-${room.round}`, round: room.round }, { t: 'record' });
  touch(room, now);
}

function enterFinal(room: Room, now: number): void {
  const m = room.plan!;
  const totals = room.players.map((p) => {
    const mine = m.rounds.flatMap((r) => r.scores.filter((s) => s.seat === p.seat));
    return {
      seat: p.seat, persona: p.persona, mandate: mine.reduce((s, x) => s + x.mandate, 0), deal: mine.reduce((s, x) => s + x.deal, 0),
      feasibility: mine.reduce((s, x) => s + x.feasibility, 0), total: mine.reduce((s, x) => s + x.total, 0),
    };
  });
  const best = Math.max(...totals.map((t) => t.total));
  const plan = m.rounds.map((r) => r.adopted);
  m.final = { plan, totals, winners: totals.filter((t) => t.total === best).map((t) => t.persona) };
  const sim = planOutcome(plan);
  const storm = stormResult(sim);
  room.phase = 'final';
  room.endsAt = null;
  room.headline = { text: 'Your Miami Beach plan', source: 'template', key: 'final' };
  room.bubbles = {
    key: 'final',
    list: room.players.map((p) => {
      const t = totals.find((x) => x.seat === p.seat)!;
      return { id: `final:${p.persona}`, speaker: p.persona, text: t.total === best ? 'I will take the win.' : `${PERSONA_INFO[p.persona].name} signs off, mostly.`, reaction: t.total === best ? 'celebrate' : 'congratulate', district: null, source: 'template' as const };
    }),
  };
  if (room.record?.plan) {
    room.record.plan.final = m.final;
    room.record.plan.personal = m.personal;
    room.record.plan.simulated = { key: sim.key, cost: sim.cost, feasible: sim.feasible, flood: sim.byFuture.map((f) => f.flood), access: sim.access, worstFlood: sim.worstFlood, stormHeld: storm.held };
  }
  if (room.record) room.record.endedAt = new Date(now).toISOString();
  room.effects.push({ t: 'final', key: 'final' }, { t: 'record' });
  touch(room, now);
}

// ---------- Moving on ----------

/** Move to the next phase now (the host's skip, or a sprint deadline). Returns false when there is nothing to leave. */
export function planAdvance(room: Room, now: number): boolean {
  const d = room.plan?.cur;
  switch (room.phase) {
    case 'select':
      return enterPropose(room, now), true;
    case 'propose': {
      if (!d) return false;
      if (!d.leading) lead(room, mayor(room), botMayorChoice(d.scenario, d.picks)!, now, true);
      if (room.phase === 'propose') enterDeal(room, now);
      return true;
    }
    case 'deal':
      settleForBotSponsor(room);
      return enterVote(room, now), true;
    case 'vote':
      return enterResult(room, now), true;
    case 'result':
      if (room.round < PLAN_ROUNDS) {
        room.round += 1;
        beginRound(room, now);
      } else enterFinal(room, now);
      return true;
    default:
      return false;
  }
}

/** Turn-based steps end when everyone present is ready; time only matters in a sprint (handled by rooms.tick). */
export function planTick(room: Room, now: number): void {
  const here = present(room, now);
  if (!here.length || !room.plan?.cur) return;
  switch (room.phase) {
    case 'deal':
    case 'result':
      if (here.every((p) => p.done)) planAdvance(room, now);
      break;
    case 'propose':
      // A bot Mayor has already chosen and the beat (endsAt) moves the table on; a person who is Mayor moves it by choosing.
      break;
    case 'select':
      maybeLock(room, now);
      break;
    case 'vote':
      maybeResult(room, now);
      break;
  }
}

/** "Ready" for the next step. */
export function planDone(room: Room, player: Player, now: number): void {
  if (!['propose', 'deal', 'result'].includes(room.phase)) throw new RoomError('Nothing to finish right now.');
  player.done = true;
  touch(room, now);
  planTick(room, now);
}

// ---------- Player actions ----------

export function planPick(room: Room, player: Player, option: unknown, now: number): void {
  if (room.phase !== 'select') throw new RoomError('Cards are played when the round opens.');
  const d = draft(room);
  if (d.picks[player.seat]) throw new RoomError('Your card is already locked in.');
  if (typeof option !== 'string' || !optionOf(d.scenario, option)) throw new RoomError('Pick one of the three projects.');
  d.picks[player.seat] = option;
  touch(room, now);
  maybeLock(room, now);
}

export function planLead(room: Room, player: Player, option: unknown, now: number): void {
  if (room.phase !== 'propose') throw new RoomError('The Mayor chooses once the cards are revealed.');
  if (player.persona !== 'mayor') throw new RoomError('Only the Mayor puts a project forward.');
  const d = draft(room);
  if (d.leading) throw new RoomError('A project is already on the table.');
  if (typeof option !== 'string' || !Object.values(d.picks).includes(option)) throw new RoomError('Put forward one of the cards the table played.');
  lead(room, player, option, now, false);
  touch(room, now);
}

export function planStance(room: Room, player: Player, stance: unknown, now: number): void {
  if (room.phase !== 'deal') throw new RoomError('Take a side while the table is dealing.');
  if (stance !== 'support' && stance !== 'oppose') throw new RoomError('Support or oppose.');
  draft(room).stances[player.seat] = stance;
  touch(room, now);
}

export function planOffer(room: Room, player: Player, amendment: unknown, now: number): void {
  if (room.phase !== 'deal') throw new RoomError('Deals are made while the table is dealing.');
  const d = draft(room);
  const problem = checkOffer(d.scenario, d.leading!.option, amendment, player.seat, d.leading!.sponsorSeat, d.offers, ROUND_BUDGET);
  if (problem) throw new RoomError(problem);
  d.offers.push({ seat: player.seat, amendment: amendment as string, state: 'open' });
  touch(room, now);
}

export function planDecide(room: Room, player: Player, seat: unknown, accept: unknown, now: number): void {
  if (room.phase !== 'deal') throw new RoomError('Deals are settled while the table is dealing.');
  const d = draft(room);
  if (player.seat !== d.leading!.sponsorSeat) throw new RoomError('Only the sponsor of the project accepts a deal.');
  const o = d.offers.find((x) => x.seat === seat && x.state === 'open');
  if (!o) throw new RoomError('That offer is not open.');
  if (accept) {
    if (d.accepted) throw new RoomError('An amendment was already accepted this round.');
    acceptOffer(room, o);
  } else o.state = 'declined';
  touch(room, now);
}

export function planVote(room: Room, player: Player, yes: unknown, now: number): void {
  if (room.phase !== 'vote') throw new RoomError('Votes are cast when the vote opens.');
  const d = draft(room);
  if (d.votes[player.seat] !== undefined) throw new RoomError('You already voted.');
  if (typeof yes !== 'boolean') throw new RoomError('Vote yes or no.');
  d.votes[player.seat] = yes;
  touch(room, now);
  maybeResult(room, now);
}

/** A voluntary answer outside the role: before the deal or after the result. Never scored; kept apart from role-play. */
export function planPersonal(room: Room, player: Player, msg: { stage: unknown; option: unknown; reason?: unknown; moved?: unknown; comment?: unknown }, now: number): void {
  const d = room.plan?.cur;
  if (!d || !room.record?.plan) throw new RoomError('No round to answer about.');
  if (player.bot) throw new RoomError('Bots do not give personal answers.');
  const sc = d.scenario;
  const before = msg.stage === 'before';
  if (!before && msg.stage !== 'after') throw new RoomError('Before or after.');
  if (before ? !['select', 'propose'].includes(room.phase) : room.phase !== 'result') throw new RoomError(before ? 'Your first pick comes before the deal.' : 'Your second answer comes after the result.');
  const option = msg.option === null || msg.option === 'none' ? 'none' : typeof msg.option === 'string' && optionOf(sc, msg.option) ? msg.option : undefined;
  if (option === undefined) throw new RoomError('Pick one of the projects, or none.');
  const reason: PersonalReason | null = PERSONAL_REASONS.includes(msg.reason as PersonalReason) ? (msg.reason as PersonalReason) : null;
  let rec = d.personal.get(player.seat);
  if (!rec) {
    rec = { seat: player.seat, persona: player.persona, participant: 'human', round: d.round, scenarioId: sc.id, district: sc.district, before: null, after: null, reason: null, movedByAmendment: null, comment: null, at: new Date(now).toISOString() };
    d.personal.set(player.seat, rec);
    room.plan!.personal.push(rec);
  }
  if (before) rec.before = option;
  else {
    rec.after = option;
    rec.reason = reason;
    rec.movedByAmendment = typeof msg.moved === 'boolean' ? msg.moved : null;
    rec.comment = typeof msg.comment === 'string' ? msg.comment.trim().replace(/\s+/g, ' ').slice(0, 200) || null : null;
  }
  rec.at = new Date(now).toISOString();
  room.effects.push({ t: 'record' });
  touch(room, now);
}

// ---------- What the table and each player see ----------

export function planReady(room: Room, p: Player): boolean {
  const d = room.plan?.cur;
  if (!d) return false;
  switch (room.phase) {
    case 'select': return !!d.picks[p.seat];
    case 'vote': return d.votes[p.seat] !== undefined;
    case 'deal': case 'result': return p.done;
    case 'propose': return p.persona === 'mayor' ? !!d.leading : true;
    default: return false;
  }
}

/** The table's voluntary personal picks, grouped by scenario with no names: the last answer each person gave. */
function personalByScenario(m: PlanMatch): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const p of m.personal) {
    const pick = p.after ?? p.before;
    if (pick) (out[p.scenarioId] ??= []).push(pick);
  }
  return out;
}

export function planPublic(room: Room): PlanPublic | null {
  const m = room.plan;
  if (!m) return null;
  const d = m.cur;
  const finished = room.phase === 'result' || room.phase === 'final';
  return {
    round: room.round,
    scenarioId: (d?.scenario ?? scenarioForRound(Math.max(1, room.round))).id,
    budget: ROUND_BUDGET,
    picks: d && (d.revealed || finished) ? d.picks : null,
    leading: d?.leading ?? null,
    stances: d?.stances ?? {},
    offers: d?.offers ?? [],
    accepted: d?.accepted ?? null,
    voted: d ? Object.keys(d.votes).map(Number) : [],
    rounds: m.rounds,
    final: m.final,
    personal: room.phase === 'final' ? personalByScenario(m) : null,
  };
}

export function planMine(room: Room, viewer: Player | null): PlanMine | null {
  const d = room.plan?.cur;
  if (!viewer || !d) return null;
  const rec = d.personal.get(viewer.seat);
  return {
    pick: d.picks[viewer.seat] ?? null,
    stance: d.stances[viewer.seat] ?? null,
    vote: d.votes[viewer.seat] ?? null,
    before: rec?.before ?? null,
    after: rec?.after !== null && rec?.after !== undefined ? { option: rec.after, reason: rec.reason, moved: rec.movedByAmendment } : null,
  };
}

/** Used in tests and the demo: the cost of what is on the table now. */
export function planCostNow(room: Room): number {
  const d = room.plan?.cur;
  return d?.leading ? configCost(d.scenario, { option: d.leading.option, amendment: d.accepted?.amendment ?? null }) : 0;
}

export const PLAN_STATUS_QUO = STATUS_QUO;

// ---------- Facts for the news desk and the characters (Gemini only words them; it never decides) ----------

const VERDICT_WORD = { approved: 'approved', rejected: 'rejected', delayed: 'delayed', 'no-money': 'not funded' } as const;

/**
 * What the narrator and the character voices may talk about at a moment: the real story and what the rules
 * decided. Numbers in anything they write must appear here (the room throws a line away otherwise).
 */
export function planFacts(room: Room, moment: 'select' | 'resolved' | 'final'): Record<string, unknown> {
  const m = room.plan;
  const base: Record<string, unknown> = { city: 'Miami Beach, Florida', game: 'consensusclub planning session', round: room.round, of: PLAN_ROUNDS };
  if (!m) return base;
  const sc = (m.cur?.scenario ?? scenarioForRound(Math.max(1, room.round)));
  const story = {
    title: sc.title, place: districtById(sc.district).name, situation: sc.situation, question: sc.question, facts: sc.facts,
    options: sc.options.map((o) => o.name),
    parts: Object.fromEntries(PERSONAS.map((p) => [p, { counterpart: null, stance: sc.mandates[p].objective }])),
  };
  if (moment === 'select') return { ...base, event: 'a new real planning fight begins', realStory: story };
  if (moment === 'resolved') {
    const r = m.rounds.at(-1);
    if (!r) return { ...base, realStory: story };
    const yes = Object.values(r.votes).filter(Boolean).length;
    return {
      ...base, event: 'the vote on this fight', realStory: story, verdict: VERDICT_WORD[r.verdict], adopted: describeConfig(sc, r.adopted),
      amendment: r.accepted ? sc.amendments.find((a) => a.id === r.accepted!.amendment)?.name ?? null : null, yesVotes: yes, votesNeeded: VOTES_TO_APPROVE,
      costUnits: r.cost, budgetUnits: r.budget, whyNot: r.blockedBy, statusQuo: sc.statusQuo.text,
      points: Object.fromEntries(r.scores.map((x) => [x.persona, x.total])),
    };
  }
  const f = m.final;
  const sim = f ? planOutcome(f.plan) : null;
  const storm = sim ? stormResult(sim) : null;
  return {
    ...base, event: 'the end of the planning session', realStory: story,
    plan: m.rounds.map((r) => ({ place: districtById(r.district).name, decision: describeConfig(scenarioForRound(r.round), r.adopted), verdict: VERDICT_WORD[r.verdict] })),
    totals: f ? Object.fromEntries(f.totals.map((t) => [t.persona, t.total])) : null, winners: f?.winners ?? null,
    modelledStorm: storm ? { exposure: storm.exposure, limit: storm.limit, held: storm.held } : null,
  };
}
