// Reactions at the negotiating table: an emote pops up over the area it was sent to, in the sender's
// colour, and floats away. Relayed by the server and never stored.
import { motion } from 'motion/react';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { PERSONA_INFO, districtById, type Ping, type RoomState } from '@shared';
import { screenPoint, useCameraTick } from './MapAnchor';

export function PingLayer({ map, state, pings }: { map: MapLibreMap | null; state: RoomState; pings: Ping[] }) {
  useCameraTick(map);
  if (!map || !pings.length) return null;
  return (
    <div className="pointer-events-none fixed inset-0 z-[36]" aria-live="polite">
      {pings.map((p) => {
        const player = state.players.find((x) => x.seat === p.seat);
        if (!player) return null;
        const info = PERSONA_INFO[player.persona];
        const at = screenPoint(map, districtById(p.district).center);
        // Spread the table around the area's chip so two reactions do not stack.
        const dx = (p.seat - 1.5) * 44;
        return (
          <motion.div
            key={`${p.seat}-${p.at}`}
            className="ping"
            style={{ left: at.x + dx, top: at.y - 92, '--tint': info.color } as React.CSSProperties}
            initial={{ y: 16, scale: 0.4, opacity: 0 }}
            animate={{ y: [16, 0, -8, -40], scale: [0.4, 1.15, 1, 0.9], opacity: [0, 1, 1, 0] }}
            transition={{ duration: 2.5, times: [0, 0.15, 0.75, 1] }}
          >
            <span className="ping-emote">{p.emote}</span>
            <span className="ping-who">{player.name}</span>
          </motion.div>
        );
      })}
    </div>
  );
}
