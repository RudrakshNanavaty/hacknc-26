// Aero Lagoon building blocks: drifting bubbles, gel tubes, soap bubbles, influence pips.
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { MAX_INFLUENCE } from '@shared';

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => ((s = (Math.imul(s ^ (s >>> 15), 2246822507) + 0x9e3779b9) >>> 0) / 2 ** 32);
}

/** Bubbles drifting up behind the lagoon. Decoration only. */
export function LagoonBubbles({ count = 14, seed = 5 }: { count?: number; seed?: number }) {
  const list = useMemo(() => {
    const r = rng(seed);
    return Array.from({ length: count }, () => ({ left: `${r() * 100}%`, size: 6 + r() * 22, dur: 10 + r() * 14, delay: -r() * 20, drift: `${(r() - 0.5) * 60}px` }));
  }, [count, seed]);
  return (
    <div aria-hidden className="bubbles pointer-events-none overflow-hidden">
      {list.map((b, k) => (
        <span key={k} className="bubble" style={{ left: b.left, width: b.size, height: b.size, animationDuration: `${b.dur}s`, animationDelay: `${b.delay}s`, ['--drift' as string]: b.drift }} />
      ))}
    </div>
  );
}

export type Tone = 'aqua' | 'lime' | 'sun' | 'coral' | 'lilac';

/** A glossy gel tube: a meter with a white "ghost" that shows what was just lost. */
export function Tube({ label, value, max, tone = 'aqua', right, className = '', title }: { label: ReactNode; value: number; max: number; tone?: Tone; right?: ReactNode; className?: string; title?: string }) {
  const pct = Math.max(0, Math.min(100, (value / Math.max(1, max)) * 100));
  const prev = useRef(value);
  const [ghost, setGhost] = useState(pct);
  const [delta, setDelta] = useState<number | null>(null);
  useEffect(() => {
    if (value === prev.current) return;
    setDelta(value - prev.current);
    prev.current = value;
    const g = setTimeout(() => setGhost(pct), 50);
    const d = setTimeout(() => setDelta(null), 2600);
    return () => {
      clearTimeout(g);
      clearTimeout(d);
    };
  }, [value, pct]);
  return (
    <div className={`tube wet ${className}`} title={title}>
      <span className="lbl">{label}</span>
      <span className="tube-bar">
        <i className="ghost" style={{ width: `${Math.max(ghost, pct)}%` }} />
        <i className={`fill-${tone}`} style={{ width: `${pct}%` }} />
      </span>
      {right !== undefined && <span className="tube-val">{right}</span>}
      {delta !== null && <span key={value} className={`tube-delta ${delta > 0 ? 'up' : 'down'}`}>{delta > 0 ? '+' : '−'}{Math.abs(delta)}</span>}
    </div>
  );
}

export function Soap({ children, size = 64, tint, className = '', style }: { children: ReactNode; size?: number; tint?: string; className?: string; style?: CSSProperties }) {
  return (
    <span className={`soap ${className}`} style={{ width: size, height: size, fontSize: size * 0.5, ['--tint' as string]: tint, ...style }}>
      <span>{children}</span>
    </span>
  );
}

export function Pips({ n }: { n: number }) {
  return (
    <span className="pips" aria-label={`${n} influence`}>
      {Array.from({ length: MAX_INFLUENCE }, (_, i) => <i key={i} className={i < n ? 'on' : ''} />)}
    </span>
  );
}

export function RoundDots({ round, total }: { round: number; total: number }) {
  return <span className="dots" aria-hidden>{Array.from({ length: total }, (_, i) => (i < round ? '●' : '○')).join('')}</span>;
}
