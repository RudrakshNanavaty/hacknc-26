// The lobby: join as a stakeholder, see who is in, and (host) fill seats with bots, pick the session
// type, then start.
import { useState, type FormEvent } from 'react';
import { PERSONAS, PERSONA_INFO, PLAN_SCENARIOS, PLAN_SPRINT_MS, districtById, type PersonaId, type RoomState } from '@shared';
import { Invite } from '../room/Invite';
import type { Room } from '../room/useRoom';
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
        <div className="flex flex-col gap-2">
          <GoalPreview persona={persona} />
          <p className="max-w-[28rem] text-13 opacity-80">{PERSONA_INFO[persona].voice}</p>
        </div>
      )}
      <button className="aero-btn aero-btn-go aero-btn-lg self-start" disabled={!persona || !name.trim()}>{create ? 'Open room' : 'Join'}</button>
    </form>
  );
}

/** What this stakeholder wants in each of the three real situations. */
function GoalPreview({ persona }: { persona: PersonaId }) {
  return (
    <ul className="goal-preview" style={{ ['--tint' as string]: PERSONA_INFO[persona].color }}>
      {PLAN_SCENARIOS.map((sc, i) => (
        <li key={sc.id}>
          <b>{i + 1} · {districtById(sc.district).name}</b>
          <span>🎯 {sc.mandates[persona].objective}</span>
        </li>
      ))}
    </ul>
  );
}

/** The whole game in four lines, for someone who has never played. */
export function HowToPlay() {
  return (
    <div className="how-to">
      <p className="vr text-18">How to play</p>
      <p className="text-13 font-semibold">Four stakeholders, three real Miami Beach fights, one plan. Each round is a true story from one area:</p>
      <ol className="how-steps">
        <li><b>1 · Play a Card.</b> Pick one of three projects. The Mayor puts one forward.</li>
        <li><b>2 · Make a Deal.</b> Support it, oppose it, or ask for one change. Then vote: three of four approve.</li>
        <li><b>3 · See What Happens.</b> Up to 6 points: your goal 0–3, your deal 0–2, a city that works 0–1.</li>
      </ol>
      <p className="text-13 font-semibold">🌀 After round 3 a storm tests the plan you built, and a simulator compares it with other plans.</p>
    </div>
  );
}

const ROUND_S = Object.values(PLAN_SPRINT_MS).reduce((a, b) => a + b, 0) / 1000;

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
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-13 font-bold">Pace</span>
              <button type="button" className="aero-btn !py-1 text-13" aria-pressed={state.pace === 'turns'} onClick={() => room.pace('turns')}>Turn by turn (no clock)</button>
              <button type="button" className="aero-btn !py-1 text-13" aria-pressed={state.pace === 'sprint'} onClick={() => room.pace('sprint')}>⏱ Sprint (~{ROUND_S} s a round)</button>
            </div>
            <p className="text-13 opacity-80">
              {state.pace === 'sprint'
                ? `Sprint: every step has a short clock, about ${ROUND_S} seconds a round, so the whole match is about two minutes. Being ready early moves on at once.`
                : 'Turn by turn: no clock. Each step moves on when everyone is ready.'}
            </p>
            <p className="text-13 opacity-80">
              {state.sessionKind === 'community'
                ? 'Community session: records are marked as real community participants in the Civic Atlas.'
                : 'Demo session: records are marked as demonstration participants, kept apart from community input.'}
            </p>
            <button type="button" className="aero-btn aero-btn-go aero-btn-lg self-start pulse" onClick={() => { unlockAudio(); room.start(); }}>
              Start the session ▶
            </button>
          </div>
        ) : (
          <p className="text-15">Waiting for the host to start ({state.pace === 'sprint' ? `sprint: about ${ROUND_S} s a round` : 'turn by turn, no clock'}). Empty seats can be filled by bots.</p>
        )}
        <HowToPlay />
      </section>
      <aside className="wet flex flex-col gap-3 p-5 lg:w-[22rem]">
        <Invite code={state.code} />
        <p className="text-13 opacity-80">Four stakeholders, three rounds, one real city. Your choices are recorded as geographically linked planning feedback, kept apart from what you say you would personally prefer. Empty seats are filled by bots.</p>
      </aside>
    </div>
  );
}
