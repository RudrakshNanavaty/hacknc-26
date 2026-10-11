// Cards, Pocket Rivals style: the full character card and the mini card in the deck tray. Everything the card
// says comes from cardFacts() in shared/ (the authored rules): influence, whose money and how much, upkeep, effects,
// where it may go, the money deal it offers, what answers it and its combos. Nothing on a card is typed by hand here.
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import { CARDS, FAMILY_INFO, PERSONA_INFO, cardFacts, type CardId } from '@shared';
import { Soap } from './ui';

const CATEGORY = { project: 'Project', support: 'Support', opposition: 'Opposition', negotiation: 'Deal' } as const;
const CATEGORY_TONE = { project: 'lchip-lime', support: 'lchip-aqua', opposition: 'lchip-coral', negotiation: 'lchip-sun' } as const;

export function CharacterCard({ id, quip, note }: { id: CardId; quip?: string | null; note?: string | null }) {
  const c = CARDS[id];
  const p = PERSONA_INFO[c.persona];
  const f = cardFacts(id);
  return (
    <article className="flex flex-col gap-2" aria-label={`${c.name} card`}>
      <div className="flex items-center justify-between gap-1">
        <span className="lchip">{p.emoji} {p.name}</span>
        <span className="flex gap-1">
          <span className="lchip" style={{ color: `color-mix(in srgb, ${FAMILY_INFO[c.family].color} 60%, #0b3d5c)` }}>{FAMILY_INFO[c.family].label}</span>
          <span className={`lchip ${CATEGORY_TONE[c.category]}`}>{CATEGORY[c.category]}</span>
        </span>
      </div>
      <div className="ccard-art wet !aspect-[16/7]" style={{ ['--tint' as string]: p.color }}>
        <span className="cost-orb" aria-label={`${c.cost} influence`}>{c.cost}</span>
        <Soap size={112} tint={p.color} className="bob">{c.art}</Soap>
      </div>
      <h2 className="glow-title">{c.name}</h2>
      <div className="wet card-face flex flex-col gap-2 p-3">
        {/* What it costs: influence always; money only from the wallet the rules name. */}
        <div className="card-cost">
          <span className="cost-pill infl" title="Influence: political capital to play the card">⚡ {f.influence} influence</span>
          {f.money && <span className={`cost-pill ${f.money.kind}`} title="Simulated money, paid only if it happens">{f.money.kind === 'public' ? '🏛️' : '💼'} ${f.money.amountM}M · {f.money.payerName}</span>}
          {f.upkeepM > 0 && <span className="cost-pill upkeep" title="Charged every later round once built">🔧 ${f.upkeepM}M/round</span>}
        </div>
        <div className="stats4">
          {f.effects.map((s) => (
            <span key={s.label} className={`stat ${s.tone === 'down' ? 'neg' : s.tone === 'deal' ? 'deal' : ''}`}>{s.label}<b>{s.value}</b></span>
          ))}
        </div>
        <p className="card-line">📍 <b>Needs</b> {f.requirement}</p>
        {f.deal && (
          <div className="card-deal">
            <p className="vr text-13">🤝 {f.deal.name} <span className="lchip lchip-sun !py-0 text-[10px]">{f.deal.payerName} pays</span></p>
            <p className="text-12 font-semibold">{f.deal.text}</p>
            <p className="text-12 font-semibold opacity-80">{f.deal.strings}</p>
          </div>
        )}
        <p className="card-line">⚖️ <b>Trade-off</b> {f.tradeoff}</p>
        {f.later && <p className="warn-line">⏳ Next round: {f.later}</p>}
        {(f.counters.length > 0 || f.combos.length > 0) && (
          <div className="flex flex-wrap items-center gap-1">
            {f.counters.length > 0 && <span className="text-[11px] font-black uppercase opacity-70">Answered by</span>}
            {f.counters.map((x) => <span key={x.id} className="chip-mini">{x.art} {x.name}</span>)}
            {f.combos.length > 0 && <span className="text-[11px] font-black uppercase opacity-70">Combos</span>}
            {f.combos.map((x) => <span key={x.id} className="chip-mini combo">✨ {x.name}</span>)}
          </div>
        )}
        {quip && <p className="quip">“{quip}”</p>}
        <details className="text-12">
          <summary className="cursor-pointer font-black opacity-75">The exact rule</summary>
          <p className="mt-1 font-semibold opacity-85">{c.rule}</p>
        </details>
        {note && <p className="text-13 font-black text-[#c0392b]">{note}</p>}
        <p className="text-[10px] font-bold opacity-60">Effects are illustrative; money is simulated.</p>
      </div>
    </article>
  );
}

/** A small card for the deck tray, the lobby and the landing page. */
export function GameCard({ id, selected = false, disabled = false, onClick, onPointerDown, onHover, style }: {
  id: CardId; selected?: boolean; disabled?: boolean; onClick?: () => void;
  onPointerDown?: (e: ReactPointerEvent<HTMLButtonElement>) => void;
  /** Pointer or focus on the card: the map lights up where it may go. */
  onHover?: (on: boolean) => void;
  style?: CSSProperties; compact?: boolean; note?: string | null;
}) {
  const c = CARDS[id];
  const cls = `mini wet cat-${c.category} ${selected ? 'is-on' : ''} ${disabled ? 'is-off' : ''}`;
  const money = cardFacts(id).money;
  const body = (
    <>
      <span className="cost-orb">{c.cost}</span>
      <span className="art">{c.art}</span>
      <span className="nm">{c.name}</span>
      {money && <span className={`mini-money ${money.kind}`} title={`${money.payerName} pays $${money.amountM}M if it happens (simulated)`}>${money.amountM}M</span>}
      {c.agreement && <span className="mini-deal" title="Puts a money deal on the table">🤝</span>}
    </>
  );
  if (!onClick && !onPointerDown) return <div className={`mini-card wet`} style={style} title={c.rule}>{body}</div>;
  return (
    <button
      type="button" className={cls} style={style} onClick={onClick} onPointerDown={onPointerDown} aria-pressed={selected} aria-disabled={disabled} title={c.rule}
      onPointerEnter={() => onHover?.(true)} onPointerLeave={() => onHover?.(false)} onFocus={() => onHover?.(true)} onBlur={() => onHover?.(false)}
    >
      {body}
    </button>
  );
}
