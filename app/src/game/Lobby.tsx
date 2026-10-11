// The lobby: join as a stakeholder, see who is in, and (host) fill seats with bots, pick the session
// type, then start.
import { useEffect, useState, type FormEvent } from 'react';
import { PERSONAS, PERSONA_INFO, SPRINT_MS, handOf, type PersonaId, type RoomState } from '@shared';
import { Invite } from '../room/Invite';
import type { Room } from '../room/useRoom';
import { GameCard } from './GameCard';
import { PersonaOrb } from './Players';
import { unlockAudio } from '../ui/sound';

/**
 * The chosen stakeholder's deck, fanned out like a hand held up to the light. It is a picture of the
 * deck, not a list of choices: tilted and overlapping in a tray, so it does not read as buttons.
 */
function DeckFan({ persona }: { persona: PersonaId }) {
  const cards = handOf(persona);
  const mid = (cards.length - 1) / 2;
  return (
    <div className="deck-fan" key={persona} style={{ ['--tint' as string]: PERSONA_INFO[persona].color }} role="img" aria-label={`${PERSONA_INFO[persona].name} deck`}>
      {cards.map((c, i) => (
        <GameCard
          key={c} id={c} size="lg"
          style={{ ['--w' as string]: '118px', ['--r' as string]: `${(i - mid) * 7}deg`, ['--y' as string]: `${Math.abs(i - mid) ** 2 * 2.2}px`, ['--i' as string]: i }}
        />
      ))}
    </div>
  );
}

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
          <DeckFan persona={persona} />
          <p className="max-w-[28rem] text-13 opacity-80">{PERSONA_INFO[persona].voice}</p>
        </div>
      )}
      <button className="aero-btn aero-btn-go aero-btn-lg self-start" disabled={!persona || !name.trim()}>{create ? 'Open room' : 'Join'}</button>
    </form>
  );
}

/** The whole game in four lines, for someone who has never played. */
export function HowToPlay() {
  return (
    <div className="how-to">
      <p className="vr text-18">How to play</p>
      <p className="text-13 font-semibold">Four stakeholders, one real city, three rounds. Each round:</p>
      <ol className="how-steps">
        <li><b>1 · Play a Card.</b> Pick one of your four cards, then a green area on the map.</li>
        <li><b>2 · Make a Deal.</b> See what everyone played. Support it, oppose it, or make a deal.</li>
        <li><b>3 · See What Happens.</b> Each project is approved or rejected, and the city changes.</li>
      </ol>
      <p className="text-13 font-semibold">🌀 After round 3 a storm hits. Get flood safety to 50 or the city pays. Score points for your own goals.</p>
    </div>
  );
}

const ROUND_S = Object.values(SPRINT_MS).reduce((a, b) => a + b, 0) / 1000;

/** A table opens in Beginner Mode: the host's lobby sets it once per room (Advanced is one click away). */
function useBeginnerByDefault(state: RoomState, room: Room, host: boolean) {
  useEffect(() => {
    if (!host || state.phase !== 'lobby') return;
    const key = `coastal-clash.mode-set.${state.code}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, '1');
    } catch {
      // No storage: still default once for this page.
    }
    if (state.mode !== 'beginner') room.mode('beginner');
    // Once per room.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [host, state.code]);
}

export function Lobby({ state, room }: { state: RoomState; room: Room }) {
  const me = state.you;
  const host = me !== null && me === state.hostSeat;
  useBeginnerByDefault(state, room, host);
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
              <span className="text-15 font-bold">Mode</span>
              <button type="button" className="aero-btn !py-1 text-15" aria-pressed={state.mode === 'beginner'} onClick={() => room.mode('beginner')}>🌱 Beginner (recommended)</button>
              <button type="button" className="aero-btn !py-1 text-15" aria-pressed={state.mode === 'advanced'} onClick={() => room.mode('advanced')}>Advanced</button>
            </div>
            <p className="text-15 opacity-85">
              {state.mode === 'beginner'
                ? 'Beginner: one decision a round in one place, 2–3 cards each, no points to count. Support, oppose or suggest a change. You end with a city plan.'
                : 'Advanced: every card, influence costs, deals, combos and the full game score.'}
            </p>
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
                ? `Sprint: every step has a short clock, about ${ROUND_S} seconds a round, so the match takes under four minutes. Being ready early moves on at once.`
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
          <p className="text-15">{state.mode === 'beginner' ? '🌱 Beginner Mode. ' : 'Advanced Mode. '}Waiting for the host to start ({state.pace === 'sprint' ? `sprint: about ${ROUND_S} s a round` : 'turn by turn, no clock'}). Empty seats can be filled by bots.</p>
        )}
        <HowToPlay />
      </section>
      <aside className="wet flex flex-col gap-3 p-5 lg:w-[22rem]">
        <Invite code={state.code} />
        <p className="text-13 opacity-80">Four stakeholders, three rounds, one real city. Every card you play is recorded as geographically linked planning feedback.</p>
      </aside>
    </div>
  );
}
