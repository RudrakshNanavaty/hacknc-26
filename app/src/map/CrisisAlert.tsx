// The crisis lands on the map: a breaking-news pin drops on each spotlight area while the crisis phase
// runs. Afterwards the crisis stays as a small badge on those areas' chips (CityMap `chipBadge`).
import { motion } from 'motion/react';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { CRISIS_KIND_INFO, districtById, type RoomState } from '@shared';
import { chipBelow } from './CityMap';
import { screenPoint, useCameraTick } from './MapAnchor';

export function CrisisAlert({ map, state }: { map: MapLibreMap | null; state: RoomState }) {
  useCameraTick(map);
  const c = state.crisis;
  if (!map || !c || state.phase !== 'crisis') return null;
  const kind = CRISIS_KIND_INFO[c.kind];
  return (
    <div className="pointer-events-none fixed inset-0 z-[25]" aria-hidden>
      {c.spotlight.map((id, i) => {
        const p = screenPoint(map, districtById(id).center);
        // Above the area's chip (or just above the center, where the chip hangs below).
        const top = p.y - (chipBelow(id) ? 10 : 66);
        return (
          <motion.div
            key={`${c.id}-${id}`}
            className="alert-pin"
            style={{ left: p.x, top }}
            initial={{ y: -90, opacity: 0, scale: 0.4 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            transition={{ type: 'spring', stiffness: 420, damping: 16, delay: 0.5 + i * 0.3 }}
          >
            <span className="alert-ring" />
            <span className="alert-head"><span>{kind.icon}</span></span>
            <span className="alert-label">BREAKING · {kind.label}</span>
          </motion.div>
        );
      })}
    </div>
  );
}
