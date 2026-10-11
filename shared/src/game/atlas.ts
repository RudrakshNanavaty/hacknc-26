// Civic Atlas: what many matches add up to. A match is one table's role-play; hundreds of them, played
// under different crises, are a map of where proposals pass, where they stall, what concessions unlock
// them and who stands where: fine-grained, decision-level evidence a survey cannot collect.
//
// Everything here is a pure function of match records. Every figure is a count with its sample size;
// rates carry a Wilson 95% interval, comparisons carry a two-proportion test, and a finding is only as
// strong as the number of cases behind it. Role-play choices are never public opinion: personal
// preferences (the end-of-match question) are kept apart, and so are demo sessions, community
// sessions and bots.
import { CARDS, INDICATORS, PERSONA_INFO, PERSONAS, PROJECTS, START_INDICATORS, type Indicator, type PersonaId, type ProjectKind } from './content';
import { DISTRICTS, districtById } from './districts';
import { CRISIS_KIND_INFO, CRISIS_KINDS, type CrisisKind } from './scenario';
import type { CompromiseKind, Outcome } from './engine';
import { OBJECTION_RULES, supportsChoice, type MatchRecord, type SessionKind } from './record';

// ---------- Statistics ----------

export interface Rate {
  /** Successes. */
  k: number;
  /** Cases. */
  n: number;
  /** k / n (null when n is 0). */
  p: number | null;
  /** Wilson 95% interval. */
  lo: number | null;
  hi: number | null;
}

/** Below this many cases a figure is shown but never turned into a finding. */
export const MIN_N = 8;

export function rate(k: number, n: number): Rate {
  if (n <= 0) return { k, n, p: null, lo: null, hi: null };
  const p = k / n;
  const z = 1.96;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const centre = (p + z2 / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return { k, n, p, lo: Math.max(0, centre - half), hi: Math.min(1, centre + half) };
}

/** Difference of two rates and whether a two-proportion z-test calls it real at 95%. */
export function compare(a: Rate, b: Rate): { diff: number; z: number; significant: boolean } | null {
  if (!a.n || !b.n || a.p === null || b.p === null) return null;
  const pooled = (a.k + b.k) / (a.n + b.n);
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / a.n + 1 / b.n));
  const diff = a.p - b.p;
  if (se === 0) return { diff, z: 0, significant: false };
  const z = diff / se;
  return { diff, z, significant: Math.abs(z) >= 1.96 && a.n >= MIN_N && b.n >= MIN_N };
}

const pct = (r: Rate) => (r.p === null ? 'n/a' : `${Math.round(r.p * 100)}%`);
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
function quantile(sorted: number[], q: number) {
  if (!sorted.length) return null;
  const i = (sorted.length - 1) * q;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (i - lo);
}

// ---------- Filters ----------

export interface AtlasFilter {
  sessionKind?: SessionKind | 'all';
  /** Leave bots out (default true). */
  humansOnly?: boolean;
  /** Only proposals made under this kind of crisis. */
  scenario?: CrisisKind | 'all';
  /** Only proposals in this area. */
  district?: string | 'all';
}

// ---------- The decision-level dataset ----------

/** One proposal, followed from the round it was made to its final outcome: the unit most findings count. */
export interface Case {
  matchId: string;
  sessionKind: SessionKind;
  round: number;
  seat: number;
  persona: PersonaId;
  kind: ProjectKind;
  district: string;
  crisis: CrisisKind | null;
  story: string | null;
  status: Outcome['status'];
  /** Held over from an earlier round at some point. */
  delayed: boolean;
  support: number;
  opposition: number;
  conditions: string[];
  /** Rule ids that decided it (R1, O2, K1...). */
  rules: string[];
  offered: CompromiseKind[];
  accepted: CompromiseKind[];
  supportCards: number;
  oppositionCards: number;
  back: number;
  oppose: number;
  fund: number;
  funding: Outcome['funding'];
  /** Anything pushed back on it: opposition, a block, or a condition on the table. */
  contested: boolean;
}

const crisisOf = (m: MatchRecord, round: number) => {
  const c = m.rounds.find((r) => r.round === round)?.crisis as unknown;
  return c && typeof c === 'object' ? (c as { kind?: CrisisKind; story?: { id: string } }) : null;
};

/** Every proposal in these matches, once, with how it ended. Bots' proposals are left out unless asked for. */
export function casesOf(matches: MatchRecord[], humansOnly = true): Case[] {
  const out: Case[] = [];
  for (const m of matches) {
    const counted = new Set(m.players.filter((p) => !humansOnly || p.participant === 'human').map((p) => p.seat));
    const byProposal = new Map<string, Case>();
    for (const r of m.rounds) {
      for (const o of r.outcomes) {
        if (!counted.has(o.seat)) continue;
        const proposal = m.rounds.flatMap((x) => x.proposals).find((p) => p.id === o.proposalId);
        const origin = proposal?.round ?? r.round;
        const crisis = crisisOf(m, origin);
        const ruleIds = o.rules.map((id) => r.events.find((e) => e.id === id)?.rule).filter((x): x is string => !!x);
        const prev = byProposal.get(o.proposalId);
        const here: Case = prev ?? {
          matchId: m.id, sessionKind: m.sessionKind, round: origin, seat: o.seat, persona: o.persona, kind: o.kind, district: o.district,
          crisis: crisis?.kind ?? null, story: crisis?.story?.id ?? null, status: o.status, delayed: false, support: 0, opposition: 0, conditions: [],
          rules: [], offered: [], accepted: [], supportCards: 0, oppositionCards: 0, back: 0, oppose: 0, fund: 0, funding: null, contested: false,
        };
        if (prev && prev.status === 'delayed') here.delayed = true;
        if (o.status === 'delayed') here.delayed = true;
        here.status = o.status;
        here.support = o.support;
        here.opposition = o.opposition;
        here.conditions = o.conditions;
        here.funding = o.funding;
        here.rules = [...new Set([...here.rules, ...ruleIds])];
        for (const c of r.compromises.filter((x) => x.proposalId === o.proposalId)) {
          if (!here.offered.includes(c.kind)) here.offered.push(c.kind);
          if (c.accepted && !here.accepted.includes(c.kind)) here.accepted.push(c.kind);
        }
        for (const a of r.attachments.filter((x) => x.proposalId === o.proposalId)) {
          const cat = CARDS[a.card].category;
          if (cat === 'support') here.supportCards += 1;
          if (cat === 'opposition') here.oppositionCards += 1;
        }
        for (const n of r.actions.filter((x) => x.proposalId === o.proposalId)) if (n.move !== 'suggest') here[n.move] += 1;
        byProposal.set(o.proposalId, here);
      }
    }
    for (const c of byProposal.values()) {
      c.contested = c.opposition > 0 || c.status === 'blocked' || c.offered.length > 0;
      out.push(c);
    }
  }
  return out;
}

// ---------- Result types ----------

export interface KindInsight {
  kind: ProjectKind;
  name: string;
  n: number;
  approved: Rate;
  blocked: Rate;
  rejected: Rate;
  delayed: Rate;
  unfunded: Rate;
  meanSupport: number | null;
  meanOpposition: number | null;
  /** Of the approved ones, how many carried a condition (the price of consent). */
  conditioned: Rate;
  topRule: { rule: string; label: string; count: number } | null;
}

export interface PlaceInsight {
  id: string;
  name: string;
  center: [number, number];
  n: number;
  approved: Rate;
  contested: Rate;
  blocked: Rate;
  mix: { kind: ProjectKind; n: number }[];
  topRules: { rule: string; label: string; count: number }[];
  preferred: number;
  topProposer: PersonaId | null;
}

export interface CellInsight {
  district: string;
  kind: ProjectKind;
  n: number;
  approved: Rate;
}

export interface ScenarioInsight {
  kind: CrisisKind;
  label: string;
  matches: number;
  cases: number;
  approved: Rate;
  /** Approval rate here minus the rate in every other scenario. */
  lift: number | null;
  significant: boolean;
  /** Share of this scenario's proposals by project kind. */
  mix: { kind: ProjectKind; n: number; share: number }[];
  /** Mean change over a round in each indicator when this crisis is on the table. */
  meanChange: Record<Indicator, number | null>;
}

export interface ConcessionInsight {
  kind: CompromiseKind;
  title: string;
  offered: number;
  accepted: Rate;
  /** Approval when the concession was accepted / refused / never on the table (for the same projects). */
  passAccepted: Rate;
  passRefused: Rate;
  passNone: Rate;
  lift: number | null;
  significant: boolean;
}

export interface StakeholderInsight {
  persona: PersonaId;
  name: string;
  proposals: number;
  approved: Rate;
  supportCards: number;
  oppositionCards: number;
  back: number;
  oppose: number;
  fund: number;
  /** Deals offered to them as owner that they accepted. */
  deals: Rate;
  wins: Rate;
  meanScore: number | null;
}

export interface AllianceCell {
  actor: PersonaId;
  owner: PersonaId;
  /** Times the actor acted on a proposal the owner made. */
  n: number;
  helped: number;
  hindered: number;
  /** Hindered / acted: how adversarial this pair is. */
  hinder: Rate;
}

export interface RuleInsight {
  rule: string;
  label: string;
  /** A regulation (zoning, FEMA) stopped it, or people did (opposition, petitions, a refused deal). */
  type: 'regulatory' | 'social';
  count: number;
  /** Of the proposals that did not pass, how many this rule touched. */
  share: Rate;
  places: { id: string; name: string; count: number }[];
  kinds: { kind: ProjectKind; count: number }[];
}

export interface DriverInsight {
  kind: ProjectKind;
  name: string;
  /** Mean number approved per finished match, in cities that ended viable vs not. */
  viable: number;
  notViable: number;
  diff: number;
}

export interface OutcomeInsight {
  completed: number;
  viable: Rate;
  indicators: Record<Indicator, { start: number; mean: number | null; p10: number | null; p50: number | null; p90: number | null }>;
  drivers: DriverInsight[];
}

export interface PreferenceInsight {
  label: string;
  kind: ProjectKind | null;
  district: string | null;
  /** Players who personally pick it (outside their role). */
  personal: number;
  /** Times it was proposed in role. */
  inRole: number;
}

export interface TrendPoint {
  day: string;
  matches: number;
  cases: number;
  approved: Rate;
}

export interface Insight {
  id: string;
  /** Which tab backs it up. */
  tab: 'places' | 'projects' | 'scenarios' | 'stakeholders' | 'outcomes' | 'preferences';
  text: string;
  /** Cases behind it. */
  n: number;
  /** strong: a significant difference on at least 30 cases per side; moderate: significant; indicative: a pattern on few cases. */
  strength: 'strong' | 'moderate' | 'indicative';
  /** Sample of the match ids it comes from. */
  refs: string[];
}

export interface AtlasInsights {
  scope: {
    matches: number;
    completed: number;
    rounds: number;
    cases: number;
    /** Plays, negotiation moves, outcomes and preferences logged. */
    decisions: number;
    humanParticipants: number;
    botSeats: number;
    sessions: Record<SessionKind, number>;
    stories: number;
    first: string | null;
    last: string | null;
    /** Enough to read patterns (the strongest finding rests on at least MIN_N cases). */
    sufficient: boolean;
  };
  kinds: KindInsight[];
  places: PlaceInsight[];
  cells: CellInsight[];
  scenarios: ScenarioInsight[];
  concessions: ConcessionInsight[];
  stakeholders: StakeholderInsight[];
  alliances: AllianceCell[];
  rules: RuleInsight[];
  outcomes: OutcomeInsight;
  preferences: PreferenceInsight[];
  /** Personas whose players personally prefer what they did not propose, how often. */
  roleGap: { persona: PersonaId; name: string; responses: number; sameAsProposed: Rate }[];
  trend: TrendPoint[];
  insights: Insight[];
}

// ---------- The computation ----------

const kindName = (k: ProjectKind) => PROJECTS[k].name;
const COMPROMISE_TITLE: Record<CompromiseKind, string> = {
  access: 'Public access guarantee',
  setback: 'Dune setback and elevated design',
  change: 'Suggested change (Beginner Mode)',
  green: 'Eco-certification',
};

const refsOf = (cs: Case[]) => [...new Set(cs.map((c) => c.matchId))].slice(0, 20);

export function atlasInsights(all: MatchRecord[], f: AtlasFilter = {}): AtlasInsights {
  const humansOnly = f.humansOnly ?? true;
  const matches = all.filter((m) => !f.sessionKind || f.sessionKind === 'all' || m.sessionKind === f.sessionKind);
  const base = casesOf(matches, humansOnly);
  const wantScenario = f.scenario && f.scenario !== 'all' ? f.scenario : null;
  const wantDistrict = f.district && f.district !== 'all' ? f.district : null;
  const scoped = base.filter((c) => (!wantScenario || c.crisis === wantScenario) && (!wantDistrict || c.district === wantDistrict));
  const forPlaces = base.filter((c) => !wantScenario || c.crisis === wantScenario);
  const forScenarios = base.filter((c) => !wantDistrict || c.district === wantDistrict);
  const approvedRate = (cs: Case[]) => rate(cs.filter((c) => c.status === 'approved').length, cs.length);
  const ruleLabel = (rule: string) => OBJECTION_RULES[rule] ?? `Rule ${rule}`;
  const stopped = (cs: Case[]) => cs.filter((c) => c.status !== 'approved');

  const topRules = (cs: Case[], limit = 3) => {
    const counts = new Map<string, number>();
    for (const c of stopped(cs)) for (const r of c.rules) if (OBJECTION_RULES[r]) counts.set(r, (counts.get(r) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([rule, count]) => ({ rule, label: ruleLabel(rule), count }));
  };

  // Project kinds
  const kinds: KindInsight[] = (Object.keys(PROJECTS) as ProjectKind[]).map((kind) => {
    const cs = scoped.filter((c) => c.kind === kind);
    const st = (s: Outcome['status']) => rate(cs.filter((c) => c.status === s).length, cs.length);
    const approved = cs.filter((c) => c.status === 'approved');
    return {
      kind, name: kindName(kind), n: cs.length, approved: st('approved'), blocked: st('blocked'), rejected: st('rejected'), delayed: rate(cs.filter((c) => c.delayed).length, cs.length),
      unfunded: st('unfunded'), meanSupport: mean(cs.map((c) => c.support)), meanOpposition: mean(cs.map((c) => c.opposition)),
      conditioned: rate(approved.filter((c) => c.conditions.length > 0).length, approved.length), topRule: topRules(cs, 1)[0] ?? null,
    };
  }).filter((k) => k.n > 0).sort((a, b) => b.n - a.n);

  // Places
  const prefCounts = new Map<string, number>();
  for (const m of matches) {
    for (const r of m.responses) {
      if (humansOnly && r.participant !== 'human') continue;
      if (!supportsChoice(r)) continue;
      if (r.district) prefCounts.set(r.district, (prefCounts.get(r.district) ?? 0) + 1);
    }
  }
  const places: PlaceInsight[] = DISTRICTS.map((d) => {
    const cs = forPlaces.filter((c) => c.district === d.id);
    const mixCounts = new Map<ProjectKind, number>();
    const byPersona = new Map<PersonaId, number>();
    for (const c of cs) {
      mixCounts.set(c.kind, (mixCounts.get(c.kind) ?? 0) + 1);
      byPersona.set(c.persona, (byPersona.get(c.persona) ?? 0) + 1);
    }
    return {
      id: d.id, name: d.name, center: d.center, n: cs.length, approved: approvedRate(cs),
      contested: rate(cs.filter((c) => c.contested).length, cs.length), blocked: rate(cs.filter((c) => c.status === 'blocked').length, cs.length),
      mix: [...mixCounts.entries()].map(([kind, n]) => ({ kind, n })).sort((a, b) => b.n - a.n), topRules: topRules(cs),
      preferred: prefCounts.get(d.id) ?? 0, topProposer: [...byPersona.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
    };
  });

  // Place x project grid
  const cells: CellInsight[] = [];
  for (const d of DISTRICTS) {
    for (const kind of Object.keys(PROJECTS) as ProjectKind[]) {
      const cs = forPlaces.filter((c) => c.district === d.id && c.kind === kind);
      if (cs.length) cells.push({ district: d.id, kind, n: cs.length, approved: approvedRate(cs) });
    }
  }

  // Scenarios: how the same table behaves when the crisis changes
  const scenarios: ScenarioInsight[] = CRISIS_KINDS.map((kind) => {
    const cs = forScenarios.filter((c) => c.crisis === kind);
    const rest = forScenarios.filter((c) => c.crisis !== null && c.crisis !== kind);
    const a = approvedRate(cs);
    const cmp = compare(a, approvedRate(rest));
    const mixCounts = new Map<ProjectKind, number>();
    for (const c of cs) mixCounts.set(c.kind, (mixCounts.get(c.kind) ?? 0) + 1);
    const rounds = matches.flatMap((m) => m.rounds.filter((r) => (r.crisis as { kind?: CrisisKind } | undefined)?.kind === kind));
    return {
      kind, label: CRISIS_KIND_INFO[kind].label, matches: new Set(cs.map((c) => c.matchId)).size, cases: cs.length, approved: a,
      lift: cmp?.diff ?? null, significant: cmp?.significant ?? false,
      mix: [...mixCounts.entries()].map(([k, n]) => ({ kind: k, n, share: n / Math.max(1, cs.length) })).sort((x, y) => y.n - x.n),
      meanChange: Object.fromEntries(INDICATORS.map((i) => [i, mean(rounds.map((r) => r.after[i] - r.before[i]))])) as Record<Indicator, number | null>,
    };
  }).filter((s) => s.cases > 0);

  // Concessions: what giving something up does to the chance of passing
  const concessions: ConcessionInsight[] = (['access', 'setback', 'green'] as CompromiseKind[]).map((kind) => {
    const offered = scoped.filter((c) => c.offered.includes(kind));
    const kindsInvolved = new Set(offered.map((c) => c.kind));
    const comparable = scoped.filter((c) => kindsInvolved.has(c.kind));
    const accepted = offered.filter((c) => c.accepted.includes(kind));
    const refused = offered.filter((c) => !c.accepted.includes(kind));
    const none = comparable.filter((c) => !c.offered.includes(kind));
    const pa = approvedRate(accepted);
    const pn = approvedRate(none);
    const cmp = compare(pa, pn);
    return {
      kind, title: COMPROMISE_TITLE[kind], offered: offered.length, accepted: rate(accepted.length, offered.length),
      passAccepted: pa, passRefused: approvedRate(refused), passNone: pn, lift: cmp?.diff ?? null, significant: cmp?.significant ?? false,
    };
  }).filter((c) => c.offered > 0);

  // Stakeholders
  const finished = matches.filter((m) => m.final);
  const stakeholders: StakeholderInsight[] = PERSONAS.map((persona) => {
    const mine = scoped.filter((c) => c.persona === persona);
    const owned = scoped.filter((c) => c.persona === persona && c.offered.length);
    const dealsOffered = owned.flatMap((c) => c.offered.map((k) => c.accepted.includes(k)));
    const seatsPlayed = finished.flatMap((m) => m.players.filter((p) => p.persona === persona && (!humansOnly || p.participant === 'human')).map((p) => ({ m, p })));
    const scores = seatsPlayed.map(({ m }) => m.final!.scores.find((s) => s.persona === persona)?.total).filter((x): x is number => typeof x === 'number');
    const wins = seatsPlayed.filter(({ m }) => m.final!.winners.includes(persona)).length;
    // What this persona did to other people's proposals (any proposal in scope).
    let supportCards = 0, oppositionCards = 0, back = 0, oppose = 0, fund = 0;
    for (const m of matches) {
      const seats = new Set(m.players.filter((p) => p.persona === persona && (!humansOnly || p.participant === 'human')).map((p) => p.seat));
      for (const r of m.rounds) {
        for (const a of r.attachments) if (seats.has(a.seat)) { const cat = CARDS[a.card].category; if (cat === 'support') supportCards += 1; if (cat === 'opposition') oppositionCards += 1; }
        for (const n of r.actions) if (seats.has(n.seat)) { if (n.move === 'back') back += 1; else if (n.move === 'oppose') oppose += 1; else fund += 1; }
      }
    }
    return {
      persona, name: PERSONA_INFO[persona].name, proposals: mine.length, approved: approvedRate(mine), supportCards, oppositionCards, back, oppose, fund,
      deals: rate(dealsOffered.filter(Boolean).length, dealsOffered.length), wins: rate(wins, seatsPlayed.length), meanScore: mean(scores),
    };
  });

  // Who helps and who hinders whom
  const pair = new Map<string, { n: number; helped: number; hindered: number }>();
  const bump = (actor: PersonaId, owner: PersonaId, help: boolean) => {
    if (actor === owner) return;
    const key = `${actor}>${owner}`;
    const e = pair.get(key) ?? { n: 0, helped: 0, hindered: 0 };
    e.n += 1;
    if (help) e.helped += 1;
    else e.hindered += 1;
    pair.set(key, e);
  };
  for (const m of matches) {
    const personaOf = (seat: number) => m.players.find((p) => p.seat === seat);
    const counted = (seat: number) => !humansOnly || personaOf(seat)?.participant === 'human';
    for (const r of m.rounds) {
      const owner = (id: string | null) => r.proposals.find((p) => p.id === id)?.persona;
      for (const a of r.attachments) {
        const o = owner(a.proposalId);
        if (!o || !counted(a.seat)) continue;
        const cat = CARDS[a.card].category;
        if (cat === 'support') bump(a.persona, o, true);
        else if (cat === 'opposition') bump(a.persona, o, false);
      }
      for (const n of r.actions) {
        const o = owner(n.proposalId);
        if (!o || !counted(n.seat)) continue;
        if (n.move === 'oppose') bump(n.persona, o, false);
        else bump(n.persona, o, true);
      }
    }
  }
  const alliances: AllianceCell[] = [...pair.entries()].map(([key, e]) => {
    const [actor, owner] = key.split('>') as [PersonaId, PersonaId];
    return { actor, owner, n: e.n, helped: e.helped, hindered: e.hindered, hinder: rate(e.hindered, e.n) };
  });

  // Rule friction: where the rules, not the votes, stop things
  const ruleCases = new Map<string, Case[]>();
  for (const c of stopped(scoped)) for (const r of c.rules) if (OBJECTION_RULES[r]) ruleCases.set(r, [...(ruleCases.get(r) ?? []), c]);
  const stoppedN = stopped(scoped).length;
  const rules: RuleInsight[] = [...ruleCases.entries()].map(([rule, cs]) => {
    const placeCounts = new Map<string, number>();
    const kindCounts = new Map<ProjectKind, number>();
    for (const c of cs) {
      placeCounts.set(c.district, (placeCounts.get(c.district) ?? 0) + 1);
      kindCounts.set(c.kind, (kindCounts.get(c.kind) ?? 0) + 1);
    }
    return {
      rule, label: ruleLabel(rule), type: (rule.startsWith('R') ? 'regulatory' : 'social') as RuleInsight['type'], count: cs.length, share: rate(cs.length, stoppedN),
      places: [...placeCounts.entries()].map(([id, count]) => ({ id, name: districtById(id).name, count })).sort((a, b) => b.count - a.count).slice(0, 4),
      kinds: [...kindCounts.entries()].map(([kind, count]) => ({ kind, count })).sort((a, b) => b.count - a.count).slice(0, 4),
    };
  }).sort((a, b) => b.count - a.count);

  // City outcomes
  const ends = finished.map((m) => m.final!.indicators);
  const outcomes: OutcomeInsight = {
    completed: finished.length,
    viable: rate(finished.filter((m) => m.final!.viable).length, finished.length),
    indicators: Object.fromEntries(INDICATORS.map((i) => {
      const xs = ends.map((e) => e[i]).sort((a, b) => a - b);
      return [i, { start: START_INDICATORS[i], mean: mean(xs), p10: quantile(xs, 0.1), p50: quantile(xs, 0.5), p90: quantile(xs, 0.9) }];
    })) as OutcomeInsight['indicators'],
    drivers: (Object.keys(PROJECTS) as ProjectKind[]).map((kind) => {
      const per = (viable: boolean) => {
        const ms = finished.filter((m) => m.final!.viable === viable);
        return mean(ms.map((m) => m.rounds.flatMap((r) => r.outcomes).filter((o) => o.kind === kind && o.status === 'approved').length)) ?? 0;
      };
      const v = per(true);
      const nv = per(false);
      return { kind, name: kindName(kind), viable: v, notViable: nv, diff: v - nv };
    }).filter((d) => d.viable > 0 || d.notViable > 0).sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff)),
  };

  // Personal preferences, kept apart from role-play
  const pref = new Map<string, PreferenceInsight>();
  const prefOf = (kind: ProjectKind | null, district: string | null) => {
    const key = `${kind ?? 'none'}@${district ?? '-'}`;
    if (!pref.has(key)) pref.set(key, { label: kind && district ? `${kindName(kind)}, ${districtById(district).name}` : 'None of the proposals', kind, district, personal: 0, inRole: 0 });
    return pref.get(key)!;
  };
  for (const c of scoped) prefOf(c.kind, c.district).inRole += 1;
  const gap = new Map<PersonaId, { n: number; same: number }>();
  for (const m of matches) {
    for (const r of m.responses) {
      if (humansOnly && r.participant !== 'human') continue;
      // A Beginner "no" or "not sure" is a personal view, but not a preference for that project.
      if (!supportsChoice(r)) continue;
      prefOf(r.kind, r.district).personal += 1;
      const proposed = m.rounds.flatMap((x) => x.proposals).filter((p) => p.seat === r.seat && !p.carried);
      const same = proposed.some((p) => p.kind === r.kind && p.district === r.district);
      const g = gap.get(r.persona) ?? { n: 0, same: 0 };
      g.n += 1;
      if (same) g.same += 1;
      gap.set(r.persona, g);
    }
  }
  const preferences = [...pref.values()].filter((p) => p.personal || p.inRole).sort((a, b) => b.personal - a.personal || b.inRole - a.inRole);
  const roleGap = [...gap.entries()].map(([persona, g]) => ({ persona, name: PERSONA_INFO[persona].name, responses: g.n, sameAsProposed: rate(g.same, g.n) })).sort((a, b) => (a.sameAsProposed.p ?? 1) - (b.sameAsProposed.p ?? 1));

  // Trend: is the picture stable, or still moving?
  const days = new Map<string, { matches: Set<string>; cases: Case[] }>();
  for (const m of matches) days.set(m.startedAt.slice(0, 10), { matches: new Set([...(days.get(m.startedAt.slice(0, 10))?.matches ?? []), m.id]), cases: [] });
  for (const c of scoped) {
    const m = matches.find((x) => x.id === c.matchId);
    if (m) days.get(m.startedAt.slice(0, 10))?.cases.push(c);
  }
  const trend: TrendPoint[] = [...days.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([day, d]) => ({ day, matches: d.matches.size, cases: d.cases.length, approved: approvedRate(d.cases) }));

  // Scope
  const stamps = matches.map((m) => m.startedAt).sort();
  const storySet = new Set(base.map((c) => c.story).filter(Boolean));
  const decisions = matches.reduce((n, m) => n + m.rounds.reduce((k, r) => k + r.proposals.filter((p) => !p.carried).length + r.attachments.length + r.actions.length + r.outcomes.length, 0) + m.responses.length, 0);
  const scope: AtlasInsights['scope'] = {
    matches: matches.length, completed: finished.length, rounds: matches.reduce((n, m) => n + m.rounds.length, 0), cases: scoped.length, decisions,
    humanParticipants: matches.reduce((n, m) => n + m.players.filter((p) => p.participant === 'human').length, 0),
    botSeats: matches.reduce((n, m) => n + m.players.filter((p) => p.participant === 'bot').length, 0),
    sessions: { demo: matches.filter((m) => m.sessionKind === 'demo').length, community: matches.filter((m) => m.sessionKind === 'community').length },
    stories: storySet.size, first: stamps[0] ?? null, last: stamps.at(-1) ?? null, sufficient: scoped.length >= MIN_N * 2,
  };

  const result: AtlasInsights = { scope, kinds, places, cells, scenarios, concessions, stakeholders, alliances, rules, outcomes, preferences, roleGap, trend, insights: [] };
  result.insights = deriveInsights(result, scoped, base);
  return result;
}

// ---------- Findings ----------

function strengthOf(a: Rate, b: Rate | null, significant: boolean): Insight['strength'] {
  if (significant && a.n >= 30 && (b?.n ?? 30) >= 30) return 'strong';
  if (significant) return 'moderate';
  return 'indicative';
}

/**
 * Plain-language findings, ranked by how much evidence is behind them. Every one states its sample
 * and is built only from the numbers above: nothing here is a recommendation, and nothing is public opinion.
 */
function deriveInsights(a: AtlasInsights, scoped: Case[], base: Case[]): Insight[] {
  const out: Insight[] = [];
  const add = (i: Omit<Insight, 'id'>) => out.push({ ...i, id: `i${out.length + 1}` });
  const all = approvedRate0(scoped);

  // Where proposals pass and where they stall
  const placed = a.places.filter((p) => p.n >= MIN_N);
  if (placed.length >= 2) {
    const sorted = [...placed].sort((x, y) => (x.approved.p ?? 0) - (y.approved.p ?? 0));
    const low = sorted[0]!;
    const high = sorted.at(-1)!;
    const cmp = compare(high.approved, low.approved);
    if (cmp && Math.abs(cmp.diff) > 0.1) {
      add({
        tab: 'places', n: low.n + high.n, strength: strengthOf(high.approved, low.approved, cmp.significant),
        text: `Proposals pass ${pct(high.approved)} of the time in ${high.name} (${high.n} cases) but ${pct(low.approved)} in ${low.name} (${low.n} cases).`,
        refs: refsOf(scoped.filter((c) => c.district === low.id || c.district === high.id)),
      });
    }
    const hot = [...placed].sort((x, y) => (y.contested.p ?? 0) - (x.contested.p ?? 0))[0]!;
    if ((hot.contested.p ?? 0) >= 0.4) {
      add({
        tab: 'places', n: hot.n, strength: hot.n >= 30 ? 'moderate' : 'indicative',
        text: `${hot.name} is where proposals are fought hardest: ${pct(hot.contested)} met opposition, a block or a condition (${hot.n} cases).`,
        refs: refsOf(scoped.filter((c) => c.district === hot.id && c.contested)),
      });
    }
  }

  // Which projects, and where the rules bind
  const k = a.kinds.filter((x) => x.n >= MIN_N);
  if (k.length >= 2) {
    const sorted = [...k].sort((x, y) => (x.approved.p ?? 0) - (y.approved.p ?? 0));
    const worst = sorted[0]!;
    const best = sorted.at(-1)!;
    const cmp = compare(best.approved, worst.approved);
    if (cmp && Math.abs(cmp.diff) > 0.1) {
      add({
        tab: 'projects', n: worst.n + best.n, strength: strengthOf(best.approved, worst.approved, cmp.significant),
        text: `${best.name} passes ${pct(best.approved)} of the time (${best.n} cases); ${worst.name} only ${pct(worst.approved)} (${worst.n} cases).`,
        refs: refsOf(scoped.filter((c) => c.kind === best.kind || c.kind === worst.kind)),
      });
    }
  }
  const stoppedCases = scoped.filter((c) => c.status !== 'approved');
  if (stoppedCases.length >= MIN_N) {
    const reg = stoppedCases.filter((c) => c.rules.some((r) => r.startsWith('R'))).length;
    const soc = stoppedCases.filter((c) => c.rules.some((r) => OBJECTION_RULES[r] && !r.startsWith('R'))).length;
    add({
      tab: 'projects', n: stoppedCases.length, strength: stoppedCases.length >= 30 ? 'moderate' : 'indicative',
      text: `Of ${stoppedCases.length} proposals that did not pass, ${Math.round((reg / stoppedCases.length) * 100)}% were touched by a regulatory rule (${reg}) and ${Math.round((soc / stoppedCases.length) * 100)}% by organised opposition, a petition or a refused deal (${soc}); some by both.`,
      refs: refsOf(stoppedCases),
    });
  }
  for (const r of a.rules.slice(0, 2)) {
    if (r.count < 3) continue;
    const where = r.places[0];
    add({
      tab: 'projects', n: r.count, strength: r.count >= 15 ? 'moderate' : 'indicative',
      text: `"${r.label}" touched ${pct(r.share)} of the proposals that did not pass (${r.count} of ${r.share.n})${where ? `, most often in ${where.name}` : ''}.`,
      refs: refsOf(scoped.filter((c) => c.rules.includes(r.rule))),
    });
  }

  // What unlocks consent
  for (const c of a.concessions) {
    if (c.lift === null || c.passAccepted.n < 5 || c.passNone.n < 5) continue;
    if (Math.abs(c.lift) < 0.1) continue;
    add({
      tab: 'projects', n: c.passAccepted.n + c.passNone.n, strength: strengthOf(c.passAccepted, c.passNone, c.significant),
      text: `Where "${c.title}" was accepted, ${pct(c.passAccepted)} of the proposals passed (${c.passAccepted.n} cases) against ${pct(c.passNone)} when it was never offered (${c.passNone.n} cases).`,
      refs: refsOf(scoped.filter((x) => x.accepted.includes(c.kind))),
    });
  }

  // How the scenario changes the table
  for (const s of a.scenarios) {
    if (s.lift === null || s.cases < MIN_N || Math.abs(s.lift) < 0.1) continue;
    add({
      tab: 'scenarios', n: s.cases, strength: strengthOf(s.approved, null, s.significant),
      text: `Under ${s.label.toLowerCase()} crises, proposals pass ${pct(s.approved)} of the time (${s.cases} cases), ${Math.abs(Math.round(s.lift * 100))} points ${s.lift > 0 ? 'above' : 'below'} the other scenarios.`,
      refs: refsOf(base.filter((c) => c.crisis === s.kind)),
    });
  }
  const shifts = a.scenarios.flatMap((s) => {
    if (s.cases < MIN_N) return [];
    const others = base.filter((c) => c.crisis !== null && c.crisis !== s.kind);
    return s.mix.slice(0, 4).map((m) => {
      const elsewhere = others.filter((c) => c.kind === m.kind).length / Math.max(1, others.length);
      return { s, m, delta: m.share - elsewhere };
    });
  }).sort((x, y) => y.delta - x.delta);
  const shift = shifts[0];
  if (shift && shift.delta >= 0.1) {
    add({
      tab: 'scenarios', n: shift.s.cases, strength: shift.s.cases >= 30 ? 'moderate' : 'indicative',
      text: `When the crisis is ${shift.s.label.toLowerCase()}, ${Math.round(shift.m.share * 100)}% of proposals are ${kindName(shift.m.kind).toLowerCase()} (${shift.m.n} of ${shift.s.cases}), ${Math.round(shift.delta * 100)} points more than under other crises.`,
      refs: refsOf(base.filter((c) => c.crisis === shift.s.kind)),
    });
  }

  // Who stands where
  const adversaries = a.alliances.filter((x) => x.n >= MIN_N).sort((x, y) => (y.hinder.p ?? 0) - (x.hinder.p ?? 0));
  const worst = adversaries[0];
  if (worst && (worst.hinder.p ?? 0) >= 0.5) {
    add({
      tab: 'stakeholders', n: worst.n, strength: worst.n >= 30 ? 'moderate' : 'indicative',
      text: `${PERSONA_INFO[worst.actor].name} players hindered ${PERSONA_INFO[worst.owner].name} proposals ${pct(worst.hinder)} of the times they acted on one (${worst.n} actions).`,
      refs: [],
    });
  }
  const allies = [...a.alliances].filter((x) => x.n >= MIN_N).sort((x, y) => (x.hinder.p ?? 1) - (y.hinder.p ?? 1));
  const best = allies[0];
  if (best && (best.hinder.p ?? 1) <= 0.25) {
    add({
      tab: 'stakeholders', n: best.n, strength: best.n >= 30 ? 'moderate' : 'indicative',
      text: `${PERSONA_INFO[best.actor].name} players backed ${PERSONA_INFO[best.owner].name} proposals ${pct(rate(best.helped, best.n))} of the times they acted on one (${best.n} actions).`,
      refs: [],
    });
  }

  // What city comes out
  if (a.outcomes.completed >= MIN_N) {
    const v = a.outcomes.viable;
    add({
      tab: 'outcomes', n: v.n, strength: v.n >= 30 ? 'moderate' : 'indicative',
      text: `${pct(v)} of finished cities were still viable (${v.k} of ${v.n}).`,
      refs: [],
    });
    const d = a.outcomes.drivers.find((x) => Math.abs(x.diff) >= 0.5);
    if (d) {
      add({
        tab: 'outcomes', n: a.outcomes.completed, strength: 'indicative',
        text: `Viable cities approved ${d.viable.toFixed(1)} ${d.name.toLowerCase()} projects on average; cities that failed approved ${d.notViable.toFixed(1)}.`,
        refs: [],
      });
    }
  }

  // Role-play vs personal view
  const g = a.roleGap.find((x) => x.responses >= MIN_N && (x.sameAsProposed.p ?? 1) < 0.5);
  if (g) {
    add({
      tab: 'preferences', n: g.responses, strength: g.responses >= 30 ? 'moderate' : 'indicative',
      text: `${g.name} players personally picked a different proposal from the one they put forward in role ${pct(rate(g.responses - g.sameAsProposed.k, g.responses))} of the time (${g.responses} answers). This is not public opinion.`,
      refs: [],
    });
  }

  void all;
  const order = { strong: 0, moderate: 1, indicative: 2 } as const;
  return out.sort((x, y) => order[x.strength] - order[y.strength] || y.n - x.n).map((x, i) => ({ ...x, id: `i${i + 1}` }));
}

function approvedRate0(cs: Case[]) {
  return rate(cs.filter((c) => c.status === 'approved').length, cs.length);
}

// ---------- Flat tables for a planner's own analysis ----------

export interface AtlasTable {
  columns: string[];
  rows: (string | number | null)[][];
}

const r4 = (v: number | null) => (v === null ? null : Math.round(v * 10000) / 10000);
const rateCols = (name: string) => [`${name}_k`, `${name}_n`, `${name}_rate`, `${name}_lo`, `${name}_hi`];
const rateVals = (r: Rate) => [r.k, r.n, r4(r.p), r4(r.lo), r4(r.hi)];

/** Every table of the atlas as plain rows (the CSV downloads). Rates carry their counts and intervals. */
export function atlasTables(a: AtlasInsights): Record<string, AtlasTable> {
  return {
    places: {
      columns: ['district_id', 'district', 'lon', 'lat', 'proposals', ...rateCols('approved'), ...rateCols('contested'), ...rateCols('blocked'), 'personal_preferences', 'top_proposer', 'top_rules'],
      rows: a.places.map((p) => [p.id, p.name, p.center[0], p.center[1], p.n, ...rateVals(p.approved), ...rateVals(p.contested), ...rateVals(p.blocked), p.preferred, p.topProposer, p.topRules.map((r) => `${r.rule}:${r.count}`).join(' ')]),
    },
    place_by_project: {
      columns: ['district_id', 'district', 'project', 'proposals', ...rateCols('approved')],
      rows: a.cells.map((c) => [c.district, districtById(c.district).name, c.kind, c.n, ...rateVals(c.approved)]),
    },
    projects: {
      columns: ['project', 'name', 'proposals', ...rateCols('approved'), ...rateCols('blocked'), ...rateCols('rejected'), ...rateCols('delayed'), 'mean_support', 'mean_opposition', ...rateCols('conditioned'), 'top_rule'],
      rows: a.kinds.map((k) => [k.kind, k.name, k.n, ...rateVals(k.approved), ...rateVals(k.blocked), ...rateVals(k.rejected), ...rateVals(k.delayed), r4(k.meanSupport), r4(k.meanOpposition), ...rateVals(k.conditioned), k.topRule?.rule ?? null]),
    },
    scenarios: {
      columns: ['crisis', 'label', 'matches', 'proposals', ...rateCols('approved'), 'lift_vs_other', 'significant', ...INDICATORS.map((i) => `mean_change_${i}`)],
      rows: a.scenarios.map((s) => [s.kind, s.label, s.matches, s.cases, ...rateVals(s.approved), r4(s.lift), s.significant ? 1 : 0, ...INDICATORS.map((i) => r4(s.meanChange[i]))]),
    },
    concessions: {
      columns: ['concession', 'title', 'offered', ...rateCols('accepted'), ...rateCols('pass_if_accepted'), ...rateCols('pass_if_refused'), ...rateCols('pass_if_not_offered'), 'lift', 'significant'],
      rows: a.concessions.map((c) => [c.kind, c.title, c.offered, ...rateVals(c.accepted), ...rateVals(c.passAccepted), ...rateVals(c.passRefused), ...rateVals(c.passNone), r4(c.lift), c.significant ? 1 : 0]),
    },
    stakeholders: {
      columns: ['persona', 'proposals', ...rateCols('approved'), 'support_cards', 'opposition_cards', 'back', 'oppose', 'fund', ...rateCols('deals_accepted'), ...rateCols('wins'), 'mean_score'],
      rows: a.stakeholders.map((s) => [s.persona, s.proposals, ...rateVals(s.approved), s.supportCards, s.oppositionCards, s.back, s.oppose, s.fund, ...rateVals(s.deals), ...rateVals(s.wins), r4(s.meanScore)]),
    },
    alliances: {
      columns: ['actor', 'owner', 'actions', 'helped', 'hindered', ...rateCols('hinder')],
      rows: a.alliances.map((x) => [x.actor, x.owner, x.n, x.helped, x.hindered, ...rateVals(x.hinder)]),
    },
    rules: {
      columns: ['rule', 'label', 'type', 'proposals_touched', ...rateCols('share_of_stopped'), 'top_places'],
      rows: a.rules.map((r) => [r.rule, r.label, r.type, r.count, ...rateVals(r.share), r.places.map((p) => `${p.id}:${p.count}`).join(' ')]),
    },
    insights: {
      columns: ['id', 'section', 'strength', 'cases', 'text', 'match_ids'],
      rows: a.insights.map((i) => [i.id, i.tab, i.strength, i.n, i.text, i.refs.join(' ')]),
    },
  };
}
