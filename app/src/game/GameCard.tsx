// Cards, Pokemon-card layout: a name and cost across the top, a picture window painted for this round,
// then the type, four stat pills and this match's line in the persona's voice. Everything under the
// picture is static; only the picture is generated (CardArt).
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import { CARDS, FAMILY_INFO, INDICATOR_INFO, PERSONA_INFO, PROJECTS, type CardId, type Delta, type Indicator } from '@shared';
import { CardArt } from './CardArt';
import { useCard } from './story';

const CATEGORY = { project: 'Project', support: 'Support', opposition: 'Opposition', negotiation: 'Deal' } as const;
const CATEGORY_TONE = { project: 'lchip-lime', support: 'lchip-aqua', opposition: 'lchip-coral', negotiation: 'lchip-sun' } as const;

interface Stat {
  label: string;
  value: string;
  tone?: 'neg' | 'zero';
}

const sign = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0');
const fromDelta = (label: string, n: number | undefined): Stat => ({ label, value: sign(n ?? 0), tone: !n ? 'zero' : n < 0 ? 'neg' : undefined });

/** The four stat pills: what the card does, from the authored rules. */
export function cardStats(id: CardId): Stat[] {
  const c = CARDS[id];
  if (c.project) {
    const d = PROJECTS[c.project].delta;
    return [fromDelta('Flood', d.flood), fromDelta('Nature', d.environment), fromDelta('Econ', d.economy), fromDelta('Access', d.access)];
  }
  const S: Partial<Record<CardId, Stat[]>> = {
    'emergency-funding': [{ label: 'Support', value: '+1' }, { label: 'Pays cost', value: '✓' }, { label: 'Shore', value: 'Nature +2' }, { label: 'Else', value: 'Flood +2' }],
    'fast-track': [{ label: 'Support', value: '+1' }, { label: 'Ignores', value: '1 opp' }, { label: 'Ties', value: '✓' }, { label: 'VE block', value: '✗', tone: 'neg' }],
    'public-campaign': [{ label: 'Support', value: '+2' }, { label: 'Hotels', value: '✗', tone: 'neg' }, { label: 'Else', value: 'Nature +1' }, { label: 'Cost', value: '1' }],
    'environmental-challenge': [{ label: 'Oppose', value: '+2' }, { label: 'VE zone', value: 'Block' }, { label: 'Deal', value: 'Setback' }, { label: 'Public', value: '✗', tone: 'neg' }],
    'private-investment': [{ label: 'Support', value: '+1' }, { label: 'Pays cost', value: '✓' }, { label: 'Hotel', value: 'Econ +2' }, { label: 'Else', value: 'Econ +1' }],
    'tourism-campaign': [{ label: 'Support', value: '+1' }, { label: 'Hotel', value: 'Econ +3' }, { label: 'Else', value: 'Econ +2' }, { label: 'Nature', value: '−1', tone: 'neg' }],
    'neighborhood-petition': [{ label: 'Oppose', value: '+2' }, { label: 'First', value: 'Hotels' }, { label: 'Else', value: 'Access +1' }, { label: 'Cost', value: '1' }],
    'public-access-guarantee': [{ label: 'Deal', value: '✓' }, { label: 'Accept', value: 'Access +4' }, { label: 'Refuse', value: 'opp +1' }, { label: 'Else', value: 'Access +2' }],
  };
  return S[id] ?? derivedStats(id);
}

const ICON = (k: Indicator) => `${INDICATOR_INFO[k].short} `;
/** The biggest effect in a delta, as "icon±n" (budget as $M). */
const lead = (d: Delta): string => {
  const [k, v] = (Object.entries(d) as [Indicator, number][]).filter(([, n]) => n).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))[0] ?? [];
  if (!k || !v) return '0';
  return k === 'budget' ? `${v > 0 ? '+' : '−'}$${Math.abs(v)}M` : `${ICON(k)}${v > 0 ? '+' : '−'}${Math.abs(v)}`;
};

/** Stat pills for cards described by data (attach / offer / delayed / fallback) rather than a special rule. */
function derivedStats(id: CardId): Stat[] {
  const c = CARDS[id];
  const out: Stat[] = [];
  if (c.offer) {
    out.push({ label: 'Deal', value: '✓' }, { label: 'Accept', value: lead(c.offer.accepted.ifBuilt) }, { label: 'Refuse', value: `opp +${c.offer.refused.opposition}`, tone: 'neg' });
  }
  if (c.attach?.support) out.push({ label: 'Support', value: `+${c.attach.support}` });
  if (c.attach?.opposition) out.push({ label: 'Oppose', value: `+${c.attach.opposition}` });
  if (c.attach?.cover) out.push({ label: 'Pays cost', value: '✓' });
  if (c.attach?.ifBuilt) out.push({ label: 'If built', value: lead(c.attach.ifBuilt) });
  if (c.delayed) out.push({ label: 'Next round', value: lead(c.delayed.delta), tone: 'neg' });
  if (c.fallback && Object.keys(c.fallback.delta).length) out.push({ label: 'Else', value: lead(c.fallback.delta) });
  return out.slice(0, 4);
}

export function CharacterCard({ id, quip, note, compact = false }: {
  id: CardId; quip?: string | null; note?: string | null;
  /** Inside a map popover: a shorter picture window. */
  compact?: boolean;
}) {
  const c = CARDS[id];
  const story = useCard(id);
  const line = story.line ?? quip;
  const p = PERSONA_INFO[c.persona];
  const cost = c.project ? PROJECTS[c.project].budgetCost : 0;
  return (
    <article className="tcf" style={{ ['--c' as string]: p.color }} aria-label={`${story.name} card`}>
      <header className="tcf-head">
        <h2 className="tcf-name">{story.name}</h2>
        <span className="tc-cost" aria-label={`${c.cost} influence`}>{c.cost}</span>
      </header>
      {story.skinned && <p className="tcf-plays">Plays as {c.name}</p>}
      <CardArt id={id} className={`tcf-art ${compact ? 'is-wide' : ''}`} />
      <div className="tcf-tags">
        <span className="lchip">{p.name}</span>
        <span className="lchip" style={{ color: `color-mix(in srgb, ${FAMILY_INFO[c.family].color} 60%, #0b3d5c)` }}>{FAMILY_INFO[c.family].label}</span>
        <span className={`lchip ${CATEGORY_TONE[c.category]}`}>{CATEGORY[c.category]}</span>
        {cost > 0 && <span className="lchip lchip-sun">Public cost ${cost}M{c.project && PROJECTS[c.project].upkeep ? ` + $${PROJECTS[c.project].upkeep}M/round` : ''}</span>}
        {c.project && cost === 0 && <span className="lchip lchip-lime">Privately funded</span>}
      </div>
      <div className="stats4">
        {cardStats(id).map((s) => (
          <span key={s.label} className={`stat ${s.tone ?? ''}`}>{s.label}<b>{s.value}</b></span>
        ))}
      </div>
      {line && <p className="quip">“{line}”</p>}
      <p className="text-13 font-semibold opacity-85">{c.rule}</p>
      {note && <p className="text-13 font-black text-[#c0392b]">{note}</p>}
    </article>
  );
}

/** A small card (lobby, landing, a card in flight): picture on top, name and type below. */
export function GameCard({ id, selected = false, disabled = false, onClick, onPointerDown, onHover, style, size = 'md', compact = false }: {
  id: CardId; selected?: boolean; disabled?: boolean; onClick?: () => void;
  onPointerDown?: (e: ReactPointerEvent<HTMLButtonElement>) => void;
  /** Pointer or focus on the card: the map lights up where it may go. */
  onHover?: (on: boolean) => void;
  style?: CSSProperties; size?: 'sm' | 'md' | 'lg'; compact?: boolean; note?: string | null;
}) {
  const c = CARDS[id];
  const story = useCard(id);
  const cls = `tc tc-${compact ? 'sm' : size} ${selected ? 'is-on' : ''} ${disabled ? 'is-off' : ''}`;
  const css = { ['--c' as string]: PERSONA_INFO[c.persona].color, ...style } as CSSProperties;
  const body = (
    <>
      <span className="tc-cost" aria-label={`${c.cost} influence`}>{c.cost}</span>
      <CardArt id={id} />
      <span className="tc-name">{story.name}</span>
      <span className="tc-type">{CATEGORY[c.category]}</span>
    </>
  );
  if (!onClick && !onPointerDown) return <div className={cls} style={css} title={c.rule}>{body}</div>;
  return (
    <button
      type="button" className={cls} style={css} onClick={onClick} onPointerDown={onPointerDown} aria-pressed={selected} aria-disabled={disabled} title={c.rule}
      onPointerEnter={() => onHover?.(true)} onPointerLeave={() => onHover?.(false)} onFocus={() => onHover?.(true)} onBlur={() => onHover?.(false)}
    >
      {body}
    </button>
  );
}
