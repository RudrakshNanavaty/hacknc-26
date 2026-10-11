// Small display helpers shared by the game screens.
import { INDICATOR_INFO, PERSONA_INFO, type Delta, type Indicator, type PersonaId, type RoomState } from '@shared';
import { useEffect, useState } from 'react';

export const clock = (s: number | null) => (s === null ? '' : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`);

/** Seconds left on the server's clock, ticking locally. */
export function useCountdown(state: RoomState | null, offset: number) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);
  if (!state?.endsAt) return null;
  return Math.max(0, Math.ceil((state.endsAt - (now + offset)) / 1000));
}

export const personaColor = (p: PersonaId) => PERSONA_INFO[p].color;

export function deltaText(d: Delta): string {
  return (Object.keys(d) as Indicator[])
    .filter((k) => d[k])
    .map((k) => `${d[k]! > 0 ? '+' : '−'}${k === 'budget' ? '$' : ''}${Math.abs(d[k]!)}${k === 'budget' ? 'M' : ''} ${INDICATOR_INFO[k].short.toLowerCase()}`)
    .join(' · ');
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
  rejected: { label: 'Voted down', color: '#b04512', bg: 'linear-gradient(180deg,#ffe0cc,#ff9a5c)' },
  delayed: { label: 'Delayed', color: '#8a6a00', bg: 'linear-gradient(180deg,#fff7c2,#ffd23f)' },
  unfunded: { label: 'Unfunded', color: '#6b4fb0', bg: 'linear-gradient(180deg,#ede4ff,#b79cff)' },
} as const;
