// Calls to the server. Everything here fails soft: the caller gets null and the page says so.
import type { DataSource, MatchPlayer, MatchRecord, SessionKind, StudioSummary } from '@shared';

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
