// Over the map: the five city meters as gel tubes, the clock as a glossy orb, the stakeholders as
// soap bubbles with their influence pips.
import { useEffect, useRef } from 'react';
import { INDICATORS, INDICATOR_INFO, PACES, PERSONA_INFO, VIABILITY_FLOOR, type Indicator, type RoomState } from '@shared';
import { playTick } from '../ui/sound';
import { Pips, Soap, Tube, type Tone } from './ui';
import { Bill, useTween } from './insights';

/** A meter's number, counting toward its new value. */
function Count({ k, value }: { k: Indicator; value: number }) {
  const shown = useTween(value);
  return <>{k === 'budget' ? `$${shown}M` : shown}</>;
}

const TONE: Record<Indicator, Tone> = { flood: 'aqua', economy: 'sun', environment: 'lime', access: 'coral', budget: 'lilac' };

export function Meters({ state }: { state: RoomState }) {
  const v = state.city.indicators;
  // A budget crunch lands on the Budget meter itself.
  const crunch = state.phase === 'crisis' && state.crisis?.kind === 'budget';
  return (
    <div className="meters">
      {INDICATORS.map((k) => {
        const info = INDICATOR_INFO[k];
        const low = k !== 'budget' && v[k] < VIABILITY_FLOOR;
        return (
          <Tube
            key={k} tone={low ? 'coral' : TONE[k]} value={v[k]} max={k === 'budget' ? 40 : 100}
            className={crunch && k === 'budget' ? 'tube-shake' : ''}
            title={`${info.label}: ${k === 'budget' ? `$${v[k]}M (hypothetical)` : v[k]}${low ? ` (below ${VIABILITY_FLOOR}: the city is at risk)` : ''}`}
            label={<><span>{info.icon}</span><span className="nm">{info.short}</span><span className={`v ${low ? 'text-[#d0103a]' : ''}`}><Count k={k} value={v[k]} /></span></>}
          />
        );
      })}
      <Bill state={state} />
    </div>
  );
}

export function TimerOrb({ state, left }: { state: RoomState; left: number | null }) {
  const last = useRef<number | null>(null);
  const timed = state.phase === 'select' || state.phase === 'negotiate';
  useEffect(() => {
    if (timed && left !== null && left <= 5 && left > 0 && left !== last.current) playTick();
    last.current = left;
  }, [left, timed]);
  const phase = state.phase as keyof (typeof PACES)['standard'];
  const total = state.phase === 'crisis' && !state.crisis ? 10 : PACES[state.pace][phase] ?? 30;
  const frac = left === null ? 0 : Math.min(1, left / total);
  return (
    <div className={`timer-orb ${timed && left !== null && left <= 5 ? 'urgent' : ''}`} aria-label={left === null ? 'No clock' : `${left} seconds left`}>
      <svg viewBox="0 0 40 40" aria-hidden>
        <circle cx="20" cy="20" r="18" fill="none" stroke="rgba(255,255,255,.35)" strokeWidth="3" />
        <circle cx="20" cy="20" r="18" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeDasharray={`${113 * frac} 113`} style={{ transition: 'stroke-dasharray .25s linear' }} />
      </svg>
      {left === null ? '∞' : left}
    </div>
  );
}

export function PlayerBubbles({ state }: { state: RoomState }) {
  const waiting = state.phase === 'select' || state.phase === 'negotiate' || state.phase === 'final';
  return (
    <div className="player-bubbles">
      {state.players.map((p) => {
        const info = PERSONA_INFO[p.persona];
        return (
          <div key={p.seat} className={`pb wet ${p.seat === state.you ? 'is-you' : ''}`} data-seat={p.seat} style={{ opacity: p.connected ? 1 : 0.5 }}>
            <Soap size={44} tint={info.color}>{info.emoji}</Soap>
            <span className="who min-w-0">
              <span className="vr block truncate text-15 leading-tight">{p.name}{p.seat === state.hostSeat ? ' ⭐' : ''}</span>
              <span className="block text-[11px] leading-tight opacity-75">{info.name}</span>
              <Pips n={p.influence} />
            </span>
            {waiting && <span className={`ready-tick ${p.ready ? 'on' : ''}`}>{p.ready ? '✓' : '…'}</span>}
          </div>
        );
      })}
    </div>
  );
}
