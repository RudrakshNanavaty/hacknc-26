// The end of a round and the end of the match, floating over the map. The round's result sits at the
// side so the verdict stamps on the areas stay in view: one plain sentence per project (status, main
// upside and downside, money, one reason), with the rules, other effects and sources under More.
// The podium takes the center.
import { useMemo, useState } from 'react';
import {
  INDICATORS, INDICATOR_INFO, PERSONA_INFO, PREFERENCE_QUESTION, PROJECTS, STORM_TEST, districtById,
  type Delta, type Outcome, type Proposal, type RoomState, type RuleEvent,
} from '@shared';
import type { Room } from '../room/useRoom';
import { Link } from '../router';
import { explain } from '../api';
import { ComboBanners, Recap, WhyButton } from './insights';
import { RoundDots, Soap, Tube } from './ui';
import { STATUS_STYLE } from './format';
import { ReadyBar } from './Turn';
import { EvidenceStrip, SourceChips, Verification } from './story';
import { outcomeSentence, stormOf } from './Climax';
import { BeginnerFinal } from './Beginner';
import { plainText } from './format';

const placeName = (id: string) => districtById(id).name;
const proposalName = (p: Proposal) => `${PROJECTS[p.kind].name}`;
const who = (state: RoomState, seat: number) => state.players.find((p) => p.seat === seat);

function Rule({ e }: { e: RuleEvent }) {
  return <li className="flex gap-2 text-[12px] leading-snug"><span className="lchip lchip-aqua !px-2 !py-0">{e.rule}</span><span>{e.text}</span></li>;
}

function OutcomeCard({ o, state, events }: { o: Outcome; state: RoomState; events: RuleEvent[] }) {
  const [open, setOpen] = useState(false);
  const line = outcomeSentence(o);
  return (
    <div className={`result-row is-${o.status}`}>
      <p className="vr text-[17px] leading-tight">{line.head}</p>
      <p className="text-13 font-black">{line.effect}</p>
      <p className="text-[12px] font-semibold opacity-85">{line.reason} <span className="opacity-70">· {placeName(o.district)}, {who(state, o.seat)?.name}</span></p>
      {o.conditions.length > 0 && <p className="flex flex-wrap gap-1">{o.conditions.map((c) => <span key={c} className="lchip lchip-sun">🤝 {c}</span>)}</p>}
      <button type="button" className="self-start text-[12px] font-black text-[#0a6f9a] underline" onClick={() => setOpen(!open)}>{open ? 'Hide' : 'Show'} the rules</button>
      {open && <ol className="flex flex-col gap-1">{o.rules.map((id) => events.find((e) => e.id === id)).filter(Boolean).map((e) => <Rule key={e!.id} e={e!} />)}</ol>}
      {open && <WhyButton label="Explain in plain words" ask={() => explain({ kind: 'outcome', code: state.code, proposalId: o.proposalId })} />}
    </div>
  );
}

function ResultScreen({ state, room }: { state: RoomState; room: Room }) {
  const last = state.history[state.history.length - 1];
  if (!last) return null;
  const r = last.resolution;
  const storm = stormOf(state);
  const loose = r.events.filter((e) => !r.outcomes.some((o) => o.rules.includes(e.id)) && e.rule !== 'S9');
  const built = r.outcomes.filter((o) => o.status === 'approved').length;
  return (
    <div className="flex flex-col gap-3">
      <h2 className="glow-title !text-[24px]">Round {state.round}: {r.outcomes.length ? `${built} of ${r.outcomes.length} approved` : 'no projects'}</h2>
      {storm && (
        <div className="storm-banner">
          <span className="text-[30px]">🌀</span>
          <div>
            <p className="vr text-16">{storm.held ? 'The storm hit. The city held!' : `The storm hit: −${storm.loss} jobs & business`}</p>
            <p className="text-13 font-semibold opacity-90">Flood safety {storm.flood}, {storm.flood >= STORM_TEST.threshold ? 'enough' : 'short of'} the {STORM_TEST.threshold} needed.</p>
          </div>
        </div>
      )}
      {r.outcomes.map((o) => <OutcomeCard key={o.proposalId} o={o} state={state} events={r.events} />)}
      <ComboBanners combos={r.combos ?? []} />
      <details className="frost p-2 text-13">
        <summary className="cursor-pointer font-black">More: other effects{state.crisis?.story ? ', the real story' : ''}</summary>
        <div className="mt-2 flex flex-col gap-2">
          {loose.length > 0 && <ol className="flex flex-col gap-1">{loose.map((e) => <Rule key={e.id} e={e} />)}</ol>}
          {state.crisis && <EvidenceStrip crisis={state.crisis} />}
          <p className="text-[12px] font-bold opacity-80">Effects are illustrative scenario values. The geography (zoning, FEMA zones) and the live readings are real.</p>
        </div>
      </details>
      <div className="anchor-foot"><ReadyBar state={state} room={room} label={state.round < state.totalRounds ? 'Next round ▶' : 'See who won ▶'} /></div>
    </div>
  );
}

// ---------- Final ----------

function FinalScreen({ state, room }: { state: RoomState; room: Room }) {
  const f = state.final;
  const host = state.you !== null && state.you === state.hostSeat;
  const proposals = useMemo(() => {
    const seen = new Map<string, Proposal>();
    for (const h of state.history) for (const p of h.board.proposals) if (!seen.has(p.id)) seen.set(p.id, p);
    return [...seen.values()];
  }, [state.history]);
  if (!f) return null;
  const ranked = [...f.scores].sort((a, b) => b.total - a.total);
  const best = Math.max(1, ...ranked.map((s) => s.total));
  const winner = ranked[0]!;
  const wp = state.players.find((p) => p.persona === winner.persona);
  const answered = state.mine?.responded ?? null;
  return (
    <div className="flex flex-col gap-3">
      <div className="roundline"><span>Session over <RoundDots round={3} total={3} /></span><span className={`lchip ${f.viable ? 'lchip-lime' : 'lchip-coral'}`}>{f.viable ? 'City viable' : 'City in trouble'}</span></div>
      <div className="wet flex flex-col items-center gap-2 p-4 text-center">
        <Soap size={140} tint={PERSONA_INFO[winner.persona].color} className="bob">{PERSONA_INFO[winner.persona].emoji}</Soap>
        <span className="verdict-pill approved stamp-in sparkle relative">🏆 Winner{f.winners.length > 1 ? 's' : ''}</span>
        <h2 className="glow-title">{f.winners.map((w) => state.players.find((p) => p.persona === w)?.name ?? w).join(' & ')}</h2>
        <p className="text-15 font-bold">{wp ? `as the ${PERSONA_INFO[winner.persona].name}` : ''} · {winner.total} points</p>
      </div>
      <Recap state={state} />
      {state.history.some((h) => h.board.crisis.story) && (
        <div className="frost flex flex-col gap-2 p-3">
          <p className="vr text-18">The real stories behind this match</p>
          {state.history.map((h) => h.board.crisis.story && (
            <div key={h.round} className="flex flex-col gap-1">
              <p className="text-15 font-black">Round {h.round}: {h.board.crisis.story.title} <span className="font-semibold opacity-75">({h.board.crisis.story.years})</span></p>
              <Verification story={h.board.crisis.story} detail />
              <SourceChips sources={h.board.crisis.story.sources} max={8} />
            </div>
          ))}
          <p className="text-[11px] opacity-70">Facts are as reported by the linked sources. Effects in the game are illustrative.</p>
        </div>
      )}
      {ranked.map((s) => {
        const p = state.players.find((x) => x.persona === s.persona);
        return (
          <details key={s.persona}>
            <summary className="list-none cursor-pointer">
              <Tube tone={f.winners.includes(s.persona) ? 'lime' : 'aqua'} value={Math.max(0, s.total)} max={best} label={<span className="vr">{PERSONA_INFO[s.persona].emoji} {p?.name}</span>} right={s.total} />
            </summary>
            <ul className="frost mt-1 p-2 text-[12px] font-semibold">{s.parts.map((x) => <li key={x.label}>{x.points >= 0 ? '+' : ''}{x.points} · {x.label}</li>)}</ul>
          </details>
        );
      })}
      {state.you !== null && (
        <div className="frost flex flex-col gap-2 p-3">
          <p className="vr text-18">One honest question</p>
          <p className="text-15 font-bold">{PREFERENCE_QUESTION}</p>
          <p className="text-[12px] opacity-75">Optional. Stored apart from your role-play, marked as {state.sessionKind === 'community' ? 'a community participant' : 'a demo participant'}.</p>
          {proposals.map((p) => (
            <button key={p.id} type="button" className={`gel gel-sm justify-start ${answered === p.id ? 'gel-lime' : ''}`} onClick={() => room.respond(p.id)}>
              {PROJECTS[p.kind].marker} {proposalName(p)}, {placeName(p.district)}
            </button>
          ))}
          <button type="button" className={`gel gel-sm justify-start ${answered === 'none' ? 'gel-lime' : ''}`} onClick={() => room.respond('none')}>None of these</button>
          {answered && <p className="text-13 font-black text-[#2f7a0e]">Thanks: recorded for the planners.</p>}
        </div>
      )}
      <Link to={`/atlas${state.matchId ? `?match=${state.matchId}#matches` : ''}`} className="gel gel-lime gel-big">Open the Civic Atlas</Link>
      {state.matchId && <Link to={`/verify/${state.matchId}`} className="gel">Verify this match on Solana</Link>}
      {host && <button type="button" className="gel" onClick={() => room.again()}>New match</button>}
    </div>
  );
}

export function ResultOverlay({ state, room, hidden = false }: { state: RoomState; room: Room; hidden?: boolean }) {
  if (state.phase === 'resolve') {
    if (hidden) return null;
    return <aside className="float-card side-float flex flex-col gap-3" aria-label="Round result"><ResultScreen state={state} room={room} /></aside>;
  }
  if (state.phase === 'final') {
    return (
      <div className="final-scrim">
        <section className="float-card final-float flex flex-col gap-3" aria-label="Match result">{state.mode === 'beginner' ? <BeginnerFinal state={state} room={room} /> : <FinalScreen state={state} room={room} />}</section>
      </div>
    );
  }
  return null;
}
