// The picture window at the top of a card (Pokemon-card layout). Cards that are real cards get a
// small illustration painted by Gemini for this round, requested live from the server; until it
// arrives (or if it never does) the window shows a drawn placeholder in the deck's color. Static
// things (the negotiation moves, Pass) use a flat glyph instead and never ask for a picture.
import { useEffect, useState } from 'react';
import { CARDS, PERSONA_INFO, type CardId } from '@shared';
import { useCrisis } from './story';

const RETRY_MS = [20_000, 50_000];

type Glyph = 'project' | 'support' | 'opposition' | 'negotiation' | 'back' | 'oppose' | 'fund' | 'pass';

const GLYPHS: Record<Glyph, JSX.Element> = {
  project: <><rect x="10" y="26" width="10" height="16" rx="1.5" /><rect x="22" y="14" width="12" height="28" rx="1.5" /><rect x="36" y="22" width="8" height="20" rx="1.5" /><path d="M6 44h40" /></>,
  support: <><circle cx="26" cy="26" r="15" /><path d="M26 35V18M19 25l7-7 7 7" /></>,
  opposition: <><path d="M26 7l15 6v12c0 9-6 15-15 19C17 40 11 34 11 25V13z" /><path d="M19 26h14" /></>,
  negotiation: <><circle cx="19" cy="26" r="11" /><circle cx="33" cy="26" r="11" /></>,
  back: <><path d="M12 24h8v16h-8zM20 26l7-14c3 0 5 2 4 6l-1 6h11c2 0 3 2 3 4l-3 12c-.5 2-2 3-4 3H20" /></>,
  oppose: <><path d="M12 28h8V12h-8zM20 26l7 14c3 0 5-2 4-6l-1-6h11c2 0 3-2 3-4L41 12c-.5-2-2-3-4-3H20" /></>,
  fund: <><ellipse cx="26" cy="15" rx="12" ry="5" /><path d="M14 15v9c0 3 5 5 12 5s12-2 12-5v-9M14 24v9c0 3 5 5 12 5s12-2 12-5v-9" /></>,
  pass: <><path d="M14 27l8 8 16-18" /></>,
};

export function GlyphIcon({ glyph, className = '' }: { glyph: Glyph; className?: string }) {
  return (
    <svg className={`card-glyph ${className}`} viewBox="0 0 52 52" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {GLYPHS[glyph]}
    </svg>
  );
}

/** Where a card's picture comes from this round: its name in the story, the area and the story itself. */
export function useArtUrl(id: CardId): string {
  const crisis = useCrisis();
  const q = new URLSearchParams();
  const skin = crisis?.skins?.[id]?.name;
  if (skin) q.set('skin', skin);
  if (crisis?.spotlight[0]) q.set('place', crisis.spotlight[0]);
  if (crisis?.story?.title) q.set('story', crisis.story.title);
  const s = q.toString();
  return `/api/card-art/${id}${s ? `?${s}` : ''}`;
}

/** The window itself. Fills its parent's width at 4:3 (set `className` to size it). */
export function CardArt({ id, className = '' }: { id: CardId; className?: string }) {
  const c = CARDS[id];
  const base = useArtUrl(id);
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    setState('loading');
    setAttempt(0);
  }, [base]);
  useEffect(() => {
    if (state !== 'failed' || attempt >= RETRY_MS.length) return;
    const t = setTimeout(() => {
      setAttempt((n) => n + 1);
      setState('loading');
    }, RETRY_MS[attempt]);
    return () => clearTimeout(t);
  }, [state, attempt]);
  const src = attempt ? `${base}${base.includes('?') ? '&' : '?'}r=${attempt}` : base;
  return (
    <span className={`card-window is-${state} ${className}`} style={{ ['--c' as string]: PERSONA_INFO[c.persona].color }} data-art={state}>
      <GlyphIcon glyph={c.category} />
      <img
        key={src} src={src} alt="" aria-hidden decoding="async"
        onLoad={() => setState('ready')} onError={() => setState('failed')}
      />
    </span>
  );
}

/** A flat window for things that are not cards (the negotiation moves, Pass). */
export function StaticArt({ glyph, color, className = '' }: { glyph: Glyph; color: string; className?: string }) {
  return (
    <span className={`card-window is-static ${className}`} style={{ ['--c' as string]: color }}>
      <GlyphIcon glyph={glyph} />
    </span>
  );
}
