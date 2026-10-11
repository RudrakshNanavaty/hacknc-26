// Decorative rising bubbles (Frutiger Aero). Positions are fixed per mount, not random per render.
import { useMemo } from 'react';

/** A small seeded generator, so the same seed gives the same bubbles. */
function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => ((s = (Math.imul(s ^ (s >>> 15), 2246822507) + 0x9e3779b9) >>> 0) / 2 ** 32);
}

export function Bubbles({ count = 18, seed = 7, className = '' }: { count?: number; seed?: number; className?: string }) {
  const bubbles = useMemo(() => {
    const r = rng(seed);
    return Array.from({ length: count }, () => ({
      left: `${r() * 100}%`,
      size: 6 + r() * 26,
      duration: 9 + r() * 14,
      delay: -r() * 20,
      drift: `${(r() - 0.5) * 80}px`,
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
