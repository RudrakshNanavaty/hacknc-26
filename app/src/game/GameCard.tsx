// A glossy Frutiger Aero game card: influence orb, public cost, art, family, name, rule text.
import { CARDS, FAMILY_INFO, PERSONA_INFO, PROJECTS, type CardId } from '@shared';

export function GameCard({
  id, selected = false, disabled = false, compact = false, onClick, onHover, note,
}: { id: CardId; selected?: boolean; disabled?: boolean; compact?: boolean; onClick?: () => void; onHover?: (on: boolean) => void; note?: string | null }) {
  const c = CARDS[id];
  const color = PERSONA_INFO[c.persona].color;
  const fam = FAMILY_INFO[c.family];
  const budget = c.project ? PROJECTS[c.project].budgetCost : 0;
  const body = (
    <>
      <span className="game-card-cost" aria-label={`${c.cost} influence`}>{c.cost}</span>
      {budget > 0 && <span className="game-card-money" title={`Public cost $${budget}M (hypothetical) unless someone covers it`}>${budget}M</span>}
      <span className="game-card-art" style={{ ['--tint' as string]: color }}>
        <span className="game-card-emoji">{c.art}</span>
      </span>
      <span className="game-card-cat" style={{ color: `color-mix(in srgb, ${fam.color} 70%, #063a5b)` }}>{fam.label}</span>
      <span className="game-card-name">{c.name}</span>
      {!compact && <span className="game-card-text">{c.text}</span>}
      {note && <span className="game-card-note">{note}</span>}
    </>
  );
  const cls = `game-card ${compact ? 'game-card-compact' : ''} ${selected ? 'is-selected' : ''} ${disabled ? 'is-disabled' : ''}`;
  if (!onClick) return <div className={cls} style={{ ['--tint' as string]: color }}>{body}</div>;
  return (
    <button
      type="button" className={cls} style={{ ['--tint' as string]: color }} onClick={onClick} aria-pressed={selected} disabled={disabled} title={c.rule}
      onPointerEnter={() => onHover?.(true)} onPointerLeave={() => onHover?.(false)} onFocus={() => onHover?.(true)} onBlur={() => onHover?.(false)}
    >
      {body}
    </button>
  );
}
