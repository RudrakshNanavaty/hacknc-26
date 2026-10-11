// The satisfying part: at the reveal, every played card flies from its player to the place it was
// played, and lands with a splash; at the resolution, a verdict stamp drops on each proposal's area.
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { CARDS, INDICATORS, INDICATOR_INFO, PROJECTS, districtById, type CardId, type RoomState } from '@shared';
import { GameCard } from './GameCard';
import { STATUS_STYLE } from './format';
import { playApproved, playBlocked, playReveal, playStamp } from '../ui/sound';

interface Flight {
  key: string;
  card: CardId;
  from: { x: number; y: number };
  to: { x: number; y: number };
  delay: number;
}

const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Screen position of a lng/lat on the map (page coordinates). */
function screenPoint(map: MapLibreMap, lngLat: [number, number]) {
  const r = map.getContainer().getBoundingClientRect();
  const p = map.project(lngLat);
  return { x: r.left + p.x, y: r.top + p.y };
}

/** Re-render when the camera moves, so stamps stay on their areas. */
function useCameraTick(map: MapLibreMap | null) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!map) return;
    const on = () => setTick((t) => t + 1);
    map.on('move', on);
    return () => void map.off('move', on);
  }, [map]);
}

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
    const list = plays.map((p, i) => {
      const tile = document.querySelector(`[data-seat="${p.seat}"]`)?.getBoundingClientRect();
      const from = tile ? { x: tile.left + tile.width / 2, y: tile.top + tile.height / 2 } : { x: window.innerWidth / 2, y: window.innerHeight };
      return { key: `${revealKey}-${p.seat}`, card: p.card, from, to: screenPoint(map, districtById(p.district).center), delay: i * 0.28 };
    });
    setFlights(list);
    const timers = plays.map((p, i) =>
      setTimeout(() => {
        playStamp();
        setSplashes((s) => [...s, { key: `${revealKey}-${p.seat}`, district: p.district }]);
      }, 900 + i * 280),
    );
    const clear = setTimeout(() => {
      setFlights([]);
      setSplashes([]);
    }, 900 + plays.length * 280 + 900);
    return () => {
      timers.forEach(clearTimeout);
      clearTimeout(clear);
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
  useEffect(() => {
    if (!last) return;
    const good = last.resolution.outcomes.some((o) => o.status === 'approved');
    const t = setTimeout(() => (good ? playApproved() : last.resolution.outcomes.length ? playBlocked() : undefined), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
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
