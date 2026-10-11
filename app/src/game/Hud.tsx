// The top of the screen: round and phase with the clock, the news ticker, and the city indicators.
import { useEffect, useRef, useState } from 'react';
import { INDICATORS, INDICATOR_INFO, VIABILITY_FLOOR, type Indicator, type Indicators, type RoomState } from '@shared';
import { PHASE_LABEL, clock } from './format';
import { playTick } from '../ui/sound';

export function Gauge({ k, value, compact = false }: { k: Indicator; value: number; compact?: boolean }) {
  const info = INDICATOR_INFO[k];
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
      <span className="gauge-value tabular">{k === 'budget' ? `$${value}M` : value}</span>
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
      <IndicatorBar values={state.city.indicators} compact />
    </header>
  );
}
