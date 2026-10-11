// Civic Atlas for the Planning Edition: what many matches add up to, in four views.
//   A  Real issues       the verified, source-linked situations and the choices each one offers
//   B  Human decisions   in-role picks, votes, requested and accepted amendments, stance changes, and the
//                        separate voluntary personal answers
//   C  Plan explorer     the plans tables built against the whole space the simulator enumerates
//   D  Planning insights leads computed from A to C, each with its sample size and the matches behind it
// Pure functions of match records. Role-play is never presented as public opinion: personal answers are
// counted on their own, demo sessions and bots are labelled, and a finding under MIN_N cases is a lead.
import { PERSONAS, type PersonaId } from '../content';
import { districtById } from '../districts';
import type { MatchRecord, SessionKind } from '../record';
import { MIN_N, rate, type Rate } from '../atlas';
import { PLAN_SCENARIOS } from './scenarios';
import { describeConfig, optionOf } from './rules';
import { alternatives, bestForArea, enumeratePlans, planOutcome, type CityPlan, type PlanOutcome } from './sim';
import { PLAN_RULES_VERSION, type PlanRound, type PlanScenario } from './types';

export interface PlanAtlasFilter {
  sessionKind: SessionKind | 'all';
  /** Count only people's own seats (bots are left out of picks, votes and personal answers). */
  humansOnly: boolean;
}

export const isPlanMatch = (m: MatchRecord) => m.rulesVersion === PLAN_RULES_VERSION && !!m.plan;

export interface PlanScope {
  matches: number;
  completed: number;
  humanSeats: number;
  botSeats: number;
  sessions: { community: number; demo: number };
  personalAnswers: number;
  first: string | null;
  last: string | null;
}

export interface IssueRow {
  scenarioId: string;
  district: string;
  districtName: string;
  storyId: string;
  title: string;
  situation: string;
  question: string;
  sources: PlanScenario['sources'];
  verification: PlanScenario['verification'];
  constraints: string[];
  options: { id: string; name: string; cost: number; does: string }[];
  amendments: { id: string; name: string; cost: number; addresses: string; appliesTo: string[] }[];
  rounds: number;
}

export interface DecisionRowView {
  scenarioId: string;
  district: string;
  districtName: string;
  title: string;
  rounds: number;
  /** In-role cards played, by option (role-play, not opinion). */
  picks: { option: string; name: string; rate: Rate }[];
  picksByRole: Record<PersonaId, Record<string, number>>;
  verdicts: { approved: Rate; rejected: Rate; delayed: Rate };
  yesVotes: Record<PersonaId, Rate>;
  amendments: { id: string; name: string; offered: number; accepted: number; approvedWith: number }[];
  /** Seats whose support or opposition changed after an amendment was accepted. */
  stanceChanges: { amendment: string; name: string; seats: number; changed: number; toSupport: number }[];
  personal: {
    answers: number;
    before: Record<string, number>;
    after: Record<string, number>;
    reasons: Record<string, number>;
    movedByAmendment: Rate;
    sameAsRolePick: Rate;
  };
}

export interface MadePlan {
  key: string;
  count: number;
  labels: string[];
  outcome: PlanOutcome;
  /** Share of the simulator's feasible plans this one beats on worst-case flood exposure. */
  beats: number;
}

export interface Explorer {
  finished: number;
  distinctPlans: number;
  totalPlans: number;
  feasiblePlans: number;
  feasibleMade: number;
  top: MadePlan[];
  alternatives: ReturnType<typeof alternatives>;
  /** Per scenario: how often the table adopted the project the model rates best for flood in the extreme future. */
  agreement: { scenarioId: string; districtName: string; modelBest: string; adopted: Rate }[];
}

export interface PlanInsight {
  id: string;
  title: string;
  text: string;
  n: number;
  strength: 'lead' | 'supported';
  matchIds: string[];
}

export interface PlanAtlas {
  rulesVersion: string;
  filter: PlanAtlasFilter;
  scope: PlanScope;
  issues: IssueRow[];
  decisions: DecisionRowView[];
  explorer: Explorer;
  insights: PlanInsight[];
}

const pct = (r: Rate) => (r.p === null ? 'n/a' : `${Math.round(r.p * 100)}%`);
const bump = (m: Record<string, number>, k: string | null | undefined) => void (k && (m[k] = (m[k] ?? 0) + 1));

export function planMatches(all: MatchRecord[], f: PlanAtlasFilter): MatchRecord[] {
  return all.filter((m) => isPlanMatch(m) && (f.sessionKind === 'all' || m.sessionKind === f.sessionKind));
}

interface Seen { m: MatchRecord; r: PlanRound }
const rounds = (ms: MatchRecord[], sc: PlanScenario): Seen[] => ms.flatMap((m) => m.plan!.rounds.filter((r) => r.scenarioId === sc.id).map((r) => ({ m, r })));

function issues(ms: MatchRecord[]): IssueRow[] {
  return PLAN_SCENARIOS.map((sc) => ({
    scenarioId: sc.id, district: sc.district, districtName: districtById(sc.district).name, storyId: sc.storyId, title: sc.title, situation: sc.situation, question: sc.question,
    sources: sc.sources, verification: sc.verification,
    constraints: sc.constraints.map((k) => k.because),
    options: sc.options.map((o) => ({ id: o.id, name: o.name, cost: o.cost, does: o.does })),
    amendments: sc.amendments.map((a) => ({ id: a.id, name: a.name, cost: a.cost, addresses: a.addresses, appliesTo: a.appliesTo })),
    rounds: rounds(ms, sc).length,
  }));
}

function decisions(ms: MatchRecord[], f: PlanAtlasFilter): DecisionRowView[] {
  const humanSeat = (m: MatchRecord, seat: number) => !f.humansOnly || m.players.find((p) => p.seat === seat)?.participant === 'human';
  const personaOf = (m: MatchRecord, seat: number) => m.players.find((p) => p.seat === seat)?.persona ?? null;
  return PLAN_SCENARIOS.map((sc) => {
    const seen = rounds(ms, sc);
    const n = seen.length;
    const picks: Record<string, number> = {};
    const byRole = Object.fromEntries(PERSONAS.map((p) => [p, {} as Record<string, number>])) as Record<PersonaId, Record<string, number>>;
    let cards = 0;
    for (const { m, r } of seen) {
      for (const [seat, option] of Object.entries(r.picks)) {
        if (!humanSeat(m, Number(seat))) continue;
        bump(picks, option);
        const p = personaOf(m, Number(seat));
        if (p) bump(byRole[p], option);
        cards += 1;
      }
    }
    const yes = Object.fromEntries(PERSONAS.map((p) => [p, { k: 0, n: 0 }])) as Record<PersonaId, { k: number; n: number }>;
    for (const { m, r } of seen) for (const [seat, v] of Object.entries(r.votes)) {
      const p = personaOf(m, Number(seat));
      if (p && humanSeat(m, Number(seat))) {
        yes[p].n += 1;
        if (v) yes[p].k += 1;
      }
    }
    const amend = new Map<string, { offered: number; accepted: number; approvedWith: number }>();
    for (const a of sc.amendments) amend.set(a.id, { offered: 0, accepted: 0, approvedWith: 0 });
    const flips = new Map<string, { seats: number; changed: number; toSupport: number }>();
    for (const { m, r } of seen) {
      for (const o of r.offers) if (humanSeat(m, o.seat)) amend.get(o.amendment)!.offered += 1;
      if (r.accepted) {
        const a = amend.get(r.accepted.amendment)!;
        a.accepted += 1;
        if (r.verdict === 'approved') a.approvedWith += 1;
        const f2 = flips.get(r.accepted.amendment) ?? { seats: 0, changed: 0, toSupport: 0 };
        for (const [seat, after] of Object.entries(r.stancesAfter)) {
          const before = r.stancesBefore[Number(seat)];
          if (!before || !humanSeat(m, Number(seat))) continue;
          f2.seats += 1;
          if (before !== after) {
            f2.changed += 1;
            if (after === 'support') f2.toSupport += 1;
          }
        }
        flips.set(r.accepted.amendment, f2);
      }
    }
    const answers = ms.flatMap((m) => (m.plan!.personal ?? []).filter((p) => p.scenarioId === sc.id && (!f.humansOnly || p.participant === 'human')).map((p) => ({ m, p })));
    const before: Record<string, number> = {};
    const after: Record<string, number> = {};
    const reasons: Record<string, number> = {};
    let moved = { k: 0, n: 0 };
    let same = { k: 0, n: 0 };
    for (const { m, p } of answers) {
      bump(before, p.before);
      bump(after, p.after);
      bump(reasons, p.reason);
      const round = m.plan!.rounds.find((r) => r.scenarioId === sc.id);
      if (p.movedByAmendment !== null && round?.accepted) {
        moved.n += 1;
        if (p.movedByAmendment) moved.k += 1;
      }
      const own = round?.picks[p.seat];
      if (own && p.after) {
        same.n += 1;
        if (own === p.after) same.k += 1;
      }
    }
    moved = { ...moved };
    const verdicts = (v: string) => rate(seen.filter((x) => x.r.verdict === v).length, n);
    return {
      scenarioId: sc.id, district: sc.district, districtName: districtById(sc.district).name, title: sc.title, rounds: n,
      picks: sc.options.map((o) => ({ option: o.id, name: o.name, rate: rate(picks[o.id] ?? 0, cards) })),
      picksByRole: byRole,
      verdicts: { approved: verdicts('approved'), rejected: verdicts('rejected'), delayed: verdicts('delayed') },
      yesVotes: Object.fromEntries(PERSONAS.map((p) => [p, rate(yes[p].k, yes[p].n)])) as Record<PersonaId, Rate>,
      amendments: sc.amendments.map((a) => ({ id: a.id, name: a.name, ...amend.get(a.id)! })),
      stanceChanges: sc.amendments.filter((a) => flips.has(a.id)).map((a) => ({ amendment: a.id, name: a.name, ...flips.get(a.id)! })),
      personal: { answers: answers.length, before, after, reasons, movedByAmendment: rate(moved.k, moved.n), sameAsRolePick: rate(same.k, same.n) },
    };
  });
}

function explorer(ms: MatchRecord[]): Explorer {
  const finished = ms.filter((m) => m.plan!.final);
  const made = new Map<string, { plan: CityPlan; count: number }>();
  for (const m of finished) {
    const plan = m.plan!.final!.plan;
    const key = planOutcome(plan).key;
    const e = made.get(key) ?? { plan, count: 0 };
    e.count += 1;
    made.set(key, e);
  }
  const all = enumeratePlans();
  const feasible = all.filter((p) => p.feasible);
  const feasibleKeys = new Set(feasible.map((p) => p.key));
  const better = (o: PlanOutcome) => (feasible.length ? feasible.filter((p) => p.worstFlood > o.worstFlood).length / feasible.length : 0);
  const top = [...made.values()].sort((a, b) => b.count - a.count || planOutcome(a.plan).key.localeCompare(planOutcome(b.plan).key)).slice(0, 6).map<MadePlan>((e) => {
    const outcome = planOutcome(e.plan);
    return { key: outcome.key, count: e.count, labels: PLAN_SCENARIOS.map((sc, i) => describeConfig(sc, e.plan[i]!)), outcome, beats: better(outcome) };
  });
  return {
    finished: finished.length, distinctPlans: made.size, totalPlans: all.length, feasiblePlans: feasible.length,
    feasibleMade: [...made.keys()].filter((k) => feasibleKeys.has(k)).length,
    top, alternatives: alternatives(),
    agreement: PLAN_SCENARIOS.map((sc) => {
      const best = bestForArea(sc);
      const rs = finished.flatMap((m) => m.plan!.rounds.filter((r) => r.scenarioId === sc.id));
      return { scenarioId: sc.id, districtName: districtById(sc.district).name, modelBest: describeConfig(sc, best), adopted: rate(rs.filter((r) => r.adopted.option === best.option).length, rs.length) };
    }),
  };
}

function insights(ms: MatchRecord[], d: DecisionRowView[], e: Explorer): PlanInsight[] {
  const out: PlanInsight[] = [];
  const strength = (n: number): PlanInsight['strength'] => (n >= MIN_N ? 'supported' : 'lead');
  const ids = (sc: PlanScenario) => [...new Set(rounds(ms, sc).map((x) => x.m.id))];
  const played = d.filter((x) => x.rounds > 0);
  // Most contested place: the lowest approval rate.
  const contested = [...played].sort((a, b) => (a.verdicts.approved.p ?? 1) - (b.verdicts.approved.p ?? 1))[0];
  if (contested) {
    const sc = PLAN_SCENARIOS.find((s) => s.id === contested.scenarioId)!;
    out.push({ id: 'contested', title: 'Most contested place', text: `${contested.districtName} (${contested.title}): ${contested.verdicts.approved.k} of ${contested.rounds} rounds ended with an approved plan (${pct(contested.verdicts.approved)}); ${contested.verdicts.delayed.k} were delayed and ${contested.verdicts.rejected.k} rejected.`, n: contested.rounds, strength: strength(contested.rounds), matchIds: ids(sc) });
  }
  // Commonly requested amendments.
  for (const x of played) {
    const top = [...x.amendments].sort((a, b) => b.offered - a.offered)[0];
    if (top && top.offered > 0) out.push({ id: `amend-${x.scenarioId}`, title: `Most requested change in ${x.districtName}`, text: `${top.name} was asked for ${top.offered} time${top.offered > 1 ? 's' : ''} and accepted ${top.accepted}; ${top.approvedWith} of those plans were approved.`, n: top.offered, strength: strength(top.offered), matchIds: ids(PLAN_SCENARIOS.find((s) => s.id === x.scenarioId)!) });
  }
  // Which accepted change moved support.
  const flips = played.flatMap((x) => x.stanceChanges.map((s) => ({ ...s, x }))).filter((s) => s.changed > 0).sort((a, b) => b.changed / b.seats - a.changed / a.seats)[0];
  if (flips) out.push({ id: 'flips', title: 'A condition that changed support', text: `After ${flips.name} was accepted in ${flips.x.districtName}, ${flips.changed} of ${flips.seats} recorded stances changed (${flips.toSupport} toward support).`, n: flips.seats, strength: strength(flips.seats), matchIds: ids(PLAN_SCENARIOS.find((s) => s.id === flips.x.scenarioId)!) });
  // Preferences versus the model.
  for (const x of played) {
    const mine = e.agreement.find((a) => a.scenarioId === x.scenarioId)!;
    const answers = x.personal.answers;
    if (!answers) continue;
    const sc = PLAN_SCENARIOS.find((s) => s.id === x.scenarioId)!;
    const best = bestForArea(sc);
    const after = x.personal.after;
    const agree = best.option ? after[best.option] ?? 0 : 0;
    const total = Object.values(after).reduce((s, v) => s + v, 0);
    if (total) out.push({ id: `diverge-${x.scenarioId}`, title: `People versus the model in ${x.districtName}`, text: `${agree} of ${total} personal answers (outside the role) chose ${optionOf(sc, best.option)?.name}, the project the model rates best for flood in the extreme future; tables adopted it in ${pct(mine.adopted)} of rounds.`, n: total, strength: strength(total), matchIds: ids(sc) });
  }
  // Role-play is not opinion.
  const same = played.reduce((acc, x) => ({ k: acc.k + x.personal.sameAsRolePick.k, n: acc.n + x.personal.sameAsRolePick.n }), { k: 0, n: 0 });
  if (same.n) out.push({ id: 'role-vs-person', title: 'Role is not opinion', text: `${same.k} of ${same.n} people picked, as themselves, the same project they played in their role (${Math.round((same.k / same.n) * 100)}%). Role-play choices are never read as what residents want.`, n: same.n, strength: strength(same.n), matchIds: [...new Set(ms.map((m) => m.id))] });
  // Unexplored plans.
  if (e.finished) out.push({ id: 'unexplored', title: 'Plans nobody has tried', text: `${e.feasiblePlans - e.feasibleMade} of ${e.feasiblePlans} feasible plans the simulator can evaluate have never been built by a table (${e.feasibleMade} have).`, n: e.finished, strength: strength(e.finished), matchIds: ms.filter((m) => m.plan!.final).map((m) => m.id) });
  return out;
}

export function planAtlas(all: MatchRecord[], f: PlanAtlasFilter): PlanAtlas {
  const ms = planMatches(all, f);
  const seats = ms.flatMap((m) => m.players);
  const times = ms.map((m) => m.startedAt).sort();
  const d = decisions(ms, f);
  const e = explorer(ms);
  return {
    rulesVersion: PLAN_RULES_VERSION,
    filter: f,
    scope: {
      matches: ms.length, completed: ms.filter((m) => m.plan!.final).length,
      humanSeats: seats.filter((p) => p.participant === 'human').length, botSeats: seats.filter((p) => p.participant === 'bot').length,
      sessions: { community: ms.filter((m) => m.sessionKind === 'community').length, demo: ms.filter((m) => m.sessionKind === 'demo').length },
      personalAnswers: ms.reduce((s, m) => s + (m.plan!.personal?.length ?? 0), 0),
      first: times[0] ?? null, last: times.at(-1) ?? null,
    },
    issues: issues(ms), decisions: d, explorer: e, insights: insights(ms, d, e),
  };
}

// ---------- Export ----------

const cell = (v: unknown) => {
  const t = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};

export const PLAN_CSV_COLUMNS = [
  'match_id', 'session_kind', 'round', 'scenario', 'district', 'lon', 'lat', 'seat', 'persona', 'participant', 'role_pick', 'leading', 'sponsor', 'amendment_offered', 'amendment_accepted',
  'stance_before', 'stance_after', 'vote_yes', 'verdict', 'adopted', 'cost', 'mandate', 'deal', 'feasibility', 'total', 'personal_before', 'personal_after', 'personal_reason', 'moved_by_amendment',
] as const;

/** One row per seat per round. Personal answers sit in their own columns and are never merged with the role pick. */
export function planCsv(all: MatchRecord[]): string {
  const rows: string[] = [PLAN_CSV_COLUMNS.join(',')];
  for (const m of all.filter(isPlanMatch)) {
    for (const r of m.plan!.rounds) {
      const sc = PLAN_SCENARIOS.find((s) => s.id === r.scenarioId)!;
      const d = districtById(r.district);
      for (const p of m.players) {
        const s = r.scores.find((x) => x.seat === p.seat);
        const per = m.plan!.personal.find((x) => x.seat === p.seat && x.round === r.round);
        const offer = r.offers.find((o) => o.seat === p.seat);
        rows.push([
          m.id, m.sessionKind, r.round, r.scenarioId, r.district, d.center[0], d.center[1], p.seat, p.persona, p.participant, r.picks[p.seat] ?? '', r.leading?.option ?? '',
          r.leading?.sponsorSeat === p.seat ? 1 : 0, offer?.amendment ?? '', r.accepted?.bySeat === p.seat ? r.accepted.amendment : '', r.stancesBefore[p.seat] ?? '', r.stancesAfter[p.seat] ?? '',
          r.votes[p.seat] === undefined ? '' : r.votes[p.seat] ? 1 : 0, r.verdict, describeConfig(sc, r.adopted), r.cost, s?.mandate ?? '', s?.deal ?? '', s?.feasibility ?? '', s?.total ?? '',
          per?.before ?? '', per?.after ?? '', per?.reason ?? '', per?.movedByAmendment ?? '',
        ].map(cell).join(','));
      }
    }
  }
  return rows.join('\n') + '\n';
}
