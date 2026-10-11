// Cards, Pocket Rivals style: the full character card (big art in a soap bubble, name, chips, four
// stat pills, this match's line in the persona's voice) and the mini card in the deck tray.
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import { CARDS, PERSONA_INFO, PROJECTS, type CardId } from '@shared';
import { Soap } from './ui';

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
    'emergency-funding': [{ label: 'Support', value: '+1' }, { label: 'Pays cost', value: '✓' }, { label: 'Shore', value: '🌿+2' }, { label: 'Else', value: '🌊+2' }],
    'fast-track': [{ label: 'Support', value: '+1' }, { label: 'Ignores', value: '1 opp' }, { label: 'Ties', value: '✓' }, { label: 'VE block', value: '✗', tone: 'neg' }],
    'public-campaign': [{ label: 'Support', value: '+2' }, { label: 'Hotels', value: '✗', tone: 'neg' }, { label: 'Else', value: '🌿+1' }, { label: 'Cost', value: '1' }],
    'environmental-challenge': [{ label: 'Oppose', value: '+2' }, { label: 'VE zone', value: 'Block' }, { label: 'Deal', value: 'Setback' }, { label: 'Public', value: '✗', tone: 'neg' }],
    'private-investment': [{ label: 'Support', value: '+1' }, { label: 'Pays cost', value: '✓' }, { label: 'Hotel', value: '💼+2' }, { label: 'Else', value: '💼+1' }],
    'tourism-campaign': [{ label: 'Support', value: '+1' }, { label: 'Hotel', value: '💼+3' }, { label: 'Else', value: '💼+2' }, { label: 'Nature', value: '−1', tone: 'neg' }],
    'neighborhood-petition': [{ label: 'Oppose', value: '+2' }, { label: 'First', value: '🏨' }, { label: 'Else', value: '🏖️+1' }, { label: 'Cost', value: '1' }],
    'public-access-guarantee': [{ label: 'Deal', value: '✓' }, { label: 'Accept', value: '🏖️+4' }, { label: 'Refuse', value: 'opp +1' }, { label: 'Else', value: '🏖️+2' }],
  };
  return S[id] ?? [];
}

export function CharacterCard({ id, quip, note }: { id: CardId; quip?: string | null; note?: string | null }) {
  const c = CARDS[id];
  const p = PERSONA_INFO[c.persona];
  const cost = c.project ? PROJECTS[c.project].budgetCost : 0;
  return (
    <article className="flex flex-col gap-2" aria-label={`${c.name} card`}>
      <div className="flex items-center justify-between">
        <span className="lchip">{p.emoji} {p.name}</span>
        <span className={`lchip ${CATEGORY_TONE[c.category]}`}>{CATEGORY[c.category]}</span>
      </div>
      <div className="ccard-art wet !aspect-[16/8]">
        <span className="cost-orb" aria-label={`${c.cost} influence`}>{c.cost}</span>
        <Soap size={124} tint={p.color} className="bob">{c.art}</Soap>
        {cost > 0 && <span className="lchip lchip-sun absolute right-3 bottom-3">Public cost ${cost}M</span>}
        {c.project === 'hotel' && <span className="lchip lchip-lime absolute right-3 bottom-3">Privately funded</span>}
      </div>
      <h2 className="glow-title">{c.name}</h2>
      <div className="wet flex flex-col gap-2 p-3">
        <div className="stats4">
          {cardStats(id).map((s) => (
            <span key={s.label} className={`stat ${s.tone ?? ''}`}>{s.label}<b>{s.value}</b></span>
          ))}
        </div>
        {quip && <p className="quip">“{quip}”</p>}
        <p className="text-13 font-semibold opacity-85">{c.rule}</p>
        {note && <p className="text-13 font-black text-[#c0392b]">{note}</p>}
      </div>
    </article>
  );
}

/** A small card for the deck tray, the lobby and the landing page. */
export function GameCard({ id, selected = false, disabled = false, onClick, onPointerDown, style }: {
  id: CardId; selected?: boolean; disabled?: boolean; onClick?: () => void;
  onPointerDown?: (e: ReactPointerEvent<HTMLButtonElement>) => void; style?: CSSProperties; compact?: boolean; note?: string | null;
}) {
  const c = CARDS[id];
  const cls = `mini wet ${selected ? 'is-on' : ''} ${disabled ? 'is-off' : ''}`;
  const body = (
    <>
      <span className="cost-orb">{c.cost}</span>
      <span className="art">{c.art}</span>
      <span className="nm">{c.name}</span>
    </>
  );
  if (!onClick && !onPointerDown) return <div className={`mini-card wet`} style={style} title={c.rule}>{body}</div>;
  return (
    <button type="button" className={cls} style={style} onClick={onClick} onPointerDown={onPointerDown} aria-pressed={selected} aria-disabled={disabled} title={c.rule}>
      {body}
    </button>
  );
}
