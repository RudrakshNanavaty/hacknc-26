// What a match record adds up to, as flat rows: one summary per match and the city after each round.
// Pure functions of the record (no I/O), so the same rows come out of a replay, a test or a backfill.
import type { Indicators, MatchRecord } from '@shared';

export interface MatchSummaryRow {
  match_id: string;
  room_code: string;
  session_kind: string;
  started_at: string;
  ended_at: string | null;
  completed: boolean;
  rounds: number;
  players: unknown;
  winners: unknown;
  scores: unknown;
  viable: boolean | null;
  proposals: number;
  approved: number;
  stopped: number;
  twists: number;
  combos: number;
  responses: number;
  indicators_start: Indicators | null;
  indicators_end: Indicators | null;
  stories: unknown;
  scenario_source: string | null;
  headlines: unknown;
}

export interface CitySnapshotRow {
  match_id: string;
  round: number;
  at: string;
  final: boolean;
  indicators: Indicators;
  built: { kind: string; district: string; round: number; persona: string }[];
}

export function matchSummaryRow(m: MatchRecord): MatchSummaryRow {
  const outcomes = m.rounds.flatMap((r) => r.outcomes);
  const seenStories = new Set<string>();
  const stories = m.rounds.flatMap((r) => {
    const s = r.crisis.story;
    if (!s || seenStories.has(s.id)) return [];
    seenStories.add(s.id);
    return [{ round: r.round, id: s.id, title: s.title, years: s.years, sources: s.sources.length, verification: s.verification?.status ?? null }];
  });
  return {
    match_id: m.id,
    room_code: m.roomCode,
    session_kind: m.sessionKind,
    started_at: m.startedAt,
    ended_at: m.endedAt,
    completed: m.final !== null,
    rounds: m.rounds.length,
    players: m.players,
    winners: m.final?.winners ?? null,
    scores: m.final ? Object.fromEntries(m.final.scores.map((s) => [s.persona, s.total])) : null,
    viable: m.final?.viable ?? null,
    proposals: m.rounds.reduce((n, r) => n + r.proposals.filter((p) => !p.carried).length, 0),
    approved: outcomes.filter((o) => o.status === 'approved').length,
    stopped: outcomes.filter((o) => o.status !== 'approved').length,
    twists: m.rounds.filter((r) => r.director?.event).length,
    combos: m.rounds.reduce((n, r) => n + (r.combos?.length ?? 0), 0),
    responses: m.responses.length,
    indicators_start: m.rounds[0]?.before ?? null,
    indicators_end: m.rounds.at(-1)?.after ?? null,
    stories,
    scenario_source: m.scenarioSource ?? null,
    headlines: m.rounds.map((r) => ({ round: r.round, headline: r.headline })),
  };
}

/** The city as it stood after each resolved round, with what has been built so far. */
export function citySnapshotRows(m: MatchRecord): CitySnapshotRow[] {
  const built: CitySnapshotRow['built'] = [];
  return m.rounds.map((r, i) => {
    for (const o of r.outcomes) if (o.status === 'approved') built.push({ kind: o.kind, district: o.district, round: r.round, persona: o.persona });
    return {
      match_id: m.id,
      round: r.round,
      at: r.resolvedAt,
      final: m.final !== null && i === m.rounds.length - 1,
      indicators: r.after,
      built: [...built],
    };
  });
}
