// Turn-based play has no clock: a step ends when every player present is ready. This shows who is
// still to go, and gives each player the one button that moves the table on.
import type { RoomState } from '@shared';
import type { Room } from '../room/useRoom';



/** Top-right of the HUD: how many players are ready for the next step. */
export function TurnOrb({ state }: { state: RoomState }) {
  const total = state.players.filter((p) => p.connected).length || 1;
  const ready = state.players.filter((p) => p.connected && p.ready).length;
  const frac = state.phase === 'lobby' || state.phase === 'final' ? 0 : ready / total;
  return (
    <div
      className="timer-orb" title="Players ready for the next step. The round moves on when everyone is."
      aria-label={`${ready} of ${total} players ready`}
    >
      <svg viewBox="0 0 40 40" aria-hidden>
        <circle cx="20" cy="20" r="18" fill="none" stroke="rgba(255,255,255,.35)" strokeWidth="3" />
        <circle cx="20" cy="20" r="18" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeDasharray={`${113 * frac} 113`} style={{ transition: 'stroke-dasharray .25s linear' }} />
      </svg>
      <span className="text-[18px] leading-none">{ready}/{total}</span>
    </div>
  );
}

/** "Ready" for the step, then who the table is waiting for. The host may move on without them. */
export function ReadyBar({ state, room, label }: { state: RoomState; room: Room; label: string }) {
  const me = state.players.find((p) => p.seat === state.you);
  const host = state.you !== null && state.you === state.hostSeat;
  const others = state.players.filter((p) => !p.ready && p.connected && p.seat !== state.you).map((p) => p.name);
  return (
    <div className="flex flex-col items-center gap-1.5">
      {me && !me.ready && <button type="button" className="gel gel-lime gel-big" onClick={room.done}>{label}</button>}
      {me && !me.ready && others.length > 0 && <p className="text-[12px] font-bold opacity-80">Still to go: {others.join(', ')}</p>}
      {me?.ready && <p className="text-13 font-black">{others.length ? `✅ You are ready · waiting for ${others.join(', ')}` : '✅ Everyone is ready…'}</p>}
      {!me && <p className="text-13 font-black">{others.length ? `Waiting for ${others.join(', ')}` : 'Everyone is ready…'}</p>}
      {host && others.length > 0 && <button type="button" className="gel" onClick={room.skip} title="Host: move on without waiting for them">Move on without them ⏭</button>}
    </div>
  );
}
