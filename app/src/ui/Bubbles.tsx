// Decorative rising bubbles (Frutiger Aero). Positions are fixed per mount, not random per render.
import { useMemo } from 'react';
import { rng } from '@shared';

export function Bubbles({ count = 18, seed = 7, className = '' }: { count?: number; seed?: number; className?: string }) {
  const bubbles = useMemo(() => {
    const r = rng(seed);
    return Array.from({ length: count }, () => ({
      left: `${r.next() * 100}%`,
      size: 6 + r.next() * 26,
      duration: 9 + r.next() * 14,
      delay: -r.next() * 20,
      drift: `${(r.next() - 0.5) * 80}px`,
    }));
  }, [count, seed]);
  return (
    <div aria-hidden className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}>
      {bubbles.map((b, k) => (
        <span
          key={k}
          className="bubble"
          style={{ left: b.left, width: b.size, height: b.size, animationDuration: `${b.duration}s`, animationDelay: `${b.delay}s`, ['--drift' as string]: b.drift }}
        />
      ))}
    </div>
  );
}
