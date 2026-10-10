// The sunlit shallows behind every screen: surface light, light rays, a drifting caustic web
// and a few rising bubbles. Pure CSS (kit.css `.ocean`); decorative, so hidden from assistive tech.
// Positions are fixed numbers, not random, so it renders the same every time.
import type { CSSProperties } from 'react';

const BUBBLES: Array<{ x: string; size: string; dur: string; delay: string }> = [
  { x: '8%', size: '18px', dur: '19s', delay: '-3s' },
  { x: '21%', size: '9px', dur: '15s', delay: '-11s' },
  { x: '37%', size: '26px', dur: '24s', delay: '-16s' },
  { x: '58%', size: '12px', dur: '17s', delay: '-6s' },
  { x: '73%', size: '30px', dur: '27s', delay: '-20s' },
  { x: '86%', size: '14px', dur: '18s', delay: '-9s' },
  { x: '94%', size: '8px', dur: '14s', delay: '-1s' },
];

export function Backdrop() {
  return (
    <div className="ocean" aria-hidden="true">
      <div className="ocean__rays" />
      <div className="ocean__caustics" />
      {BUBBLES.map((b, i) => (
        <span
          key={i}
          className="ocean__bubble"
          style={{ '--x': b.x, '--size': b.size, '--dur': b.dur, '--delay': b.delay } as CSSProperties}
        />
      ))}
    </div>
  );
}
