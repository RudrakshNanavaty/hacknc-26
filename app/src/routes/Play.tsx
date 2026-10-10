// Reef Rivals: a room where every player builds for the same reef, same water, same larvae (seed).
// lobby -> briefing -> building -> results. The server runs the clock and evaluates every design.
// Until the validated settlement engine exists, the winner is decided by an explicit arcade
// objective (most larvae reaching the structure, then less material) and labelled as such.
import { useEffect, useState, type FormEvent } from 'react';
import { AVATARS, REEFS, reefById, type AvatarId, type Piece, type RoomResult, type RoomState } from '@shared';
import { Invite } from '../room/Invite';
import { savedPlayer, useRoom, type Room } from '../room/useRoom';
import { Link } from '../router';
import { Bubbles } from '../ui/Bubbles';
import { ReefCard } from '../ui/ReefCard';
import { Icon } from '../workshop/Icons';
import { Workshop } from '../workshop/Workshop';

function Avatar({ id, size = 48, ring = false }: { id: AvatarId; size?: number; ring?: boolean }) {
  return (
    <span className={`inline-block shrink-0 overflow-hidden rounded-full border-2 bg-white ${ring ? 'border-sun' : 'border-white'}`} style={{ width: size, height: size }}>
      <img src={`/avatars/${id}.svg`} alt="" width={size} height={size} className="h-full w-full object-cover" />
    </span>
  );
}

/** Seconds left on the server's clock, ticking locally. */
function useCountdown(state: RoomState | null, offset: number) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);
  if (!state?.endsAt) return null;
  return Math.max(0, Math.ceil((state.endsAt - (now + offset)) / 1000));
}

const clock = (s: number | null) => (s === null ? '' : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`);

function JoinForm({ room, create }: { room: Room; create: boolean }) {
  const taken = new Set(room.state?.players.map((p) => p.avatar));
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState<AvatarId>(AVATARS.find((a) => !taken.has(a)) ?? AVATARS[0]);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    room.join(name, avatar, create);
  };
  return (
    <form onSubmit={submit} className="glass flex flex-col gap-3 p-5">
      <h2 className="font-display text-32 font-black">{create ? 'Open the room' : 'Join the dive'}</h2>
      <label className="flex flex-col gap-1 font-bold">
        Your name
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={20} autoFocus
          className="field text-18" />
      </label>
      <fieldset>
        <legend className="mb-2 font-bold">Pick your diver</legend>
        <div className="flex flex-wrap gap-2">
          {AVATARS.map((a) => (
            <button type="button" key={a} disabled={taken.has(a)} onClick={() => setAvatar(a)} aria-pressed={a === avatar} aria-label={`Diver ${a}`}
              className={`rounded-full p-0.5 transition disabled:opacity-25 ${a === avatar ? 'scale-110 bg-sun shadow-lg' : 'hover:scale-105'}`}>
              <Avatar id={a} size={52} ring={a === avatar} />
            </button>
          ))}
        </div>
      </fieldset>
      <button className="btn btn-primary btn-lg self-start">{create ? 'Open room' : 'Join'}</button>
    </form>
  );
}

export function Play({ code }: { code: string }) {
  const room = useRoom(code);
  const { state } = room;
  const left = useCountdown(state, room.offset);
  const me = state?.you ?? null;
  const host = me !== null && state?.hostSeat === me;
  const [watching, setWatching] = useState<RoomResult | null>(null);
  useEffect(() => setWatching(null), [state?.round, state?.phase]);

  // "Room not found" before joining: this page opens it.
  const missing = !state && /not found/i.test(room.error ?? '');
  const joined = me !== null || !!savedPlayer(code);
  const reef = state ? reefById(state.reef) : null;
  const mine = state?.players.find((p) => p.seat === me);

  // Building: the full workshop, with the room's seed so local tests match the server's.
  if (state && reef && me !== null && state.phase === 'building') {
    const lockedCount = state.players.filter((p) => p.locked).length;
    return (
      <Workshop
        reef={reef}
        seed={state.seed}
        readOnly={mine?.locked}
        primary={mine?.locked ? { label: 'Locked in', onClick: () => {}, disabled: true } : { label: 'Lock in my design', onClick: (d) => room.lock(d) }}
        corner={
          <div className="glass-deep flex items-center gap-3 px-4 py-2">
            <span className={`tabular font-display text-32 font-black ${left !== null && left <= 30 ? 'text-sun' : ''}`}>{clock(left)}</span>
            <span className="text-13 leading-tight">Room {state.code}<br />{lockedCount}/{state.players.length} locked in</span>
            {room.error && <span className="text-13 font-bold text-sun">{room.error}</span>}
          </div>
        }
      />
    );
  }

  // Watching a result: someone's design, replayed with the round's seed (same numbers as the server).
  if (state && reef && watching?.design) {
    return (
      <Workshop
        reef={reef}
        seed={state.seed}
        viewPieces={(watching.design.pieces ?? []) as Piece[]}
        corner={<button className="btn" onClick={() => setWatching(null)}>{Icon.back}<span>Results</span></button>}
      />
    );
  }

  return (
    <main className="relative min-h-full overflow-hidden">
      <Bubbles count={16} />
      <div className="relative mx-auto flex max-w-5xl flex-col gap-4 p-3 sm:p-6">
        <header className="flex flex-wrap items-center gap-3">
          <Link to="/" className="btn">{Icon.back}<span>Leave</span></Link>
          <h1 className="font-display text-48 font-black text-white drop-shadow-[0_2px_6px_rgba(0,50,90,0.5)]">Reef Rivals</h1>
          {!room.connected && <span className="chip chip-published">Reconnecting…</span>}
        </header>
        {room.error && !missing && (
          <p className="glass p-3 font-bold text-coral" role="alert">
            {room.error} <button className="ml-2 underline" onClick={room.clearError}>OK</button>
          </p>
        )}

        {!joined && (missing || state?.phase === 'lobby') && <JoinForm room={room} create={missing} />}
        {!joined && state && state.phase !== 'lobby' && <p className="glass p-4">A round is under way. You can join when the next one opens.</p>}

        {state && reef && me !== null && state.phase === 'lobby' && (
          <div className="grid gap-4 md:grid-cols-2">
            <section className="glass flex flex-col gap-4 p-5">
              <Invite code={state.code} />
              <ul className="flex flex-wrap gap-3">
                {state.players.map((p) => (
                  <li key={p.seat} className={`flex items-center gap-2 rounded-full bg-white/60 py-1 pr-3 pl-1 ${p.connected ? '' : 'opacity-40'}`}>
                    <Avatar id={p.avatar} size={40} ring={p.seat === me} />
                    <span className="font-bold">{p.name}{p.seat === state.hostSeat ? ' · host' : ''}</span>
                  </li>
                ))}
              </ul>
              {host ? (
                <div className="flex flex-wrap items-center gap-2">
                  <select value={state.reef} onChange={(e) => room.reef(e.target.value as RoomState['reef'])} className="field">
                    {REEFS.filter((r) => r.ready).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                  <button className="btn btn-primary btn-lg" onClick={room.start}>Start the round</button>
                </div>
              ) : (
                <p className="font-bold">Waiting for the host to start…</p>
              )}
            </section>
            <ReefCard reef={reef} />
          </div>
        )}

        {state && reef && me !== null && state.phase === 'briefing' && (
          <section className="glass p-6 text-center">
            <p className="font-bold text-aqua-deep">Round {state.round} · building starts in <span className="tabular">{left}</span> s</p>
            <h2 className="mt-1 font-display text-48 font-black">{reef.mission.title}</h2>
            <p className="mx-auto mt-2 max-w-xl text-18">{reef.mission.brief}</p>
            <p className="mx-auto mt-3 max-w-xl text-15">Same reef, same water, same larvae for everyone. You have {clock(180)} to build. The arcade goal: reach the most larvae with the least material.</p>
            <div className="mt-4 flex justify-center gap-2">{state.players.map((p) => <Avatar key={p.seat} id={p.avatar} size={52} />)}</div>
            {host && <button className="btn mt-4" onClick={room.start}>Skip briefing</button>}
          </section>
        )}

        {state && reef && me !== null && state.phase === 'results' && state.results && (
          <section className="glass p-5">
            <h2 className="font-display text-48 font-black">Results</h2>
            <p className="text-15">
              <span className="chip chip-game mr-1">Arcade ranking</span>
              Most larvae reaching the structure, then less material. Not a scientific result: settlement needs the validated engine.
            </p>
            <ol className="mt-4 space-y-2">
              {state.results.map((r) => {
                const m = r.result?.prototype;
                return (
                  <li key={r.seat} className={`flex flex-wrap items-center gap-3 rounded-2xl p-2 ${r.rank === 1 ? 'bg-sun/40' : 'bg-white/45'}`}>
                    <span className="tabular w-8 text-center font-display text-32 font-black">{r.rank}</span>
                    <Avatar id={r.avatar} size={44} ring={r.seat === me} />
                    <span className="min-w-24 font-display text-18 font-black">{r.name}</span>
                    {r.result && m ? (
                      <span className="tabular flex-1 text-15">
                        Reached <b>{m.reachedStructure}</b>/{m.released} · touches <b>{m.structureContacts}</b> · material <b>{r.result.material.toLocaleString()}</b>
                      </span>
                    ) : (
                      <span className="flex-1">No design arrived in time</span>
                    )}
                    {r.design && <button className="btn" onClick={() => setWatching(r)}>Watch</button>}
                  </li>
                );
              })}
            </ol>
            <div className="mt-4 flex flex-wrap gap-2">
              {state.experimentId && <a className="btn" href={`/api/experiments/${state.experimentId}`} target="_blank" rel="noreferrer">My experiment record</a>}
              <Link to="/research" className="btn">Research Mode</Link>
              {host && <button className="btn btn-primary" onClick={room.again}>Another round</button>}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
