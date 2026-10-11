// Iridescent soap bubbles rising through the water, in three depth layers. Each bubble is a sprite cut
// from the supplied bubbles.png (app/public/bubbles/, see docs/assets.md), so it keeps the artwork's
// rainbow film and highlights. All motion is CSS (transform and opacity only, on the compositor): the
// outer element rises, the next sways side to side, the innermost wobbles (a little turn and squash),
// each on its own period, so no two bubbles move alike and nothing re-renders per frame. Properties are
// seeded, so a mount is the same film every time; negative delays spread the bubbles over the screen at
// once. Paused while the tab is hidden; still (and fewer) with prefers-reduced-motion.
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';

type Layer = 'back' | 'mid' | 'front';

/** The sprites, largest first (from the extraction): 0-6 large, 7-11 medium, 12-20 small. */
const LARGE = [0, 1, 2, 3, 4, 5, 6];
const MEDIUM = [7, 8, 9, 10, 11, 0, 4, 6];
const SMALL = [12, 13, 14, 15, 16, 17, 18, 19, 20, 7, 9];
const src = (i: number) => `/bubbles/bubble-${String(i).padStart(2, '0')}.webp`;

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => ((s = (Math.imul(s ^ (s >>> 15), 2246822507) + 0x9e3779b9) >>> 0) / 2 ** 32);
}

interface Spec {
  layer: Layer;
  sprite: number;
  /** Horizontal position, % of the width (front bubbles sit at the edges, partly off screen). */
  x: number;
  size: number;
  opacity: number;
  rise: number;
  delay: number;
  sway: number;
  swayAmp: number;
  wobble: number;
  turn: number;
  squash: number;
  /** Where it rests with reduced motion (% of the height). */
  y: number;
  /** Shown only when there is room (desktop); hidden in the reduced-motion still. */
  extra: boolean;
}

const COUNTS = { desktop: { back: 10, mid: 9, front: 4 }, mobile: { back: 6, mid: 5, front: 2 } } as const;

/** A side-weighted x: the middle of the screen (where the interface is) gets fewer bubbles. */
function sideX(r: () => number, clear: number) {
  if (r() < clear) return r() < 0.5 ? r() * 28 : 72 + r() * 28;
  return r() * 100;
}

function build(seed: number, mobile: boolean): Spec[] {
  const r = rng(seed);
  const n = mobile ? COUNTS.mobile : COUNTS.desktop;
  const pick = (list: number[]) => list[Math.floor(r() * list.length)]!;
  const out: Spec[] = [];
  const add = (layer: Layer, i: number) => {
    const base = { layer, delay: 0, y: 6 + r() * 80, turn: 4 + r() * 10, squash: 1.02 + r() * 0.05, extra: false };
    if (layer === 'back') {
      out.push({ ...base, sprite: pick(SMALL), x: r() * 100, size: (mobile ? 6 : 7) + r() * 10, opacity: 0.22 + r() * 0.14, rise: 30 + r() * 18, sway: 8 + r() * 5, swayAmp: 6 + r() * 10, wobble: 5 + r() * 3, extra: i >= 4 });
    } else if (layer === 'mid') {
      out.push({ ...base, sprite: pick(MEDIUM), x: sideX(r, 0.75), size: (mobile ? 16 : 20) + r() * (mobile ? 14 : 22), opacity: 0.42 + r() * 0.16, rise: 22 + r() * 12, sway: 9 + r() * 5, swayAmp: 10 + r() * 16, wobble: 6 + r() * 3, extra: i >= 4 });
    } else {
      // Front: the largest, still small (no oversized bubbles), slow, at the left and right edges.
      const left = i % 2 === 0;
      out.push({ ...base, sprite: LARGE[i % LARGE.length]!, x: left ? 1 + r() * 9 : 90 + r() * 8, size: (mobile ? 34 : 48) + r() * (mobile ? 16 : 30), opacity: 0.55 + r() * 0.13, rise: 34 + r() * 14, sway: 11 + r() * 6, swayAmp: 8 + r() * 12, wobble: 7 + r() * 3, turn: 3 + r() * 4, extra: i >= 2 });
    }
    // Spread over the whole loop at once: start somewhere along the way up, never at the bottom together.
    out[out.length - 1]!.delay = -(((i + r()) / (layer === 'back' ? n.back : layer === 'mid' ? n.mid : n.front)) * out[out.length - 1]!.rise);
  };
  for (let i = 0; i < n.back; i++) add('back', i);
  for (let i = 0; i < n.mid; i++) add('mid', i);
  for (let i = 0; i < n.front; i++) add('front', i);
  return out;
}

const MOBILE = '(max-width: 640px)';
const media = (q: string) => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(q) : null);

export function FloatingBubbles({ seed = 11, className = '' }: { seed?: number; className?: string }) {
  const [mobile, setMobile] = useState(() => !!media(MOBILE)?.matches);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const mq = media(MOBILE);
    if (!mq) return;
    const on = () => setMobile(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  // Nothing moves while the tab is hidden (no work for a page nobody sees).
  useEffect(() => {
    const on = () => {
      if (root.current) root.current.dataset.paused = String(document.hidden);
    };
    on();
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, []);
  const specs = useMemo(() => build(seed, mobile), [seed, mobile]);
  return (
    <div ref={root} className={`fb-root ${className}`} aria-hidden>
      {(['back', 'mid', 'front'] as const).map((layer) => (
        <div key={layer} className={`fb-layer fb-${layer}`}>
          {specs.filter((b) => b.layer === layer).map((b, i) => (
            <span
              key={i}
              className="fb"
              data-extra={b.extra || undefined}
              style={{
                left: `${b.x}%`, width: b.size, height: b.size,
                ['--s' as string]: `${b.size}px`, ['--o' as string]: b.opacity, ['--rise' as string]: `${b.rise}s`, ['--delay' as string]: `${b.delay}s`,
                ['--sway' as string]: `${b.sway}s`, ['--amp' as string]: `${b.swayAmp}px`, ['--wob' as string]: `${b.wobble}s`,
                ['--turn' as string]: `${b.turn}deg`, ['--sq' as string]: b.squash, ['--y' as string]: `${b.y}%`,
              } as CSSProperties}
            >
              <span className="fb-sway">
                <img className="fb-img" src={src(b.sprite)} alt="" draggable={false} decoding="async" />
              </span>
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

/** The shared pre-game scene: landing, onboarding, loading, and lobby use the same still seascape and bubbles. */
export function Seascape({ seed }: { seed?: number }) {
  return (
    <>
      <div className="seascape-layer seascape-bg" aria-hidden />
      <div className="seascape-layer seascape-veil" aria-hidden />
      <FloatingBubbles seed={seed} className="seascape-layer" />
    </>
  );
}
