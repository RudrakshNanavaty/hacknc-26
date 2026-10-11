// The top of the screen: round and phase with the clock, the news ticker, and the city indicators.
import { useEffect, useRef, useState } from 'react';
import { INDICATORS, INDICATOR_INFO, VIABILITY_FLOOR, upcomingCosts, type Indicator, type Indicators, type RoomState } from '@shared';
import { PHASE_LABEL, clock } from './format';
import { playTick } from '../ui/sound';

/** Count toward the new value (bounded: one short animation per change; none with reduced motion). */
function useTween(value: number, ms = 900) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setShown(value);
      from.current = value;
      return;
    }
    const start = from.current;
    const t0 = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / ms);
      const v = Math.round(start + (value - start) * (1 - (1 - k) ** 3));
      setShown(v);
      from.current = v;
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, ms]);
  return shown;
}

export function Gauge({ k, value, compact = false }: { k: Indicator; value: number; compact?: boolean }) {
  const info = INDICATOR_INFO[k];
  const shown = useTween(value);
  const prev = useRef(value);
  const [flash, setFlash] = useState<number | null>(null);
  useEffect(() => {
    if (value !== prev.current) {
      setFlash(value - prev.current);
      prev.current = value;
      const t = setTimeout(() => setFlash(null), 2600);
      return () => clearTimeout(t);
    }
  }, [value]);
  const pct = k === 'budget' ? Math.min(100, (value / 40) * 100) : value;
  const low = k !== 'budget' && value < VIABILITY_FLOOR;
  return (
    <div className={`gauge ${low ? 'is-low' : ''}`} title={`${info.label}: ${k === 'budget' ? `$${value}M` : value}${low ? ` (below ${VIABILITY_FLOOR}: the city is at risk)` : ''}`}>
      <span className="gauge-icon" aria-hidden>{info.icon}</span>
      {!compact && <span className="gauge-label">{info.short}</span>}
      <span className="gauge-bar"><span className={`gauge-fill gauge-${k}`} style={{ width: `${pct}%` }} /></span>
      <span className="gauge-value tabular">{k === 'budget' ? `$${shown}M` : shown}</span>
      {flash !== null && (
        <span key={value} className={`gauge-delta ${flash > 0 ? 'up' : 'down'}`}>
          {flash > 0 ? '+' : '−'}{Math.abs(flash)}
        </span>
      )}
    </div>
  );
}

export function IndicatorBar({ values, compact = false }: { values: Indicators; compact?: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {INDICATORS.map((k) => <Gauge key={k} k={k} value={values[k]} compact={compact} />)}
    </div>
  );
}

/** What the city already owes at the next resolution (upkeep, delayed consequences). */
function Upcoming({ state }: { state: RoomState }) {
  if (state.phase === 'resolve' || state.phase === 'final' || state.phase === 'lobby') return null;
  const up = upcomingCosts(state.city);
  const parts = [...(up.upkeep ? [`−$${up.upkeep}M upkeep`] : []), ...up.pending.map((p) => p.text.replace(/\.$/, ''))];
  if (!parts.length) return null;
  return <p className="upcoming-chip" title="Charged when this round resolves (hypothetical, illustrative)">⏳ This round's bill: {parts.join(' · ')}</p>;
}

export function Hud({ state, left, onSkip, host }: { state: RoomState; left: number | null; onSkip: () => void; host: boolean }) {
  const lastTick = useRef<number | null>(null);
  useEffect(() => {
    if (left !== null && left <= 5 && left > 0 && left !== lastTick.current && (state.phase === 'select' || state.phase === 'negotiate')) playTick();
    lastTick.current = left;
  }, [left, state.phase]);
  const urgent = left !== null && left <= 5 && (state.phase === 'select' || state.phase === 'negotiate');
  return (
    <header className="hud glass">
      <div className="flex items-center gap-3">
        <div className="round-orb orb" aria-label={`Round ${state.round} of ${state.totalRounds}`}>
          <span className="text-[11px] font-bold leading-none opacity-80">ROUND</span>
          <span className="font-display text-24 leading-none font-black">{state.round || '–'}<span className="text-13 opacity-70">/{state.totalRounds}</span></span>
        </div>
        <div className="min-w-0">
          <p className="font-display text-18 leading-tight font-black">{PHASE_LABEL[state.phase]}</p>
          {left !== null && <p className={`tabular text-15 font-bold ${urgent ? 'text-coral animate-pulse' : 'text-aqua-deep'}`}>{clock(left)}</p>}
        </div>
        {host && state.endsAt !== null && (
          <button type="button" className="aero-btn ml-1 !px-3 !py-1 text-13" onClick={onSkip} title="Host: end this phase now">
            Skip ⏭
          </button>
        )}
      </div>
      {state.headline && (
        <div className="ticker" aria-live="polite">
          <span className="ticker-tag">{state.headline.source === 'gemini' ? 'LIVE' : 'NEWS'}</span>
          <p key={state.headline.key + state.headline.source} className="ticker-text">{state.headline.text}</p>
        </div>
      )}
      <div className="flex flex-col items-end gap-1">
        <IndicatorBar values={state.city.indicators} compact />
        <Upcoming state={state} />
      </div>
    </header>
  );
}
