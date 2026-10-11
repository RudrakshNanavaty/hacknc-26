// The planning-feedback record a match leaves behind, and what Planning Studio computes from them.
// Role-play choices and personal preferences are kept apart, and so are demo sessions, bots and
// community sessions: role-play is not public opinion.
import { CARDS, PERSONA_INFO, PROJECTS, RULES_VERSION, START_INDICATORS, type CardId, type ComboId, type Indicators, type PersonaId, type ProjectKind } from './content';
import { applyDirectorEvent, type AcceptedEvent, type TableHint } from './director';
import { DATA_SOURCES, DATA_VERSION, DISTRICTS, districtById, type DataSource } from './districts';
import type { Crisis, LiveConditions } from './scenario';
import { crisisFor, finalResult, resolveRound, startCity, type Attachment, type Compromise, type FinalResult, type NegotiationAction, type Outcome, type Proposal, type Resolution, type RuleEvent } from './engine';

export type SessionKind = 'demo' | 'community';
export type ParticipantKind = 'human' | 'bot';

export interface MatchPlayer {
  seat: number;
  name: string;
  persona: PersonaId;
  participant: ParticipantKind;
}

export interface RoundRecord {
  round: number;
  crisis: Crisis;
  proposals: Proposal[];
  attachments: Attachment[];
  compromises: Compromise[];
  actions: NegotiationAction[];
  outcomes: Outcome[];
  events: RuleEvent[];
  before: Indicators;
  after: Indicators;
  headline: string;
  resolvedAt: string;
  /** Authored combos completed this round. */
  combos?: { combo: ComboId; district: string; proposalIds: string[] }[];
  /** What the Game Director proposed and what the rules accepted (absent on rules 1.x records). */
  director?: RoundDirector;
}

/** One proposal from the Director (or its template fallback) and what validation did with it. */
export interface DirectorLogEntry {
  kind: 'event' | 'dialogue' | 'hint' | 'combo';
  source: 'gemini' | 'template';
  status: 'accepted' | 'clamped' | 'rejected';
  reasons: string[];
  /** The raw proposal, for events only (small, and what a reviewer needs). */
  proposal?: unknown;
  at: string;
}

export interface RoundDirector {
  /** The twist applied at the start of play this round: exact, validated values. Replays use this, never Gemini. */
  event: AcceptedEvent | null;
  /** Its rule event (D1) as applied. */
  eventRule: RuleEvent | null;
  /** Hints shown on the negotiating table, and whether a player then made that move. */
  hints: (TableHint & { followed: boolean })[];
  log: DirectorLogEntry[];
}

/** A combo idea the model had that is not in the rules: kept for a designer to review, never executed. */
export interface ReviewItem {
  round: number;
  idea: string;
  source: 'gemini';
  at: string;
}

/** "Outside your assigned character, which proposal would you personally support?" */
export interface PreferenceResponse {
  seat: number;
  /** The persona they played (their own view is separate from it). */
  persona: PersonaId;
  participant: ParticipantKind;
  /** A proposal id from this match, or 'none'. */
  choice: string;
  kind: ProjectKind | null;
  district: string | null;
  at: string;
}

export interface MatchRecord {
  id: string;
  roomCode: string;
  city: string;
  scenario: string;
  rulesVersion: string;
  dataVersion: string;
  dataSources: DataSource[];
  sessionKind: SessionKind;
  startedAt: string;
  endedAt: string | null;
  players: MatchPlayer[];
  rounds: RoundRecord[];
  final: FinalResult | null;
  responses: PreferenceResponse[];
  /** Novel AI ideas for designers (rules 2.x). Not rules, not evidence. */
  reviewQueue?: ReviewItem[];
  /** Where this match's crises came from, and the live readings they were written from. */
  scenarioSource?: 'gemini' | 'authored';
  live?: LiveConditions | null;
}

export const SCENARIO_ID = 'miami-beach-coastal-2026';
export const PREFERENCE_QUESTION = 'Outside your assigned character, which proposal would you personally support?';

export function newMatchRecord(id: string, roomCode: string, sessionKind: SessionKind, players: MatchPlayer[], now = new Date()): MatchRecord {
  return {
    id, roomCode, city: 'Miami Beach, Florida', scenario: SCENARIO_ID, rulesVersion: RULES_VERSION, dataVersion: DATA_VERSION,
    dataSources: DATA_SOURCES, sessionKind, startedAt: now.toISOString(), endedAt: null, players, rounds: [], final: null, responses: [],
    reviewQueue: [],
  };
}

export interface Replay {
  rounds: Resolution[];
  final: FinalResult;
  /** True when every round's outcomes and indicators match the record. */
  matches: boolean;
  mismatches: string[];
}

/**
 * Re-run a recorded match through the engine, with each round's stored twist and no network:
 * the same record always gives the same city.
 */
export function replayMatch(m: MatchRecord): Replay {
  let city = startCity();
  const rounds: Resolution[] = [];
  const mismatches: string[] = [];
  for (const r of m.rounds) {
    const ev = r.director?.event;
    if (ev) city = applyDirectorEvent(city, ev).city;
    // Each match brings its own scenario: replay with the crisis the round was played under (older
    // records stored only the authored crisis's id).
    const recorded = r.crisis as Crisis | string | undefined;
    const crisis = recorded && typeof recorded === 'object' ? recorded : crisisFor(r.round);
    const board = { round: r.round, crisis, proposals: r.proposals, attachments: r.attachments, compromises: r.compromises };
    const res = resolveRound(board, r.actions, city);
    if (JSON.stringify(res.before) !== JSON.stringify(r.before)) mismatches.push(`round ${r.round}: indicators before`);
    if (JSON.stringify(res.after) !== JSON.stringify(r.after)) mismatches.push(`round ${r.round}: indicators after`);
    if (res.outcomes.map((o) => `${o.proposalId}:${o.status}`).join() !== r.outcomes.map((o) => `${o.proposalId}:${o.status}`).join()) mismatches.push(`round ${r.round}: outcomes`);
    rounds.push(res);
    city = res.city;
  }
  const final = finalResult(START_INDICATORS, city.indicators, rounds, m.players.map((p) => p.persona));
  if (m.final && JSON.stringify(final.scores) !== JSON.stringify(m.final.scores)) mismatches.push('final scores');
  return { rounds, final, matches: mismatches.length === 0, mismatches };
}

// ---------- Planning Studio ----------

export interface StudioFilter {
  /** Which sessions count. Default: all, but every number is split by kind. */
  sessionKind?: SessionKind | 'all';
  /** Leave bots out of counts (default true). */
  humansOnly?: boolean;
}

export interface DistrictStat {
  id: string;
  name: string;
  center: [number, number];
  proposals: number;
  /** Proposals that met any opposition, block or condition. */
  contested: number;
  status: Record<Outcome['status'], number>;
  byKind: Partial<Record<ProjectKind, number>>;
  compromisesAccepted: number;
  preferred: number;
}

export interface Finding {
  text: string;
  /** Where it comes from: matchId/eventId or matchId/response/seat. */
  refs: string[];
}

export interface StudioSummary {
  matches: number;
  completed: number;
  sessions: Record<SessionKind, number>;
  participants: Record<ParticipantKind, number>;
  responses: number;
  districts: DistrictStat[];
  cards: { card: CardId; name: string; persona: PersonaId; plays: number }[];
  objections: { rule: string; label: string; count: number; refs: string[] }[];
  compromises: { kind: Compromise['kind']; title: string; offered: number; accepted: number }[];
  preferences: { label: string; kind: ProjectKind | null; district: string | null; personal: number; inRole: number }[];
  /** Personas whose players personally preferred something other than what they proposed in role. */
  crossovers: { persona: PersonaId; played: string; preferred: string; count: number }[];
  /** Authored combos completed (rules, not opinion). */
  combos: { combo: ComboId; count: number }[];
  /** What the AI Game Director did. Game fiction and coaching: never public opinion, never findings. */
  director: DirectorSummary;
  findings: Finding[];
}

export interface DirectorSummary {
  twists: { matchId: string; round: number; type: string; title: string; district: string; magnitude: number; source: 'gemini' | 'template' }[];
  /** Every proposal the model made, by what validation did with it. */
  proposals: Record<'accepted' | 'clamped' | 'rejected', number>;
  hints: { shown: number; aiWorded: number; followed: number };
  reviewQueue: (ReviewItem & { matchId: string })[];
}

const OBJECTION_RULES: Record<string, string> = {
  R1: 'Environmental challenge in a coastal high hazard area (blocked)',
  O1: 'Environmental challenge (opposition)',
  O2: 'Neighborhood petition',
  O3: 'Public access condition refused',
  N2: 'Opposed in negotiation',
  O4: 'Building moratorium',
  O5: 'Habitat survey',
  O6: 'Rent shield',
  O7: 'Eco-certification refused',
};

const humanSeats = (m: MatchRecord, humansOnly: boolean) => new Set(m.players.filter((p) => !humansOnly || p.participant === 'human').map((p) => p.seat));

export function filterMatches(matches: MatchRecord[], f: StudioFilter = {}): MatchRecord[] {
  return matches.filter((m) => !f.sessionKind || f.sessionKind === 'all' || m.sessionKind === f.sessionKind);
}

export function studioSummary(all: MatchRecord[], f: StudioFilter = {}): StudioSummary {
  const humansOnly = f.humansOnly ?? true;
  const matches = filterMatches(all, f);
  const districts = new Map<string, DistrictStat>(
    DISTRICTS.map((d) => [d.id, { id: d.id, name: d.name, center: d.center, proposals: 0, contested: 0, status: { approved: 0, blocked: 0, rejected: 0, delayed: 0, unfunded: 0 }, byKind: {}, compromisesAccepted: 0, preferred: 0 }]),
  );
  const cards = new Map<CardId, number>();
  const objections = new Map<string, { count: number; refs: string[] }>();
  const compromises = new Map<string, { kind: Compromise['kind']; title: string; offered: number; accepted: number }>();
  const prefs = new Map<string, { label: string; kind: ProjectKind | null; district: string | null; personal: number; inRole: number }>();
  const crossovers = new Map<string, { persona: PersonaId; played: string; preferred: string; count: number }>();
  const participants: Record<ParticipantKind, number> = { human: 0, bot: 0 };
  const sessions: Record<SessionKind, number> = { demo: 0, community: 0 };
  let responses = 0;
  const prefKey = (kind: ProjectKind | null, district: string | null) => `${kind ?? 'none'}@${district ?? '-'}`;
  const prefLabel = (kind: ProjectKind | null, district: string | null) => (kind && district ? `${PROJECTS[kind].name}, ${districtById(district).name}` : 'None of the proposals');
  const pref = (kind: ProjectKind | null, district: string | null) => {
    const k = prefKey(kind, district);
    if (!prefs.has(k)) prefs.set(k, { label: prefLabel(kind, district), kind, district, personal: 0, inRole: 0 });
    return prefs.get(k)!;
  };

  for (const m of matches) {
    sessions[m.sessionKind] += 1;
    for (const p of m.players) participants[p.participant] += 1;
    const seats = humanSeats(m, humansOnly);
    for (const r of m.rounds) {
      for (const p of r.proposals.filter((x) => !x.carried)) {
        if (seats.has(p.seat)) cards.set(cardOf(p.kind), (cards.get(cardOf(p.kind)) ?? 0) + 1);
      }
      for (const a of r.attachments) if (seats.has(a.seat)) cards.set(a.card, (cards.get(a.card) ?? 0) + 1);
      for (const o of r.outcomes) {
        const d = districts.get(o.district);
        if (!d) continue;
        d.proposals += 1;
        d.status[o.status] += 1;
        d.byKind[o.kind] = (d.byKind[o.kind] ?? 0) + 1;
        if (o.opposition > 0 || o.status === 'blocked' || r.compromises.some((c) => c.proposalId === o.proposalId)) d.contested += 1;
        pref(o.kind, o.district).inRole += 1;
      }
      for (const c of r.compromises) {
        const e = compromises.get(c.kind) ?? { kind: c.kind, title: c.title, offered: 0, accepted: 0 };
        e.offered += 1;
        if (c.accepted) {
          e.accepted += 1;
          const target = r.proposals.find((p) => p.id === c.proposalId);
          if (target) districts.get(target.district)!.compromisesAccepted += 1;
        }
        compromises.set(c.kind, e);
      }
      for (const ev of r.events) {
        const label = OBJECTION_RULES[ev.rule];
        if (!label) continue;
        if (ev.seat !== undefined && !seats.has(ev.seat)) continue;
        const e = objections.get(ev.rule) ?? { count: 0, refs: [] };
        e.count += 1;
        e.refs.push(`${m.id}/${ev.id}`);
        objections.set(ev.rule, e);
      }
    }
    for (const resp of m.responses) {
      if (humansOnly && resp.participant !== 'human') continue;
      responses += 1;
      const p = pref(resp.kind, resp.district);
      p.personal += 1;
      if (resp.district) districts.get(resp.district)!.preferred += 1;
      const played = m.rounds.flatMap((r) => r.proposals).filter((x) => x.seat === resp.seat && !x.carried).map((x) => PROJECTS[x.kind].name);
      const playedLabel = played.length ? [...new Set(played)].join(' + ') : 'no project';
      const prefLbl = prefLabel(resp.kind, resp.district);
      const key = `${resp.persona}|${playedLabel}|${prefLbl}`;
      const c = crossovers.get(key) ?? { persona: resp.persona, played: playedLabel, preferred: prefLbl, count: 0 };
      c.count += 1;
      crossovers.set(key, c);
    }
  }

  const combos = new Map<ComboId, number>();
  const director: DirectorSummary = { twists: [], proposals: { accepted: 0, clamped: 0, rejected: 0 }, hints: { shown: 0, aiWorded: 0, followed: 0 }, reviewQueue: [] };
  for (const m of matches) {
    for (const r of m.rounds) {
      for (const c of r.combos ?? []) combos.set(c.combo, (combos.get(c.combo) ?? 0) + 1);
      const d = r.director;
      if (!d) continue;
      if (d.event) director.twists.push({ matchId: m.id, round: r.round, type: d.event.type, title: d.event.title, district: d.event.district, magnitude: d.event.magnitude, source: d.event.source });
      for (const l of d.log) if (l.source === 'gemini') director.proposals[l.status] += 1;
      director.hints.shown += d.hints.length;
      director.hints.aiWorded += d.hints.filter((h) => h.source === 'gemini').length;
      director.hints.followed += d.hints.filter((h) => h.followed).length;
    }
    for (const q of m.reviewQueue ?? []) director.reviewQueue.push({ ...q, matchId: m.id });
  }

  const summary: StudioSummary = {
    matches: matches.length,
    completed: matches.filter((m) => m.final).length,
    sessions,
    participants,
    responses,
    districts: [...districts.values()],
    cards: [...cards.entries()].map(([card, plays]) => ({ card, name: CARDS[card].name, persona: CARDS[card].persona, plays })).sort((a, b) => b.plays - a.plays),
    objections: [...objections.entries()].map(([rule, e]) => ({ rule, label: OBJECTION_RULES[rule]!, count: e.count, refs: e.refs })).sort((a, b) => b.count - a.count),
    compromises: [...compromises.values()],
    preferences: [...prefs.values()].sort((a, b) => b.personal - a.personal || b.inRole - a.inRole),
    crossovers: [...crossovers.values()].sort((a, b) => b.count - a.count),
    combos: [...combos.entries()].map(([combo, count]) => ({ combo, count })).sort((a, b) => b.count - a.count),
    director,
    findings: [],
  };
  summary.findings = findings(summary, matches);
  return summary;
}

const cardOf = (kind: ProjectKind): CardId => (Object.values(CARDS).find((c) => c.project === kind)!.id);

/** Plain-language findings. Every one quotes counts from the summary and points at its records. */
function findings(s: StudioSummary, matches: MatchRecord[]): Finding[] {
  const out: Finding[] = [];
  const hot = [...s.districts].sort((a, b) => b.contested - a.contested)[0];
  if (hot && hot.contested > 0) {
    const refs = matches.flatMap((m) => m.rounds.flatMap((r) => r.outcomes.filter((o) => o.district === hot.id && o.opposition + (o.status === 'blocked' ? 1 : 0) > 0).map((o) => `${m.id}/${o.rules[0]}`)));
    out.push({ text: `${hot.name} is the most contested place: ${hot.contested} of its ${hot.proposals} proposals met opposition, a block or a condition.`, refs });
  }
  const topObjection = s.objections[0];
  if (topObjection) out.push({ text: `The most common objection is "${topObjection.label}" (${topObjection.count} times).`, refs: topObjection.refs.slice(0, 20) });
  for (const c of s.compromises.filter((x) => x.accepted > 0)) {
    out.push({ text: `"${c.title}" was offered ${c.offered} times and accepted ${c.accepted} times.`, refs: matches.flatMap((m) => m.rounds.flatMap((r) => r.compromises.filter((x) => x.kind === c.kind && x.accepted).map((x) => `${m.id}/${x.id}`))) });
  }
  const topPref = s.preferences.find((p) => p.personal > 0);
  if (topPref) {
    out.push({
      text: `Asked outside their character, players most often support: ${topPref.label} (${topPref.personal} of ${s.responses} responses).`,
      refs: matches.flatMap((m) => m.responses.filter((r) => r.kind === topPref.kind && r.district === topPref.district).map((r) => `${m.id}/response/${r.seat}`)),
    });
  }
  const cross = s.crossovers.find((c) => !c.preferred.startsWith(c.played.split(' + ')[0] ?? '~'));
  if (cross) out.push({ text: `${cross.count} ${PERSONA_INFO[cross.persona].name} player${cross.count > 1 ? 's' : ''} proposed ${cross.played} in role but personally prefer ${cross.preferred}.`, refs: [] });
  return out;
}

// ---------- Exports ----------

const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? '' : Array.isArray(v) ? v.join(' ') : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export const CSV_COLUMNS = [
  'match_id', 'session_kind', 'rules_version', 'data_version', 'round', 'record_type', 'seat', 'persona', 'participant',
  'card', 'project', 'proposal_id', 'district_id', 'district_name', 'planning_district', 'lon', 'lat', 'status',
  'support', 'opposition', 'conditions', 'rule_ids', 'zoning_object_ids', 'flood_zone_object_ids', 'source_layers',
] as const;

/** One row per decision: each card played, each negotiation move, each outcome and each personal preference. */
export function toCsv(matches: MatchRecord[]): string {
  const rows: string[][] = [CSV_COLUMNS as unknown as string[]];
  const sourceLayers = DATA_SOURCES.map((s) => s.layer).join(' ');
  for (const m of matches) {
    const who = (seat: number) => m.players.find((p) => p.seat === seat);
    const base = (round: number | '', type: string, seat: number | '', district: string | null) => {
      const d = district ? districtById(district) : null;
      const p = typeof seat === 'number' ? who(seat) : undefined;
      return {
        match_id: m.id, session_kind: m.sessionKind, rules_version: m.rulesVersion, data_version: m.dataVersion, round, record_type: type,
        seat, persona: p?.persona ?? '', participant: p?.participant ?? '',
        district_id: d?.id ?? '', district_name: d?.name ?? '', planning_district: d?.planningDistrict ?? '',
        lon: d?.center[0] ?? '', lat: d?.center[1] ?? '',
        zoning_object_ids: d?.sources.zoningIds ?? [], flood_zone_object_ids: d?.sources.floodZoneIds ?? [], source_layers: d ? sourceLayers : '',
      } as Record<string, unknown>;
    };
    const push = (r: Record<string, unknown>) => rows.push(CSV_COLUMNS.map((c) => csvCell(r[c])));
    for (const r of m.rounds) {
      for (const p of r.proposals.filter((x) => !x.carried)) push({ ...base(r.round, 'play', p.seat, p.district), card: cardOf(p.kind), project: p.kind, proposal_id: p.id });
      for (const a of r.attachments) push({ ...base(r.round, 'play', a.seat, a.district), card: a.card, proposal_id: a.proposalId ?? '' });
      for (const n of r.actions) {
        const p = r.proposals.find((x) => x.id === n.proposalId);
        push({ ...base(r.round, `negotiation:${n.move}`, n.seat, p?.district ?? null), project: p?.kind ?? '', proposal_id: n.proposalId });
      }
      for (const o of r.outcomes) {
        push({
          ...base(r.round, 'outcome', o.seat, o.district), card: cardOf(o.kind), project: o.kind, proposal_id: o.proposalId, status: o.status,
          support: o.support, opposition: o.opposition, conditions: o.conditions.join('; '),
          rule_ids: o.rules.map((id) => r.events.find((e) => e.id === id)?.rule).filter(Boolean),
        });
      }
    }
    for (const resp of m.responses) push({ ...base('', 'personal_preference', resp.seat, resp.district), project: resp.kind ?? 'none', proposal_id: resp.choice, participant: resp.participant });
  }
  return rows.map((r) => r.join(',')).join('\n') + '\n';
}

/** Every outcome and personal preference as a point at its district's center, with the source features. */
export function toGeoJson(matches: MatchRecord[]) {
  const features = [];
  for (const m of matches) {
    for (const r of m.rounds) {
      for (const o of r.outcomes) {
        const d = districtById(o.district);
        features.push({
          type: 'Feature' as const,
          geometry: { type: 'Point' as const, coordinates: d.center },
          properties: {
            record: 'outcome', match_id: m.id, session_kind: m.sessionKind, round: r.round, proposal_id: o.proposalId, project: o.kind,
            persona: o.persona, status: o.status, support: o.support, opposition: o.opposition, conditions: o.conditions,
            district_id: d.id, district_name: d.name, district_bbox: d.bbox, zoning_object_ids: d.sources.zoningIds,
            flood_zone_object_ids: d.sources.floodZoneIds, rules_version: m.rulesVersion, data_version: m.dataVersion,
          },
        });
      }
    }
    for (const resp of m.responses) {
      if (!resp.district) continue;
      const d = districtById(resp.district);
      features.push({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: d.center },
        properties: { record: 'personal_preference', match_id: m.id, session_kind: m.sessionKind, persona_played: resp.persona, participant: resp.participant, project: resp.kind, district_id: d.id, district_name: d.name },
      });
    }
  }
  return { type: 'FeatureCollection' as const, sources: DATA_SOURCES, features };
}
