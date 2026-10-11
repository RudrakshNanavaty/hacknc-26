// Click an area, see what you can do there. The popover lists the four cards this crisis dealt you:
// the ones the real zoning and FEMA layers allow here are lit, the rest are greyed with the reason.
// Pick one to read it in full, with the before/after preview, then deploy it. A deployment is final.
import { useEffect, useState } from 'react';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { CARDS, DISTRICT_IDS, cardEligibility, cardName, dealtHand, districtById, projectPreview, type CardId, type RoomState } from '@shared';
import type { Room } from '../room/useRoom';
import { explain } from '../api';
import { MapAnchor } from '../map/MapAnchor';
import { playDeal } from '../ui/sound';
import { CharacterCard } from './GameCard';
import { CardExtras, PreviewBox, WhyButton } from './insights';
import { CardArt } from './CardArt';

/** Why a card cannot be played in an area right now (null: it can). */
export function blocker(id: CardId, district: string, influence: number): string | null {
  const where = cardEligibility(id, district);
  if (!where.ok) return where.reason;
  if (CARDS[id].cost > influence) return `Needs ${CARDS[id].cost} influence; you have ${influence}.`;
  return null;
}

/** How many of your cards you could play in each area (the chips show it). */
export function playableCount(state: RoomState, district: string): number {
  const me = state.players.find((p) => p.seat === state.you);
  if (!me) return 0;
  return dealtHand(me.persona, state.round, state.crisis).filter((id) => !blocker(id, district, me.influence)).length;
}

export function DistrictPopover({ state, room, map, district, setDistrict, onCard, initialCard = null }: {
  state: RoomState;
  room: Room;
  map: MapLibreMap | null;
  district: string;
  setDistrict: (d: string | null) => void;
  /** The card being read: the map lights up the other areas it may go to. */
  onCard: (c: CardId | null) => void;
  /** A card already held in the hand: open straight to it here. */
  initialCard?: CardId | null;
}) {
  const [card, setCard] = useState<CardId | null>(initialCard);
  const me = state.players.find((p) => p.seat === state.you);
  useEffect(() => onCard(card), [card, onCard]);
  useEffect(() => () => onCard(null), [onCard]);
  if (!me) return null;
  const d = districtById(district);
  const resilience = state.city.districts[district]?.resilience ?? 0;
  const hand = dealtHand(me.persona, state.round, state.crisis);
  const close = () => setDistrict(null);

  const header = (
    <div className="flex items-start gap-2">
      <div className="min-w-0 flex-1">
        <p className="vr text-18 leading-tight">📍 {d.name}</p>
        <span className="mt-1 flex items-center gap-2 text-[12px] font-black">
          <span className="map-chip-meter !w-24"><span style={{ width: `${resilience}%` }} /></span>
          Resilience {resilience}
        </span>
      </div>
      <span className="lchip">⚡ {me.influence}</span>
      <button type="button" className="hint-x" aria-label="Close" onClick={close}>✕</button>
    </div>
  );

  if (!card) {
    return (
      <MapAnchor map={map} district={district} label={`Your cards for ${d.name}`} onClose={close}>
        <div className="flex flex-col gap-2">
          {header}
          <p className="text-[11px] font-black tracking-wide uppercase opacity-75">Your cards this round</p>
          {hand.map((id) => {
            const c = CARDS[id];
            const why = blocker(id, district, me.influence);
            return (
              <button
                key={id} type="button" className={`hand-row wet ${why ? 'is-off' : ''}`}
                onClick={() => setCard(id)} onPointerEnter={() => onCard(id)} onPointerLeave={() => onCard(card)}
                aria-describedby={`why-${id}`}
              >
                <span className="cost-orb">{c.cost}</span>
                <CardArt id={id} className="hand-art" />
                <span className="min-w-0 flex-1 text-left">
                  <span className="vr block text-[16px] leading-tight">{cardName(id, state.crisis)}</span>
                  <span id={`why-${id}`} className={`block text-[12px] leading-snug ${why ? 'font-black text-[#b0123a]' : 'font-semibold opacity-80'}`}>{why ?? c.text}</span>
                </span>
                <span className="hand-go" aria-hidden>{why ? '' : '›'}</span>
              </button>
            );
          })}
        </div>
      </MapAnchor>
    );
  }

  const why = blocker(card, district, me.influence);
  const preview = why ? null : projectPreview(card, district, state.round, state.city, state.crisis ?? undefined);
  const elsewhere = DISTRICT_IDS.filter((id) => id !== district && !blocker(card, id, me.influence));
  return (
    <MapAnchor map={map} district={district} label={`${cardName(card, state.crisis)} in ${d.name}`} onClose={close} width={400}>
      <div className="flex flex-col gap-2">
        {header}
        <button type="button" className="self-start text-[12px] font-black text-[#0a6f9a] underline" onClick={() => setCard(null)}>‹ All your cards</button>
        <CharacterCard id={card} quip={state.quips[card]} note={why} compact />
        <div className="frost p-3"><CardExtras id={card} /></div>
        {preview && <PreviewBox p={preview} />}
        <WhyButton key={`${card}-${district}`} label={why ? 'Why not here?' : 'Why here?'} ask={() => explain({ kind: 'eligibility', card, district })} />
        {elsewhere.length > 0 && (
          <p className="flex flex-wrap items-center gap-1.5 text-[12px] font-black">
            Also playable in:
            {elsewhere.map((id) => <button key={id} type="button" className="gel gel-sm" onClick={() => setDistrict(id)}>{districtById(id).name}</button>)}
          </p>
        )}
        <div className="anchor-foot">
          <button
            type="button" className="gel gel-lime gel-big" disabled={!!why}
            onClick={() => {
              playDeal();
              room.select(card, district);
            }}
          >
            {why ? 'Not playable here' : `Deploy here · ⚡${CARDS[card].cost}`}
          </button>
          <p className="text-center text-[11px] font-black opacity-80">Final: one card a round, face down until everyone plays.</p>
        </div>
      </div>
    </MapAnchor>
  );
}
