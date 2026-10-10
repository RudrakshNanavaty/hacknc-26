// Reef Rivals: a room where every player builds for the same reef, same water, same seed.
// lobby -> briefing -> building -> results. The server runs the clock and evaluates every design.
import { useEffect, useState, type FormEvent } from 'react';
import { AVATARS, REEFS, reefById, type AvatarId, type RoomState } from '@shared';
import { Invite } from '../room/Invite';
import { savedPlayer, useRoom, type Room } from '../room/useRoom';
import { Link } from '../router';
import { ReefCard } from '../ui/ReefCard';
import { ResultLine } from '../ui/ResultLine';
import { Workshop, button } from '../workshop/Workshop';

const plate = 'border-(length:--rule) border-ink bg-bond p-4 shadow-plate';

function Avatar({ id, size = 48 }: { id: AvatarId; size?: number }) {
  return <img src={`/avatars/${id}.svg`} alt="" width={size} height={size} className="border border-ink bg-chalk" />;
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

function JoinForm({ room, create }: { room: Room; create: boolean }) {
  const taken = new Set(room.state?.players.map((p) => p.avatar));
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState<AvatarId>(AVATARS.find((a) => !taken.has(a)) ?? AVATARS[0]);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    room.join(name, avatar, create);
  };
  return (
    <form onSubmit={submit} className={`${plate} flex flex-col gap-3`}>
      <h2 className="font-display text-32 font-extrabold">{create ? 'Open the room' : 'Join the room'}</h2>
      <label className="flex flex-col gap-1 text-15">
        Your name
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={20} className="border-(length:--rule) border-ink bg-bond px-2 py-1 text-18" />
      </label>
      <fieldset className="flex flex-wrap gap-2">
        <legend className="mb-1 text-15">Your diver</legend>
        {AVATARS.map((a) => (
          <button type="button" key={a} disabled={taken.has(a)} onClick={() => setAvatar(a)} aria-pressed={a === avatar}
            className={`p-0.5 disabled:opacity-30 ${a === avatar ? 'bg-signal' : ''}`}>
            <Avatar id={a} />
          </button>
        ))}
      </fieldset>
      <button className={`${button} self-start`}>{create ? 'Open room' : 'Join'}</button>
    </form>
  );
}

export function Play({ code }: { code: string }) {
  const room = useRoom(code);
  const { state } = room;
  const left = useCountdown(state, room.offset);
  const me = state?.you ?? null;
  const host = me !== null && state?.hostSeat === me;
  const [locked, setLocked] = useState(false);
  useEffect(() => setLocked(false), [state?.round]);

  // "Room not found" before joining: this page opens it.
  const missing = !state && /not found/i.test(room.error ?? '');
  const joined = me !== null || !!savedPlayer(code);

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link to="/" className={button}>Leave</Link>
        <h1 className="font-display text-48 font-extrabold">Reef Rivals</h1>
        {!room.connected && <span className="text-15">Reconnecting…</span>}
      </div>
      {room.error && !missing && (
        <p className="border-(length:--rule) border-alarm bg-bond p-3 text-15" role="alert">
          {room.error} <button className="underline" onClick={room.clearError}>OK</button>
        </p>
      )}

      {!joined && (missing || state?.phase === 'lobby') && <JoinForm room={room} create={missing} />}
      {!joined && state && state.phase !== 'lobby' && <p className={plate}>A round is under way. You can join when the next one opens.</p>}

      {state && me !== null && (
        <>
          {state.phase === 'lobby' && (
            <div className="grid gap-4 md:grid-cols-2">
              <section className={`${plate} flex flex-col gap-3`}>
                <Invite code={state.code} />
                <ul className="flex flex-wrap gap-3">
                  {state.players.map((p) => (
                    <li key={p.seat} className={`flex items-center gap-2 ${p.connected ? '' : 'opacity-40'}`}>
                      <Avatar id={p.avatar} size={40} />
                      <span className="font-semibold">{p.name}{p.seat === state.hostSeat ? ' (host)' : ''}</span>
                    </li>
                  ))}
                </ul>
                {host ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <select value={state.reef} onChange={(e) => room.reef(e.target.value as RoomState['reef'])} className="border-(length:--rule) border-ink bg-bond px-2 py-2">
                      {REEFS.filter((r) => r.ready).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                    <button className={button} onClick={room.start}>Start the round</button>
                  </div>
                ) : (
                  <p className="text-15">Waiting for the host to start.</p>
                )}
              </section>
              <ReefCard reef={reefById(state.reef)} />
            </div>
          )}

          {state.phase === 'briefing' && (
            <section className={plate}>
              <p className="text-15">Round {state.round} · building starts in <span className="tabular">{left}</span> s</p>
              <h2 className="font-display text-48 font-extrabold">{reefById(state.reef).mission.title}</h2>
              <p className="mt-1 text-18">{reefById(state.reef).mission.brief}</p>
              <p className="mt-2 text-15">Everyone builds for the same water and the same larvae (seed {state.seed}).</p>
              {host && <button className={`${button} mt-3`} onClick={room.start}>Skip briefing</button>}
            </section>
          )}

          {state.phase === 'building' && (
            <>
              <p className="tabular text-24 font-semibold">{left} s left · {state.players.filter((p) => p.locked).length}/{state.players.length} designs in</p>
              {locked || state.players.find((p) => p.seat === me)?.locked ? (
                <p className={plate}>Your design is in. Waiting for the others.</p>
              ) : (
                <Workshop submitLabel="Lock in my design" onSubmit={(design) => {
                  setLocked(true);
                  room.lock(design);
                }} />
              )}
            </>
          )}

          {state.phase === 'results' && state.results && (
            <section className={plate}>
              <h2 className="font-display text-48 font-extrabold">Results</h2>
              <p className="text-13">Ranked by simulated settlement, then less material. Same reef, water and seed for everyone.</p>
              <ol className="mt-3 space-y-2">
                {state.results.map((r) => (
                  <li key={r.seat} className="flex items-center gap-3 text-15">
                    <span className="tabular font-display text-32 font-extrabold">{r.rank}</span>
                    <Avatar id={r.avatar} size={40} />
                    <span className="font-semibold">{r.name}</span>
                    {r.result ? <ResultLine result={r.result} /> : <span>No design arrived in time</span>}
                  </li>
                ))}
              </ol>
              {state.experimentId && (
                <a className="mt-3 inline-block underline" href={`/api/experiments/${state.experimentId}`} target="_blank" rel="noreferrer">Your experiment record</a>
              )}
              {host && <button className={`${button} mt-3 block`} onClick={room.again}>Another round</button>}
            </section>
          )}
        </>
      )}
    </main>
  );
}
