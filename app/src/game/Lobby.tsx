// The lobby: join as a stakeholder, see who is in, and (host) fill seats with bots, pick the session
// type, then start.
import { useState, type FormEvent } from 'react';
import { PERSONAS, PERSONA_INFO, handOf, type PersonaId, type RoomState } from '@shared';
import { Invite } from '../room/Invite';
import type { Room } from '../room/useRoom';
import { GameCard } from './GameCard';
import { PersonaOrb } from './Players';
import { unlockAudio } from '../ui/sound';

function PersonaPicker({ taken, value, onPick }: { taken: Map<PersonaId, { bot: boolean }>; value: PersonaId | null; onPick: (p: PersonaId) => void }) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {PERSONAS.map((id) => {
        const p = PERSONA_INFO[id];
        const t = taken.get(id);
        const blocked = !!t && !t.bot;
        return (
          <button
            key={id} type="button" disabled={blocked} onClick={() => onPick(id)} aria-pressed={value === id}
            className={`persona-pick ${value === id ? 'is-on' : ''}`} style={{ ['--tint' as string]: p.color }}
          >
            <PersonaOrb persona={id} size={46} />
            <span className="min-w-0 text-left">
              <span className="block font-display text-18 leading-tight font-black">{p.name}</span>
              <span className="block text-13 leading-snug opacity-80">{p.goal}</span>
              {t && <span className="mt-1 block text-[12px] font-bold text-aqua-deep">{t.bot ? 'A bot is playing: take its seat' : 'Taken'}</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function JoinForm({ room, create }: { room: Room; create: boolean }) {
  const taken = new Map((room.state?.players ?? []).map((p) => [p.persona, { bot: p.bot }] as const));
  const [name, setName] = useState('');
  const [persona, setPersona] = useState<PersonaId | null>(PERSONAS.find((p) => !taken.has(p)) ?? null);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    unlockAudio();
    if (persona) room.join(name, persona, create);
  };
  return (
    <form onSubmit={submit} className="wet flex w-full max-w-2xl flex-col gap-4 p-5">
      <h2 className="font-display text-32 font-black">{create ? 'Open the council chamber' : 'Take a seat at the table'}</h2>
      <label className="flex flex-col gap-1 font-bold">
        Your name
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={20} autoFocus className="aero-input" placeholder="e.g. Sam" />
      </label>
      <fieldset>
        <legend className="mb-2 font-bold">Pick your stakeholder</legend>
        <PersonaPicker taken={taken} value={persona} onPick={setPersona} />
      </fieldset>
      {persona && (
        <div className="flex flex-wrap items-end gap-3 pt-2">
          {handOf(persona).map((c) => <GameCard key={c} id={c} size="lg" />)}
          <p className="w-full text-13 opacity-70">Your deck: each crisis deals you 4 of these 6.</p>
          <p className="max-w-[16rem] text-13 opacity-80">{PERSONA_INFO[persona].voice}</p>
        </div>
      )}
      <button className="aero-btn aero-btn-go aero-btn-lg self-start" disabled={!persona || !name.trim()}>{create ? 'Open room' : 'Join'}</button>
    </form>
  );
}

export function Lobby({ state, room }: { state: RoomState; room: Room }) {
  const me = state.you;
  const host = me !== null && me === state.hostSeat;
  const taken = new Map(state.players.map((p) => [p.persona, p]));
  return (
    <div className="flex w-full max-w-5xl flex-col gap-4 lg:flex-row">
      <section className="wet flex flex-1 flex-col gap-4 p-5">
        <h2 className="font-display text-32 font-black">The council is assembling</h2>
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {PERSONAS.map((id) => {
            const p = taken.get(id);
            const info = PERSONA_INFO[id];
            return (
              <li key={id} className="persona-slot" style={{ ['--tint' as string]: info.color }}>
                <PersonaOrb persona={id} size={44} dim={!p} />
                <div className="min-w-0 flex-1">
                  <p className="font-display text-18 leading-tight font-black">{info.name}</p>
                  <p className="truncate text-13">{p ? `${p.name}${p.seat === me ? ' (you)' : ''}${p.bot ? '' : !p.connected ? ' · offline' : ''}` : 'Open seat'}</p>
                </div>
                {host && (!p || p.bot) && (
                  <button type="button" className="aero-btn !px-3 !py-1 text-13" onClick={() => room.bot(id, !p)}>
                    {p ? 'Remove bot' : '+ Bot'}
                  </button>
                )}
                {!host && me !== null && !p && (
                  <button type="button" className="aero-btn !px-3 !py-1 text-13" onClick={() => room.persona(id)}>Switch</button>
                )}
              </li>
            );
          })}
        </ul>
        {host ? (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-13 font-bold">Session</span>
              {(['demo', 'community'] as const).map((k) => (
                <button key={k} type="button" className="aero-btn !py-1 text-13" aria-pressed={state.sessionKind === k} onClick={() => room.session(k)}>
                  {k === 'demo' ? 'Demo / playtest' : 'Community session'}
                </button>
              ))}
            </div>
            <p className="text-13 opacity-80">
              {state.sessionKind === 'community'
                ? 'Community session: records are marked as real community participants in Planning Studio.'
                : 'Demo session: records are marked as demonstration participants, kept apart from community input.'}
            </p>
            <button type="button" className="aero-btn aero-btn-go aero-btn-lg self-start pulse" onClick={() => { unlockAudio(); room.start(); }}>
              Start the session ▶
            </button>
          </div>
        ) : (
          <p className="text-15">Waiting for the host to start. Empty seats can be filled by bots.</p>
        )}
      </section>
      <aside className="wet flex flex-col gap-3 p-5 lg:w-[22rem]">
        <Invite code={state.code} />
        <p className="text-13 opacity-80">Four stakeholders, three rounds, one real city. Every card you play is recorded as geographically linked planning feedback.</p>
      </aside>
    </div>
  );
}
