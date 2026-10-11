// Your hand, fanned along the bottom of the map while you choose (step 1, Play a Card): the four cards
// this crisis dealt you. Each face shows only the picture, the name, its main benefit and its cost;
// the downside and the money appear on the card you pick up. Pick one to light the areas it may go to
// (the rest dim), then click a green area to confirm it there. The rules are the engine's (blocker);
// this only draws them. Outside selection the hand tucks below the edge (the deal is on the case file).
import { useEffect, type CSSProperties } from 'react';
import { CARDS, DISTRICT_IDS, PERSONA_INFO, cardName, dealtHand, districtById, simpleCard, type CardId, type RoomState } from '@shared';
import type { Room } from '../room/useRoom';
import { blocker } from './DistrictPopover';
import { CardArt } from './CardArt';

const CATEGORY = { project: 'Build', support: 'Help', opposition: 'Block', negotiation: 'Deal' } as const;

export function HandDeck({ state, armed, setArmed, onHoverCard, tucked = false }: {
  state: RoomState;
  room: Room;
  armed: CardId | null;
  setArmed: (card: CardId | null) => void;
  /** Pointer or focus on a card: the map lights up where it may go. */
  onHoverCard: (card: CardId | null) => void;
  /** Confirming a card on the map: the hand steps aside (Change card brings it back). */
  tucked?: boolean;
}) {
  const me = state.players.find((p) => p.seat === state.you) ?? null;
  const locked = state.mine?.selection ?? null;
  const open = state.phase === 'select' && !!me && !tucked;

  useEffect(() => {
    if (!armed) return;
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setArmed(null);
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [armed, setArmed]);

  if (!me) return null;
  const hand = dealtHand(me.persona, state.round, state.crisis);
  const n = hand.length;
  const sealed = !!locked;

  return (
    <div className="deck deck-block" data-open={open} data-mode="select" role="group" aria-label="Your hand" aria-hidden={!open}>
      <p className="deck-label lchip" title="Influence pays for cards and moves; you get more each round"><span className="cost-dot">{me.influence}</span> influence left</p>
      {hand.map((id, i) => {
        const c = CARDS[id];
        const s = simpleCard(id);
        const areas = DISTRICT_IDS.filter((d) => !blocker(id, d, me.influence));
        const why = c.cost > me.influence ? `Needs ${c.cost} influence` : areas.length === 0 ? 'No legal area now' : null;
        const isArmed = armed === id;
        const isLocked = locked?.card === id;
        const off = !!why || sealed;
        const spread = i - (n - 1) / 2;
        const style = { ['--i']: i, ['--rot']: `${spread * 6.5}deg`, ['--dy']: `${spread * spread * 3}px`, ['--c']: PERSONA_INFO[c.persona].color } as CSSProperties;
        return (
          <button
            key={`${state.round}-${id}`} type="button"
            className={`hcard tone-${c.category} ${isArmed ? 'is-armed' : ''} ${isLocked ? 'is-locked' : ''} ${off && !isLocked ? 'is-off' : ''}`}
            style={style} tabIndex={open ? 0 : -1} aria-disabled={off} aria-pressed={isArmed}
            onClick={() => !off && setArmed(isArmed ? null : id)}
            onPointerEnter={() => !off && onHoverCard(id)} onPointerLeave={() => onHoverCard(null)}
            onFocus={() => !off && onHoverCard(id)} onBlur={() => onHoverCard(null)}
          >
            <span className="hc-top">
              <span className="hc-cost" aria-label={`${c.cost} influence`} title="Influence to play it">{c.cost}</span>
              <span className="hc-tag">{CATEGORY[c.category]}</span>
            </span>
            <CardArt id={id} className={`hc-art ${isArmed ? 'is-short' : ''}`} />
            <span className="hc-name vr">{cardName(id, state.crisis)}</span>
            <span className="hc-facts">
              <span className="hc-good" title={s.good.join(' · ')}>✅ {s.good[0]}</span>
              {isArmed && <span className="hc-bad" title={s.bad.join(' · ')}>⚠️ {s.bad.join(' · ')}</span>}
              {isArmed && s.money && <span className="hc-money">💲 {s.money}</span>}
            </span>
            {why
              ? <span className="hc-foot is-why" title={why}>{why}</span>
              : isLocked ? <span className="hc-foot is-locked">🔒 {districtById(locked!.district).name}</span>
                : isArmed ? <span className="hc-foot is-go">Now pick a green area</span> : null}
          </button>
        );
      })}
    </div>
  );
}
