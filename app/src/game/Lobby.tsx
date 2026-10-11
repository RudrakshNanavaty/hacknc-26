// The lobby: join as a stakeholder, see who is in, and (host) fill seats with bots, pick the session
// type, then start.
import { useState, type FormEvent } from 'react';
import { PERSONAS, PERSONA_INFO, PLAN_SCENARIOS, districtById, type PersonaId, type RoomState } from '@shared';
import { Invite } from '../room/Invite';
import type { Room } from '../room/useRoom';
import { Stakeholder } from '../ui/Stakeholder';
import { unlockAudio } from '../ui/sound';

function PersonaPicker({ taken, value, onPick }: { taken: Map<PersonaId, { bot: boolean }>; value: PersonaId | null; onPick: (p: PersonaId) => void }) {
  return (
    <div className="stakeholder-grid">
      {PERSONAS.map((id) => {
        const p = PERSONA_INFO[id];
        const t = taken.get(id);
        const blocked = !!t && !t.bot;
        return (
          <button
            key={id} type="button" disabled={blocked} onClick={() => onPick(id)} aria-pressed={value === id}
            className={`persona-pick ${value === id ? 'is-on' : ''}`} style={{ ['--tint' as string]: p.color }}
          >
            <Stakeholder persona={id}>
              <span className="block">{p.goal}</span>
              {t && <span className="mt-1 block text-[12px] font-bold text-aqua-deep">{t.bot ? 'A bot is playing: take its seat' : 'Taken'}</span>}
              {value === id && <span className="stakeholder-selected">✓ Selected</span>}
            </Stakeholder>
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
    // Shared pre-game layout: identity on the left, stakeholder goals on the right.
    <form onSubmit={submit} className="wet join-panel">
      <h1 className="screen-title join-title">{create ? 'Open the council chamber' : 'Take a seat at the table'}</h1>
      <div className="join-main">
        <label className="flex flex-col gap-1 font-bold">
          Your name
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={20} autoFocus className="aero-input" placeholder="e.g. Sam" />
        </label>
        <fieldset>
          <legend className="mb-2 font-bold">Pick your stakeholder</legend>
          <PersonaPicker taken={taken} value={persona} onPick={setPersona} />
        </fieldset>
      </div>
      <div className="join-side">
        {persona && (
          <div className="flex flex-col gap-2">
            <p className="join-label">Playing as the {PERSONA_INFO[persona].name}</p>
            <GoalPreview persona={persona} />
            <p className="text-13 opacity-80">{PERSONA_INFO[persona].voice}</p>
          </div>
        )}
        <button className="aero-btn aero-btn-go aero-btn-lg join-go" disabled={!persona || !name.trim()}>{create ? 'Open room' : 'Join'}</button>
      </div>
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
      <h3 className="section-title">How to play</h3>
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

export function Lobby({ state, room }: { state: RoomState; room: Room }) {
  const me = state.you;
  const host = me !== null && me === state.hostSeat;
  const taken = new Map(state.players.map((p) => [p.persona, p]));
  return (
    <div className="lobby-layout">
      <section className="wet lobby-players">
        <div><p className="eyebrow">Your multiplayer room</p><h1 className="screen-title">The council is assembling</h1></div>
        <ul className="stakeholder-grid">
          {PERSONAS.map((id) => {
            const p = taken.get(id);
            const info = PERSONA_INFO[id];
            return (
              <li key={id} className={`persona-slot${p && p.seat === me ? ' is-on' : ''}`} style={{ ['--tint' as string]: info.color }}>
                <Stakeholder persona={id} dim={!p}>
                  {p ? `${p.name}${p.seat === me ? ' (you)' : ''}${p.bot ? '' : !p.connected ? ' · offline' : ''}` : 'Open seat'}
                </Stakeholder>
                {host && (!p || p.bot) && (
                  <button type="button" className="aero-btn aero-btn-sm" aria-label={`${p ? 'Remove bot from' : 'Add bot to'} ${info.name}`} onClick={() => room.bot(id, !p)}>
                    {p ? 'Remove bot' : '+ Bot'}
                  </button>
                )}
                {!host && me !== null && !p && (
                  <button type="button" className="aero-btn aero-btn-sm" aria-label={`Switch to ${info.name}`} onClick={() => room.persona(id)}>Switch</button>
                )}
              </li>
            );
          })}
        </ul>
        {host ? (
          <div className="flex flex-col gap-3">
            <button type="button" className="aero-btn aero-btn-go aero-btn-lg self-start" onClick={() => { unlockAudio(); room.start(); }}>
              Start the session ▶
            </button>
          </div>
        ) : (
          <p className="text-15">Waiting for the host to start. Empty seats are filled by bots.</p>
        )}
      </section>
      <aside className="wet lobby-invite">
        <h2 className="section-title">Bring your council together</h2>
        <Invite code={state.code} />
      </aside>
      <section className="wet lobby-guide">
        <HowToPlay />
        <p className="text-13 opacity-80">Four stakeholders, three rounds, one real city. Your choices are recorded as geographically linked planning feedback, kept apart from what you say you would personally prefer. Empty seats are filled by bots.</p>
      </section>
    </div>
  );
}
