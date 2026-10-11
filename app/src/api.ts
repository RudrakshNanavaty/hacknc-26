// Calls to the server. Everything here fails soft: the caller gets null and the page says so.
import type { AtlasInsights, CrisisKind, DataSource, MatchPlayer, MatchRecord, PlanAtlas, PlanConfig, SessionKind, StudioSummary } from '@shared';

export interface StudioMatch {
  id: string;
  roomCode: string;
  sessionKind: SessionKind;
  startedAt: string;
  endedAt: string | null;
  players: MatchPlayer[];
  rounds: number;
  responses: number;
  winners: string[] | null;
}

export interface StudioData {
  store: 'tiger' | 'memory';
  question: string;
  rulesVersion: string;
  dataVersion: string;
  dataMethod: string;
  sources: DataSource[];
  summary: StudioSummary;
  matches: StudioMatch[];
}

async function get<T>(url: string): Promise<T | null> {
  try {
    const r = await fetch(url);
    return r.ok ? ((await r.json()) as T) : null;
  } catch {
    return null;
  }
}

export const studio = (session: SessionKind | 'all', bots: boolean) => get<StudioData>(`/api/studio?session=${session}${bots ? '&bots=include' : ''}`);
export interface AtlasMatch {
  id: string;
  roomCode: string;
  sessionKind: SessionKind;
  startedAt: string;
  endedAt: string | null;
  players: MatchPlayer[];
  rounds: number;
  responses: number;
  winners: string[] | null;
  viable: boolean | null;
  approved: number;
  stopped: number;
  proposals: number;
  stories: { round: number; id: string; title: string; years: string; sources: number; verification: string | null }[];
}

export interface AtlasData {
  store: string;
  question: string;
  rulesVersion: string;
  dataVersion: string;
  dataMethod: string;
  sources: DataSource[];
  insights: AtlasInsights;
  matches: AtlasMatch[];
}

export interface AtlasQuery {
  session: SessionKind | 'all';
  bots: boolean;
  scenario: CrisisKind | 'all';
  area: string | 'all';
}

export const atlasQueryString = (q: AtlasQuery) => {
  const p = new URLSearchParams({ session: q.session, scenario: q.scenario, area: q.area });
  if (q.bots) p.set('bots', 'include');
  return p.toString();
};

export interface DecisionRow {
  id: string;
  at: string;
  match_id: string;
  round: number | null;
  kind: string;
  persona: string | null;
  participant: string | null;
  session_kind: string;
  card: string | null;
  project: string | null;
  district: string | null;
  status: string | null;
  crisis: string | null;
}

export const atlas = (q: AtlasQuery) => get<AtlasData>(`/api/atlas?${atlasQueryString(q)}`);
export const atlasBrief = (q: AtlasQuery) => get<{ brief: string; source: 'gemini' | 'template' }>(`/api/atlas/brief?${atlasQueryString(q)}`);
export const decisions = (q: AtlasQuery, offset: number, limit = 50) =>
  get<{ total: number; offset: number; rows: DecisionRow[] }>(`/api/atlas/decisions?${atlasQueryString(q)}&offset=${offset}&limit=${limit}`);
export const match = (id: string) => get<MatchRecord>(`/api/matches/${id}`);
export const brief = (session: SessionKind | 'all') => get<{ brief: string; source: 'gemini' | 'template' }>(`/api/studio/brief?session=${session}`);

export interface ExplainAnswer {
  question: string;
  answer: string;
  source: 'gemini' | 'template';
}
/** Ask the server why (engine rule + real GIS facts; Gemini may reword it). */
export async function explain(body: { kind: 'eligibility'; card: string; district: string } | { kind: 'outcome'; code: string; proposalId: string }): Promise<ExplainAnswer> {
  const res = await fetch('/api/explain', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`explain ${res.status}`);
  return (await res.json()) as ExplainAnswer;
}

export interface PlanAtlasData {
  store: 'tiger' | 'memory';
  rulesVersion: string;
  dataVersion: string;
  dataMethod: string;
  sources: DataSource[];
  atlas: PlanAtlas;
  matches: { id: string; roomCode: string; sessionKind: SessionKind; startedAt: string; endedAt: string | null; players: MatchPlayer[]; rounds: number; plan: PlanConfig[] | null }[];
}
export const planAtlas = (session: SessionKind | 'all', bots: boolean) => get<PlanAtlasData>(`/api/atlas/plan?session=${session}${bots ? '&bots=include' : ''}`);
