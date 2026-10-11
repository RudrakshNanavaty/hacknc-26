// The end of a round and the end of the match, floating over the map. The round's result sits at
// the side so the verdict stamps and blooms on the areas stay in view; the podium takes the center.
import { useMemo, useState } from 'react';
import {
  INDICATORS, INDICATOR_INFO, PERSONA_INFO, PREFERENCE_QUESTION, PROJECTS, districtById,
  type Delta, type Outcome, type Proposal, type RoomState, type RuleEvent,
} from '@shared';
import type { Room } from '../room/useRoom';
import { Link } from '../router';
import { explain } from '../api';
import { ComboBanners, Recap, WhyButton } from './insights';
import { RoundDots, Soap, Tube } from './ui';
import { STATUS_STYLE } from './format';

const placeName = (id: string) => districtById(id).name;
const proposalName = (p: Proposal) => `${PROJECTS[p.kind].name}`;
const who = (state: RoomState, seat: number) => state.players.find((p) => p.seat === seat);

function Blooms({ delta }: { delta: Delta }) {
  const keys = INDICATORS.filter((k) => delta[k]);
  return (
    <div className="flex flex-wrap justify-center gap-x-4 gap-y-1">
      {keys.map((k, i) => (
        <span key={k} className="glow-num bloom !text-[40px]" style={{ animationDelay: `${0.25 + i * 0.15}s` }}>
          {delta[k]! > 0 ? '+' : '−'}{Math.abs(delta[k]!)}<span className="text-[26px]">{INDICATOR_INFO[k].icon}</span>
        </span>
      ))}
    </div>
  );
}

function Rule({ e }: { e: RuleEvent }) {
  return <li className="flex gap-2 text-[12px] leading-snug"><span className="lchip lchip-aqua !px-2 !py-0">{e.rule}</span><span>{e.text}</span></li>;
}

function OutcomeCard({ o, state, events, i }: { o: Outcome; state: RoomState; events: RuleEvent[]; i: number }) {
  const [open, setOpen] = useState(false);
  const owner = PERSONA_INFO[o.persona];
  return (
    <div className="wet flex flex-col gap-2 p-3">
      <div className="flex items-center gap-3">
        <Soap size={72} tint={owner.color}>{PROJECTS[o.kind].marker}</Soap>
        <div className="min-w-0 flex-1">
          <p className="vr text-18 leading-tight">{PROJECTS[o.kind].name}</p>
          <p className="text-13 font-semibold">{placeName(o.district)} · {who(state, o.seat)?.name}</p>
          <p className="text-[12px] font-semibold opacity-80">{o.support} support vs {o.opposition - o.ignored} opposition</p>
        </div>
        <span className={`verdict-pill ${o.status} stamp-in relative ${o.status === 'approved' ? 'sparkle' : ''}`} style={{ animationDelay: `${0.2 + i * 0.3}s` }}>{STATUS_STYLE[o.status].label}{o.status === 'approved' ? '!' : ''}</span>
      </div>
      {o.status === 'approved' && <Blooms delta={o.delta} />}
      {o.conditions.length > 0 && <p className="flex flex-wrap gap-1">{o.conditions.map((c) => <span key={c} className="lchip lchip-sun">🤝 {c}</span>)}</p>}
      <button type="button" className="self-start text-[12px] font-black text-[#7fd6ff] underline" onClick={() => setOpen(!open)}>{open ? 'Hide' : 'Show'} the rules that decided it</button>
      {open && <ol className="flex flex-col gap-1">{o.rules.map((id) => events.find((e) => e.id === id)).filter(Boolean).map((e) => <Rule key={e!.id} e={e!} />)}</ol>}
      {open && <WhyButton label="Explain in plain words" ask={() => explain({ kind: 'outcome', code: state.code, proposalId: o.proposalId })} />}
    </div>
  );
}

function ResultScreen({ state, host, onNext }: { state: RoomState; host: boolean; onNext: () => void }) {
  const last = state.history[state.history.length - 1];
  if (!last) return null;
  const r = last.resolution;
  const loose = r.events.filter((e) => !r.outcomes.some((o) => o.rules.includes(e.id)));
  return (
    <div className="flex flex-col gap-3">
      <div className="roundline"><span>Round {state.round} of {state.totalRounds} <RoundDots round={state.round} total={state.totalRounds} /></span></div>
      <h2 className="glow-title">The city changes</h2>
      {r.outcomes.map((o, i) => <OutcomeCard key={o.proposalId} o={o} state={state} events={r.events} i={i} />)}
      <ComboBanners combos={r.combos ?? []} />
      {loose.length > 0 && <ol className="frost flex flex-col gap-1 p-3">{loose.map((e) => <Rule key={e.id} e={e} />)}</ol>}
      <p className="text-center text-[12px] font-bold opacity-80">Effects are illustrative scenario values. The geography (zoning, FEMA zones) and the live readings are real.</p>
      {host ? <div className="anchor-foot"><button type="button" className="gel gel-lime gel-big" onClick={onNext}>{state.round < state.totalRounds ? 'Next round ▶' : 'See who won ▶'}</button></div>
        : <p className="text-center text-13 font-black">The next round starts when the clock runs out.</p>}
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
          {answered && <p className="text-13 font-black text-[#b6f07a]">Thanks: recorded for the planners.</p>}
        </div>
      )}
      <Link to={`/studio${state.matchId ? `?match=${state.matchId}` : ''}`} className="gel gel-lime gel-big">Open Planning Studio →</Link>
      {host && <button type="button" className="gel" onClick={() => room.again()}>New match</button>}
    </div>
  );
}

export function ResultOverlay({ state, room }: { state: RoomState; room: Room }) {
  const host = state.you !== null && state.you === state.hostSeat;
  if (state.phase === 'resolve') {
    return <aside className="float-card side-float flex flex-col gap-3" aria-label="Round result"><ResultScreen state={state} host={host} onNext={room.skip} /></aside>;
  }
  if (state.phase === 'final') {
    return (
      <div className="final-scrim">
        <section className="float-card final-float flex flex-col gap-3" aria-label="Match result"><FinalScreen state={state} room={room} /></section>
      </div>
    );
  }
  return null;
}
