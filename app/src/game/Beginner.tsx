// Beginner Mode's screens. One conflict a round, so each screen has one thing on it:
//   the conflict (what is documented, kept apart from what the game simulates, and the decision on the table),
//   your 2-3 cards (each says what it does to that decision; the place is already chosen),
//   the end (is the city viable, did it survive the storm, whose goals were met, one personal question, the plan).
// Text sizes come from the four Beginner tokens in styles.css (--t-small, --t-body, --t-key, --t-title).
import { useState } from 'react';
import {
  CARDS, PERSONA_INFO, PROJECTS, START_INDICATORS, beginnerEnd, beginnerHand, cardName, districtById, keyDecision, personalQuestion, simpleCard,
  type CardId, type Conflict, type RoomState,
} from '@shared';
import type { Room } from '../room/useRoom';
import { Link } from '../router';
import { CardArt } from './CardArt';
import { SourceChips } from './story';
import { playDeal } from '../ui/sound';

const placeName = (id: string) => districtById(id).name;
const ownerName = (state: RoomState, c: Conflict) => state.players.find((p) => p.persona === c.owner)?.name ?? PERSONA_INFO[c.owner].name;

/** Where the round's facts come from, said plainly. */
function Provenance({ c }: { c: Conflict }) {
  const s = c.crisis.story;
  if (c.source === 'story' && s) {
    return (
      <div className="bm-fact">
        <p className="bm-label">📰 Documented · real Miami Beach story</p>
        <p className="bm-key">{s.title} <span className="bm-small">({s.years})</span></p>
        <details>
          <summary className="bm-small">What happened, and the sources</summary>
          <p className="bm-body">{c.crisis.text}</p>
          <SourceChips sources={s.sources} max={6} />
        </details>
      </div>
    );
  }
  return (
    <div className="bm-fact is-fiction">
      <p className="bm-label">{c.source === 'scenario' ? '📡 Scenario from today’s tide and forecast · not a documented event' : '🎲 Authored scenario · not a real event'}</p>
      <p className="bm-key">{c.crisis.title}</p>
    </div>
  );
}

/** The conflict: one place, one project, who proposes it, and what it would do (simulated). */
export function ConflictCard({ state }: { state: RoomState }) {
  const c = state.conflict;
  if (!c) return null;
  const s = simpleCard(c.card);
  const mine = state.players.find((p) => p.seat === state.you)?.persona === c.owner;
  return (
    <aside className="float-card side-float bm bm-panel" aria-label="This round's conflict">
      <p className="bm-label">Round {state.round} of {state.totalRounds} · 📍 {placeName(c.district)}</p>
      <Provenance c={c} />
      <div className="bm-decision">
        <p className="bm-label">🗳️ The decision</p>
        <p className="bm-title">{mine ? 'You propose' : `${ownerName(state, c)} proposes`}: {PROJECTS[c.project].marker} {PROJECTS[c.project].name}</p>
        <p className="bm-label">If it is built · simulated, illustrative</p>
        <ul className="bm-list">
          {s.good.map((g) => <li key={g} className="is-good">✅ {g}</li>)}
          {s.bad.map((b) => <li key={b} className="is-bad">⚠️ {b}</li>)}
          {s.money && <li className="is-money">💲 {s.money}</li>}
        </ul>
      </div>
    </aside>
  );
}

/** Your cards this round: big, few, each aimed at the conflict. The proposer has nothing to pick. */
export function BeginnerHand({ state, room }: { state: RoomState; room: Room }) {
  const c = state.conflict;
  const me = state.players.find((p) => p.seat === state.you);
  // Pressed this round (keyed by round, so a card dealt again later is playable again).
  const [busy, setBusy] = useState<string | null>(null);
  if (!c || !me || state.phase !== 'select') return null;
  const locked = state.mine?.selection ?? null;
  if (me.persona === c.owner) {
    return <div className="bm bm-tray"><p className="bm-key bm-note">Your {PROJECTS[c.project].name.toLowerCase()} is on the table. The others are choosing how to answer it.</p></div>;
  }
  const project = PROJECTS[c.project].name.toLowerCase();
  return (
    <div className="bm bm-tray" role="group" aria-label="Your cards">
      {beginnerHand(me.persona, c).map((id) => {
        const card = CARDS[id];
        const s = simpleCard(id);
        const onIt = (card.acts ?? []).includes(c.project);
        const role = card.project ? `Another project for ${placeName(c.district)}` : card.category === 'support' ? `👍 For the ${project}` : card.category === 'opposition' ? `👎 Against the ${project}` : `🤝 A condition on the ${project}`;
        const isLocked = locked?.card === id;
        return (
          <article key={id} className={`bm-card tone-${card.category} ${isLocked ? 'is-locked' : ''} ${locked && !isLocked ? 'is-off' : ''}`}>
            <CardArt id={id} className="bm-art" />
            <p className="bm-label">{role}</p>
            <p className="bm-key">{cardName(id, state.crisis)}</p>
            <p className="bm-body is-good">✅ {s.good[0]}</p>
            <p className="bm-small is-bad">⚠️ {s.bad[0]}</p>
            {!onIt && !card.project && <p className="bm-small">Nothing for it to act on here: {card.fallback?.text}</p>}
            {isLocked ? <p className="bm-key">🔒 Played</p> : (
              <button
                type="button" className="gel gel-lime bm-play" disabled={!!locked || busy === `${state.round}-${id}`}
                onClick={() => {
                  setBusy(`${state.round}-${id}`);
                  playDeal();
                  room.select(id, c.district);
                }}
              >
                Play this card
              </button>
            )}
          </article>
        );
      })}
    </div>
  );
}

/** The end: the city, the storm, each stakeholder's goal, one personal question, and the plan. */
export function BeginnerFinal({ state, room }: { state: RoomState; room: Room }) {
  const f = state.final;
  const [answer, setAnswer] = useState<'yes' | 'no' | 'unsure' | null>(null);
  if (!f) return null;
  const rounds = state.history.map((h) => h.resolution);
  const end = beginnerEnd(START_INDICATORS, state.city.indicators, rounds, state.players.map((p) => p.persona));
  const me = state.players.find((p) => p.seat === state.you);
  const key = keyDecision(state.history);
  const host = state.you !== null && state.you === state.hostSeat;
  const ranked = [...f.scores].sort((a, b) => b.total - a.total);
  const plan = state.matchId ? `/plan/${state.matchId}` : null;
  return (
    <div className="bm flex flex-col gap-3">
      <p className="bm-label">Miami Beach after {state.totalRounds} rounds</p>
      <h2 className="bm-hero">{end.viable ? '🏙️ The city is viable' : '⚠️ The city is in trouble'}</h2>
      {!end.viable && <p className="bm-body">Below the safe line of 30: {end.failing.join(', ')}.</p>}
      {end.storm && (
        <p className={`bm-key bm-storm ${end.storm.held ? 'is-good' : 'is-bad'}`}>
          🌀 {end.storm.held ? `The storm hit and the city held (flood safety ${end.storm.flood}).` : `The storm flooded the streets: −${end.storm.loss} jobs & business (flood safety ${end.storm.flood}, needed 50).`}
        </p>
      )}
      <ul className="bm-goals">
        {end.goals.map((g) => {
          const p = state.players.find((x) => x.persona === g.persona);
          return (
            <li key={g.persona} className={g.achieved ? 'is-good' : 'is-bad'}>
              <span className="bm-key">{g.achieved ? '✅' : '❌'} {PERSONA_INFO[g.persona].name}{p ? (p.bot ? ' (bot)' : ` (${p.name}${p.seat === state.you ? ', you' : ''})`) : ''}: {g.goal}</span>
              <span className="bm-small">{g.line}</span>
            </li>
          );
        })}
      </ul>
      {me && key && (
        <div className="bm-question">
          <p className="bm-label">One question, for you · optional</p>
          <p className="bm-key">{personalQuestion(key, me.persona)}</p>
          <div className="flex flex-wrap gap-2">
            {(['yes', 'no', 'unsure'] as const).map((s) => (
              <button key={s} type="button" className={`gel ${answer === s ? 'gel-lime' : ''}`} onClick={() => { setAnswer(s); room.respond(key.proposalId, s); }}>
                {s === 'yes' ? 'Yes' : s === 'no' ? 'No' : 'Not sure'}
              </button>
            ))}
          </div>
          <p className="bm-small">Your own view, not your character’s. Saved apart from the game, for the planners in the Civic Atlas.</p>
          {answer && <p className="bm-body is-good">Thanks: saved.</p>}
        </div>
      )}
      {plan && <Link to={plan} className="gel gel-lime gel-big">📍 Open your city plan</Link>}
      <details className="bm-small">
        <summary>Game scoring (Advanced points, not part of Beginner Mode)</summary>
        <ol className="bm-small mt-1">{ranked.map((s) => <li key={s.persona}>{PERSONA_INFO[s.persona].name}: {s.total} points</li>)}</ol>
      </details>
      <div className="flex flex-wrap gap-2">
        <Link to={`/atlas${state.matchId ? `?match=${state.matchId}#matches` : ''}`} className="gel">Civic Atlas</Link>
        {state.matchId && <Link to={`/verify/${state.matchId}`} className="gel">Verify on Solana</Link>}
        {host && <button type="button" className="gel" onClick={() => room.again()}>New match</button>}
      </div>
    </div>
  );
}
