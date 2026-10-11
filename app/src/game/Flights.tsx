// The satisfying part: at the reveal, every played card flies from its player to the place it was
// played, and lands with a splash; at the resolution, a verdict stamp drops on each proposal's area.
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { CARDS, INDICATORS, INDICATOR_INFO, PROJECTS, districtById, type CardId, type RoomState } from '@shared';
import { GameCard } from './GameCard';
import { STATUS_STYLE } from './format';
import { screenPoint, useCameraTick } from '../map/MapAnchor';
import { playReveal, playStamp } from '../ui/sound';
import { outcomeSentence } from './Climax';

interface Flight {
  key: string;
  card: CardId;
  from: { x: number; y: number };
  to: { x: number; y: number };
  delay: number;
}

const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function Flights({ map, state }: { map: MapLibreMap | null; state: RoomState }) {
  const [flights, setFlights] = useState<Flight[]>([]);
  const [splashes, setSplashes] = useState<{ key: string; district: string }[]>([]);
  const revealKey = state.phase === 'reveal' && state.board ? `reveal-${state.round}` : null;

  useEffect(() => {
    if (!revealKey || !map || !state.board) return;
    const board = state.board;
    const plays: { seat: number; card: CardId; district: string }[] = [
      ...board.proposals.filter((p) => !p.carried).map((p) => ({ seat: p.seat, card: (Object.values(CARDS).find((c) => c.project === p.kind)!.id), district: p.district })),
      ...board.attachments.map((a) => ({ seat: a.seat, card: a.card, district: a.district })),
    ].sort((a, b) => a.seat - b.seat);
    playReveal();
    if (reduceMotion()) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    let started = false;
    // Cards land where their area is once the camera has settled (the reveal flies the camera to the duel).
    const start = () => {
      if (started) return;
      started = true;
      const list = plays.map((p, i) => {
        const tile = document.querySelector(`[data-seat="${p.seat}"]`)?.getBoundingClientRect();
        const from = tile ? { x: tile.left + tile.width / 2, y: tile.top + tile.height / 2 } : { x: window.innerWidth / 2, y: window.innerHeight };
        return { key: `${revealKey}-${p.seat}`, card: p.card, from, to: screenPoint(map, districtById(p.district).center), delay: i * 0.28 };
      });
      setFlights(list);
      plays.forEach((p, i) =>
        timers.push(setTimeout(() => {
          playStamp();
          setSplashes((s) => [...s, { key: `${revealKey}-${p.seat}`, district: p.district }]);
        }, 900 + i * 280)),
      );
      timers.push(setTimeout(() => {
        setFlights([]);
        setSplashes([]);
      }, 900 + plays.length * 280 + 900));
    };
    if (map.isMoving()) {
      map.once('moveend', start);
      timers.push(setTimeout(start, 1800)); // never wait for a camera that does not settle
    } else start();
    return () => {
      map.off('moveend', start);
      timers.forEach(clearTimeout);
      // The phase can end early (host skip): never leave a card hanging over the map.
      setFlights([]);
      setSplashes([]);
    };
    // One flight per reveal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealKey, map]);

  return (
    <div className="pointer-events-none fixed inset-0 z-40" aria-hidden>
      <AnimatePresence>
        {flights.map((f) => (
          <motion.div
            key={f.key}
            className="absolute left-0 top-0"
            initial={{ x: f.from.x - 60, y: f.from.y - 80, scale: 0.6, rotate: -12, opacity: 0 }}
            animate={{ x: [f.from.x - 60, (f.from.x + f.to.x) / 2 - 60, f.to.x - 60], y: [f.from.y - 80, Math.min(f.from.y, f.to.y) - 180, f.to.y - 80], scale: [0.6, 1.05, 0.45], rotate: [-12, 6, 0], opacity: [0, 1, 1] }}
            exit={{ opacity: 0, scale: 0.2 }}
            transition={{ duration: 0.9, delay: f.delay, ease: 'easeInOut' }}
          >
            <GameCard id={f.card} compact />
          </motion.div>
        ))}
      </AnimatePresence>
      {map && splashes.map((s) => {
        const p = screenPoint(map, districtById(s.district).center);
        return <span key={s.key} className="splash" style={{ left: p.x, top: p.y }} />;
      })}
    </div>
  );
}

export function Stamps({ map, state }: { map: MapLibreMap | null; state: RoomState }) {
  useCameraTick(map);
  const last = state.phase === 'resolve' ? state.history[state.history.length - 1] : null;
  const key = last ? `resolve-${last.round}` : null;
  // The verdict sounds play with the big stamps in the middle of the screen (Climax.tsx).
  if (!map || !last) return null;
  const perDistrict = new Map<string, number>();
  return (
    <div className="pointer-events-none fixed inset-0 z-30" aria-hidden>
      {last.resolution.outcomes.map((o, i) => {
        const n = perDistrict.get(o.district) ?? 0;
        perDistrict.set(o.district, n + 1);
        const p = screenPoint(map, districtById(o.district).center);
        const main = INDICATORS.filter((k) => o.delta[k]).sort((a, b) => Math.abs(o.delta[b]!) - Math.abs(o.delta[a]!))[0];
        return (
          <div key={`${key}-${o.proposalId}`}>
            <motion.span
              className={`map-verdict verdict-pill ${o.status} ${o.status === 'approved' ? 'sparkle' : ''}`}
              style={{ left: p.x, top: p.y + 30 + n * 44 }}
              initial={{ scale: 2.4, opacity: 0, rotate: -14 }}
              animate={{ scale: 1, opacity: 1, rotate: -5 }}
              transition={{ delay: 0.25 + i * 0.35, type: 'spring', stiffness: 380, damping: 18 }}
            >
              {PROJECTS[o.kind].marker} {STATUS_STYLE[o.status].label}{o.status === 'approved' ? '!' : ''}
            </motion.span>
            {state.mode === 'beginner' && (
              // Beginner Mode: the one-line reason sits on the map with the verdict, and any change that was accepted.
              <motion.span
                className="map-reason" style={{ left: p.x, top: Math.min(window.innerHeight - 60, p.y + 74 + n * 44) }}
                initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 + i * 0.35 }}
              >
                {outcomeSentence(o).reason}{o.conditions.length ? ` · 🤝 ${o.conditions.join('; ')}` : ''}
              </motion.span>
            )}
            {o.status === 'approved' && main && (
              <motion.span
                className="map-delta"
                style={{ left: p.x, top: p.y - 70 - n * 40 }}
                initial={{ opacity: 0, y: 20, scale: 0.5 }}
                animate={{ opacity: [0, 1, 1, 0], y: [20, 0, -10, -40], scale: [0.5, 1.2, 1, 1] }}
                transition={{ delay: 0.6 + i * 0.35, duration: 2.6, times: [0, 0.2, 0.7, 1] }}
              >
                {o.delta[main]! > 0 ? '+' : '−'}{Math.abs(o.delta[main]!)} {INDICATOR_INFO[main].icon}
              </motion.span>
            )}
          </div>
        );
      })}
    </div>
  );
}
