// A glossy Frutiger Aero game card: cost orb, art, name, rule text.
import { CARDS, PERSONA_INFO, type CardId } from '@shared';

const CATEGORY = { project: 'Project', support: 'Support', opposition: 'Opposition', negotiation: 'Negotiation' } as const;

export function GameCard({
  id, selected = false, disabled = false, compact = false, onClick, note,
}: { id: CardId; selected?: boolean; disabled?: boolean; compact?: boolean; onClick?: () => void; note?: string | null }) {
  const c = CARDS[id];
  const color = PERSONA_INFO[c.persona].color;
  const body = (
    <>
      <span className="game-card-cost" aria-label={`${c.cost} influence`}>{c.cost}</span>
      <span className="game-card-art" style={{ ['--tint' as string]: color }}>
        <span className="game-card-emoji">{c.art}</span>
      </span>
      <span className="game-card-cat">{CATEGORY[c.category]}</span>
      <span className="game-card-name">{c.name}</span>
      {!compact && <span className="game-card-text">{c.text}</span>}
      {note && <span className="game-card-note">{note}</span>}
    </>
  );
  const cls = `game-card ${compact ? 'game-card-compact' : ''} ${selected ? 'is-selected' : ''} ${disabled ? 'is-disabled' : ''}`;
  if (!onClick) return <div className={cls} style={{ ['--tint' as string]: color }}>{body}</div>;
  return (
    <button type="button" className={cls} style={{ ['--tint' as string]: color }} onClick={onClick} aria-pressed={selected} disabled={disabled} title={c.rule}>
      {body}
    </button>
  );
}
