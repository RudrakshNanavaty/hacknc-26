// Confirm a card on the map. Pick a card, click a green area, and this small card pins to that area:
// what it does here (benefit, downside, city money before -> after), then Lock it in, or change the area
// or the card first. Locking is final for the round. Clicking an area with no card in hand lists the
// cards you could play there instead. The full card, its rules and "Why here?" sit under More.
import { useEffect, useState } from 'react';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { CARDS, DISTRICT_IDS, cardEligibility, cardName, dealtHand, districtById, projectPreview, simpleCard, type CardId, type RoomState } from '@shared';
import type { Room } from '../room/useRoom';
import { explain } from '../api';
import { MapAnchor } from '../map/MapAnchor';
import { playDeal } from '../ui/sound';
import { CharacterCard } from './GameCard';
import { CardExtras, WhyButton } from './insights';
import { CardArt } from './CardArt';

/** Why a card cannot be played in an area right now (null: it can). */
export function blocker(id: CardId, district: string, influence: number): string | null {
  const where = cardEligibility(id, district);
  if (!where.ok) return where.reason;
  if (CARDS[id].cost > influence) return `Needs ${CARDS[id].cost} influence; you have ${influence}.`;
  return null;
}

/** How many of your cards you could play in an area. */
export function playableCount(state: RoomState, district: string): number {
  const me = state.players.find((p) => p.seat === state.you);
  if (!me) return 0;
  return dealtHand(me.persona, state.round, state.crisis).filter((id) => !blocker(id, district, me.influence)).length;
}

export function DistrictPopover({ state, room, map, district, setDistrict, onCard, onArm, initialCard = null }: {
  state: RoomState;
  room: Room;
  map: MapLibreMap | null;
  district: string;
  setDistrict: (d: string | null) => void;
  /** The card being read: the map lights up the other areas it may go to. */
  onCard: (c: CardId | null) => void;
  /** Hold a card in the hand (Change area keeps it; Change card drops it). */
  onArm: (c: CardId | null) => void;
  /** A card already held in the hand: open straight to it here. */
  initialCard?: CardId | null;
}) {
  const [card, setCard] = useState<CardId | null>(initialCard);
  const me = state.players.find((p) => p.seat === state.you);
  useEffect(() => onCard(card), [card, onCard]);
  useEffect(() => () => onCard(null), [onCard]);
  if (!me) return null;
  const d = districtById(district);
  const close = () => setDistrict(null);

  if (!card) {
    const hand = dealtHand(me.persona, state.round, state.crisis);
    return (
      <MapAnchor map={map} district={district} label={`Your cards for ${d.name}`} onClose={close} width={330}>
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <p className="vr min-w-0 flex-1 text-18 leading-tight">{d.name}</p>
            <button type="button" className="hint-x" aria-label="Close" onClick={close}>✕</button>
          </div>
          {hand.map((id) => {
            const why = blocker(id, district, me.influence);
            return (
              <button key={id} type="button" className={`hand-row wet ${why ? 'is-off' : ''}`} disabled={!!why} onClick={() => setCard(id)} title={why ?? undefined}>
                <span className="cost-orb">{CARDS[id].cost}</span>
                <span className="min-w-0 flex-1 text-left">
                  <span className="vr block text-[15px] leading-tight">{cardName(id, state.crisis)}</span>
                  <span className={`block truncate text-[12px] ${why ? 'font-black text-[#b0123a]' : 'font-semibold opacity-80'}`}>{why ? 'Not allowed here' : `✅ ${simpleCard(id).good[0]}`}</span>
                </span>
              </button>
            );
          })}
        </div>
      </MapAnchor>
    );
  }

  const why = blocker(card, district, me.influence);
  const s = simpleCard(card);
  const preview = why ? null : projectPreview(card, district, state.round, state.city, state.crisis ?? undefined);
  const elsewhere = DISTRICT_IDS.filter((id) => id !== district && !blocker(card, id, me.influence));
  const name = cardName(card, state.crisis);
  return (
    <MapAnchor map={map} district={district} label={`${name} in ${d.name}`} onClose={close} width={340}>
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2.5">
          <CardArt id={card} className="confirm-art" />
          <div className="min-w-0 flex-1">
            <p className="vr text-[17px] leading-tight">{name}</p>
            <p className="text-13 font-black opacity-80">in {d.name}</p>
          </div>
          <button type="button" className="hint-x" aria-label="Close" onClick={close}>✕</button>
        </div>
        {why ? <p className="warn-line">{why}</p> : (
          <ul className="plain-list">
            <li className="hc-good">✅ {s.good.join(' · ')}</li>
            <li className="hc-bad">⚠️ {s.bad.join(' · ')}</li>
            {preview
              ? <li className="hc-money">💲 City money ${preview.before.budget}M → <b>${preview.after.budget}M</b>{preview.fundable ? '' : ' (not enough: someone must pay)'}</li>
              : s.money && <li className="hc-money">💲 {s.money}</li>}
            {preview?.spotlight && <li className="hc-star">⭐ Crisis area: bonus if it passes</li>}
          </ul>
        )}
        <button
          type="button" className="gel gel-lime gel-big !min-h-[46px] !text-[18px]" disabled={!!why}
          onClick={() => {
            playDeal();
            room.select(card, district);
          }}
        >
          🔒 Lock it in · <span className="cost-dot">{CARDS[card].cost}</span>
        </button>
        <div className="flex gap-1.5">
          <button type="button" className="gel gel-sm flex-1" onClick={() => { onArm(card); close(); }} disabled={!elsewhere.length}>Change area</button>
          <button type="button" className="gel gel-sm flex-1" onClick={() => { onArm(null); close(); }}>Change card</button>
        </div>
        <details className="frost p-2 text-13">
          <summary className="cursor-pointer font-black">More: the full card, its rules, why here</summary>
          <div className="mt-2 flex flex-col gap-2">
            <WhyButton key={`${card}-${district}`} label={why ? 'Why not here?' : 'Why here?'} ask={() => explain({ kind: 'eligibility', card, district })} />
            <CharacterCard id={card} quip={state.quips[card]} note={why} compact />
            <CardExtras id={card} compact />
            {elsewhere.length > 0 && <p className="text-[12px] font-bold">Also fits: {elsewhere.map((id) => districtById(id).name).join(', ')}</p>}
          </div>
        </details>
      </div>
    </MapAnchor>
  );
}
