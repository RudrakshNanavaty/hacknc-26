// The deck tray: the four cards this crisis dealt you and the influence tube. Tap a card to read it, then tap an area;
// or drag a card straight onto the map, Clash Royale style, and drop it on an area to deploy.
import { useEffect, useRef, useState } from 'react';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { CARDS, MAX_INFLUENCE, cardEligibility, districtById, handFor, type CardId, type PersonaId } from '@shared';
import { GameCard } from './GameCard';
import { Tube } from './ui';
import { playDeal, unlockAudio } from '../ui/sound';

/** The playable area under a screen point: its chip, or its shape on the map. */
function areaAt(map: MapLibreMap | null, x: number, y: number): string | null {
  const chip = document.elementFromPoint(x, y)?.closest<HTMLElement>('.map-chip');
  if (chip?.dataset.id) return chip.dataset.id;
  if (!map) return null;
  const r = map.getContainer().getBoundingClientRect();
  if (x < r.left || x > r.right || y < r.top || y > r.bottom) return null;
  const hit = map.queryRenderedFeatures([x - r.left, y - r.top], { layers: ['areas-fill', 'areas-halo'] })[0];
  const id = hit?.properties?.id;
  return typeof id === 'string' ? id : null;
}

interface Drag {
  card: CardId;
  x: number;
  y: number;
  startX: number;
  startY: number;
  moved: boolean;
  over: string | null;
}

export function Deck({ persona, round, influence, card, setCard, setTarget, map, onDeploy, onHover }: {
  persona: PersonaId;
  /** Each crisis deals 4 of the persona's 6 cards (HANDS in shared/src/game/content.ts). */
  round: number;
  influence: number;
  card: CardId | null;
  setCard: (c: CardId | null) => void;
  setTarget: (d: string | null) => void;
  map: MapLibreMap | null;
  onDeploy: (card: CardId, district: string) => void;
  onHover?: (c: CardId | null) => void;
}) {
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  dragRef.current = drag;

  useEffect(() => {
    if (!drag) return;
    const move = (e: PointerEvent) => {
      const d = dragRef.current!;
      const moved = d.moved || Math.hypot(e.clientX - d.startX, e.clientY - d.startY) > 10;
      const over = moved ? areaAt(map, e.clientX, e.clientY) : null;
      if (over !== d.over) setTarget(over && cardEligibility(d.card, over).ok ? over : null);
      setDrag({ ...d, x: e.clientX, y: e.clientY, moved, over });
    };
    const up = () => {
      const d = dragRef.current!;
      setDrag(null);
      if (!d.moved) return; // a tap: the card is already selected
      if (d.over && cardEligibility(d.card, d.over).ok) {
        playDeal();
        onDeploy(d.card, d.over);
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up, { once: true });
    window.addEventListener('pointercancel', up, { once: true });
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, [drag !== null, map]);

  const overOk = drag?.over ? cardEligibility(drag.card, drag.over) : null;
  return (
    <div className="flex flex-col gap-2">
      <div className="deck">
        {handFor(persona, round).map((id) => {
          const short = CARDS[id].cost > influence;
          return (
            <GameCard
              key={id} id={id} selected={card === id} disabled={short}
              onHover={(on) => onHover?.(on ? id : null)}
              onPointerDown={(e) => {
                if (short) return;
                unlockAudio();
                setCard(id);
                setDrag({ card: id, x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY, moved: false, over: null });
              }}
            />
          );
        })}
      </div>
      <Tube tone="lilac" value={influence} max={MAX_INFLUENCE} label="⚡ Influence" right={`${influence}/${MAX_INFLUENCE}`} />
      {drag?.moved && (
        <>
          <div className="drag-ghost" style={{ left: drag.x, top: drag.y }}><GameCard id={drag.card} /></div>
          <div className="drop-hint lchip" style={{ left: drag.x, top: drag.y }}>
            {drag.over ? (overOk?.ok ? `Drop on ${districtById(drag.over).name}` : `Not allowed in ${districtById(drag.over).name}`) : 'Drag onto an area'}
          </div>
        </>
      )}
    </div>
  );
}
