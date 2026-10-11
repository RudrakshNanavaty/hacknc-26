// Small display helpers shared by the game screens.
import { INDICATOR_INFO, PERSONA_INFO, plainDelta, type Delta, type Indicator, type PersonaId, type RoomState } from '@shared';

export const personaColor = (p: PersonaId) => PERSONA_INFO[p].color;

export function deltaText(d: Delta): string {
  return (Object.keys(d) as Indicator[])
    .filter((k) => d[k])
    .map((k) => `${d[k]! > 0 ? '+' : '−'}${k === 'budget' ? '$' : ''}${Math.abs(d[k]!)}${k === 'budget' ? 'M' : ''} ${INDICATOR_INFO[k].short.toLowerCase()}`)
    .join(' · ');
}

/** The same, in everyday words: "+6 flood safety · −$8M city money". */
export function plainText(d: Delta): string {
  return (Object.keys(d) as Indicator[]).filter((k) => d[k]).map((k) => plainDelta(k, d[k]!)).join(' · ');
}

export const PHASE_LABEL: Record<RoomState['phase'], string> = {
  lobby: 'Lobby',
  crisis: 'Crisis',
  select: 'Play a card',
  reveal: 'Reveal',
  negotiate: 'Negotiate',
  resolve: 'Resolution',
  final: 'Session over',
};

export const STATUS_STYLE = {
  approved: { label: 'Approved', color: '#2f9a12', bg: 'linear-gradient(180deg,#e2ffc4,#86df45)' },
  blocked: { label: 'Blocked', color: '#b0123a', bg: 'linear-gradient(180deg,#ffd2dc,#ff6b8a)' },
  rejected: { label: 'Rejected', color: '#b04512', bg: 'linear-gradient(180deg,#ffe0cc,#ff9a5c)' },
  delayed: { label: 'Delayed', color: '#8a6a00', bg: 'linear-gradient(180deg,#fff7c2,#ffd23f)' },
  unfunded: { label: 'Unfunded', color: '#6b4fb0', bg: 'linear-gradient(180deg,#ede4ff,#b79cff)' },
} as const;
