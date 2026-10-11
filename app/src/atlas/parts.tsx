// Small pieces the atlas is made of. A figure never appears without its sample size: a rate is a
// bar with its interval and "n", a heat cell goes grey when too few cases stand behind it.
import { MIN_N, type Insight, type Rate } from '@shared';

export const pct = (r: Rate | number | null) => {
  const p = typeof r === 'number' ? r : r?.p ?? null;
  return p === null ? 'n/a' : `${Math.round(p * 100)}%`;
};

export function Stat({ label, value, note }: { label: string; value: string | number; note?: string }) {
  return (
    <div className="glass flex flex-col p-3">
      <span className="text-13 font-bold opacity-75">{label}</span>
      <span className="tabular font-display text-32 leading-none font-black">{value}</span>
      {note && <span className="mt-1 text-[12px] opacity-70">{note}</span>}
    </div>
  );
}

/** A rate as a bar with its 95% interval as a whisker and its sample size written beside it. */
export function RateBar({ r, tone = '#0a7bb8', label }: { r: Rate; tone?: string; label?: string }) {
  const thin = r.n < MIN_N;
  return (
    <span className="rate-bar" title={r.p === null ? 'No cases' : `${r.k} of ${r.n}${r.lo !== null && r.hi !== null ? ` · 95% interval ${pct(r.lo)} to ${pct(r.hi)}` : ''}${thin ? ' · too few cases to read' : ''}`}>
      <span className="rate-track">
        <span className="rate-fill" style={{ width: `${(r.p ?? 0) * 100}%`, background: thin ? '#9db4c0' : tone }} />
        {r.lo !== null && r.hi !== null && !thin && <span className="rate-whisker" style={{ left: `${r.lo * 100}%`, width: `${(r.hi - r.lo) * 100}%` }} />}
      </span>
      <span className="rate-num tabular">{label ?? pct(r)}</span>
      <span className="rate-n tabular">n={r.n}</span>
    </span>
  );
}

const STRENGTH = {
  strong: { label: 'Strong', hint: 'A significant difference with at least 30 cases on each side.' },
  moderate: { label: 'Moderate', hint: 'A significant difference, on fewer cases.' },
  indicative: { label: 'Indicative', hint: 'A pattern on few cases: worth watching, not yet worth acting on.' },
} as const;

export function Strength({ s }: { s: Insight['strength'] }) {
  return <span className={`strength strength-${s}`} title={STRENGTH[s].hint}>{STRENGTH[s].label}</span>;
}

/** Rate to a colour: coral (rarely passes) through sand to green (usually passes). Grey below MIN_N. */
export function heat(r: Rate): { background: string; color: string } {
  if (r.p === null) return { background: 'rgba(157,180,192,.2)', color: 'var(--l-ink)' };
  const t = r.p;
  const hue = 8 + t * 112; // 8 coral .. 120 green
  // Fewer cases than MIN_N: the direction is still visible, but washed out so it is never read as firm.
  const alpha = r.n < MIN_N ? 0.32 : 1;
  return { background: `hsl(${hue} 70% ${82 - Math.abs(t - 0.5) * 18}% / ${alpha})`, color: '#0b3d5c' };
}

export function HeatCell({ r, show }: { r: Rate | null; show?: string }) {
  if (!r || r.n === 0) return <td className="heat-cell is-empty" aria-label="No cases">·</td>;
  const h = heat(r);
  return (
    <td className="heat-cell" style={h} title={`${r.k} of ${r.n}${r.n < MIN_N ? ' · too few cases to read' : ''}`}>
      <b>{show ?? pct(r)}</b>
      <span>n={r.n}</span>
    </td>
  );
}

/** How much evidence the current view rests on, in words. */
export function evidence(cases: number): { label: string; tone: 'low' | 'mid' | 'good' | 'high'; next: number | null } {
  if (cases < 16) return { label: 'Too few cases to read patterns yet', tone: 'low', next: 16 };
  if (cases < 60) return { label: 'Indicative: patterns are visible, not yet firm', tone: 'mid', next: 60 };
  if (cases < 200) return { label: 'Moderate: comparisons start to hold', tone: 'good', next: 200 };
  return { label: 'Robust: enough cases to compare places and scenarios', tone: 'high', next: null };
}
