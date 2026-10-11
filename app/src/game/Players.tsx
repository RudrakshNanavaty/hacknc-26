// The four stakeholders: persona orb, name, influence pips, and whether they are done with the phase.
import { MAX_INFLUENCE, PERSONA_INFO, type PersonaId, type RoomPlayer, type RoomState } from '@shared';

export function PersonaOrb({ persona, size = 44, dim = false }: { persona: PersonaId; size?: number; dim?: boolean }) {
  const p = PERSONA_INFO[persona];
  return (
    <span
      className="persona-orb"
      style={{ width: size, height: size, fontSize: size * 0.5, ['--tint' as string]: p.color, opacity: dim ? 0.45 : 1 }}
      aria-hidden
    >
      {p.emoji}
    </span>
  );
}

function Pips({ n }: { n: number }) {
  return (
    <span className="flex gap-[3px]" aria-label={`${n} influence`}>
      {Array.from({ length: MAX_INFLUENCE }, (_, i) => (
        <span key={i} className={`pip ${i < n ? 'on' : ''}`} />
      ))}
    </span>
  );
}

export function PlayerTile({ p, you, host, phase }: { p: RoomPlayer; you: boolean; host: boolean; phase: RoomState['phase'] }) {
  const info = PERSONA_INFO[p.persona];
  const waiting = phase === 'select' || phase === 'negotiate';
  return (
    <div className={`player-tile glass ${you ? 'is-you' : ''}`} data-seat={p.seat} style={{ ['--tint' as string]: info.color }}>
      <PersonaOrb persona={p.persona} size={40} dim={!p.connected} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-13 font-bold leading-tight">
          {p.name}
          {you && <span className="ml-1 text-aqua-deep">(you)</span>}
          {host && <span className="ml-1" title="Host">⭐</span>}
        </p>
        <p className="truncate text-[12px] leading-tight opacity-75">{info.name}</p>
        <Pips n={p.influence} />
      </div>
      {waiting && <span className={`ready-dot ${p.ready ? 'on' : ''}`} title={p.ready ? 'Done' : 'Thinking…'}>{p.ready ? '✓' : '…'}</span>}
      {!p.connected && <span className="text-[11px] font-bold text-coral">offline</span>}
    </div>
  );
}

export function Players({ state }: { state: RoomState }) {
  return (
    <div className="players flex gap-2">
      {state.players.map((p) => (
        <PlayerTile key={p.seat} p={p} you={p.seat === state.you} host={p.seat === state.hostSeat} phase={state.phase} />
      ))}
    </div>
  );
}
