// Turn-based play has no clock: a step ends when every player present is ready. This shows who is
// still to go, and gives each player the one button that moves the table on.
import type { RoomState } from '@shared';
import type { Room } from '../room/useRoom';



/** "Ready" for the step, then who the table is waiting for. The host may move on without them. */
export function ReadyBar({ state, room, label }: { state: RoomState; room: Room; label: string }) {
  const me = state.players.find((p) => p.seat === state.you);
  const host = state.you !== null && state.you === state.hostSeat;
  const others = state.players.filter((p) => !p.ready && p.connected && p.seat !== state.you).map((p) => p.name);
  return (
    <div className="flex flex-col items-center gap-1.5">
      {me && !me.ready && <button type="button" className="gel gel-lime gel-big" onClick={room.done}>{label}</button>}
      {me && !me.ready && others.length > 0 && <p className="text-[12px] font-bold opacity-80">Still to go: {others.join(', ')}</p>}
      {me?.ready && <p className="text-13 font-black">{others.length ? `You are ready. Waiting for ${others.join(', ')}` : 'Everyone is ready...'}</p>}
      {!me && <p className="text-13 font-black">{others.length ? `Waiting for ${others.join(', ')}` : 'Everyone is ready...'}</p>}
      {host && others.length > 0 && <button type="button" className="gel" onClick={room.skip} title="Host: move on without waiting for them">Move on without them</button>}
    </div>
  );
}
