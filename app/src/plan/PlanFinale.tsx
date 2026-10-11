// The finale: YOUR MIAMI BEACH PLAN. What the table built in three real places, who backed it, who was
// left unhappy, what it costs, and how the simulator rates it against other feasible plans in three
// futures. The simulator ranks plans on illustrative effect sizes and real tide levels and FEMA flood-zone
// shares: it is not a flood forecast, and it does not say which plan is right.
import { useMemo, useState } from 'react';
import {
  ASSUMPTIONS, FUTURES, MODEL, PERSONA_INFO, PLAN_SCENARIOS, SIM_DISCLAIMER, alternatives, amendmentOf, beatsShare, configCost, districtById, divergence, optionOf, planOutcome, stormResult,
  type FutureId, type PlanOutcome, type RoomState,
} from '@shared';
import { Link } from '../router';
import type { Room } from '../room/useRoom';
import { FaceOrb } from '../game/Players';
import { Sources, describe, nameOf } from './bits';

const FUTURE_SHORT: Record<FutureId, string> = { ordinary: 'Ordinary', 'high-tide-rain': 'High tide + rain', extreme: 'Extreme' };

function Bar({ value, max = 100, tone }: { value: number; max?: number; tone: 'flood' | 'access' | 'cost' }) {
  return (
    <span className={`sim-bar tone-${tone}`}>
      <i style={{ width: `${Math.min(100, (value / max) * 100)}%` }} />
      <b>{value}</b>
    </span>
  );
}

function PlanRow({ title, why, o, future, mine }: { title: string; why?: string; o: PlanOutcome; future: FutureId; mine?: boolean }) {
  const f = o.byFuture.find((x) => x.future === future)!;
  return (
    <li className={`sim-row ${mine ? 'is-mine' : ''}`}>
      <div className="min-w-0">
        <p className="vr text-[15px] leading-tight">{title}</p>
        {why && <p className="text-[12px] font-bold opacity-75">{why}</p>}
        <p className="sim-plan">{PLAN_SCENARIOS.map((sc, i) => <span key={sc.id} className="lchip">{districtById(sc.district).name}: {describe(sc, o.plan[i]!)}</span>)}</p>
      </div>
      <div className="sim-bars">
        <label>Flood exposure <small>lower is better</small><Bar value={f.flood} tone="flood" /></label>
        <label>Public access <small>higher is better</small><Bar value={f.access} tone="access" /></label>
        <label>Cost <small>of {PLAN_SCENARIOS.length * 10} units</small><Bar value={o.cost} max={30} tone="cost" /></label>
        {!o.feasible && <small className="sim-warn">Not every area went ahead, so this plan is incomplete.</small>}
      </div>
    </li>
  );
}

export function PlanFinale({ state, room, onClose }: { state: RoomState; room: Room; onClose: () => void }) {
  const plan = state.plan!;
  const final = plan.final!;
  const [future, setFuture] = useState<FutureId>('extreme');
  const mine = useMemo(() => planOutcome(final.plan), [final.plan]);
  const alts = useMemo(() => alternatives(), []);
  const storm = stormResult(mine);
  const beats = Math.round(beatsShare(mine) * 100);
  const diverge = useMemo(() => divergence(final.plan, plan.personal ?? {}), [final.plan, plan.personal]);
  const host = state.you !== null && state.you === state.hostSeat;
  const spent = plan.rounds.reduce((s, r) => s + r.cost, 0);
  const best = Math.max(...final.totals.map((t) => t.total));
  return (
    <div className="plan-finale" role="dialog" aria-label="Your Miami Beach plan">
      <div className="plan-finale-card float-card">
        <button type="button" className="hint-x plan-close" onClick={onClose} aria-label="Show the map">✕</button>
        <p className="plan-kicker">Three real places · three real fights</p>
        <h1 className="vr plan-finale-title">Your Miami Beach plan</h1>
        <p className={`plan-storm ${storm.held ? 'is-good' : 'is-bad'}`}>
          {storm.held ? '🛡️ In the extreme-flood future this plan holds' : '🌊 In the extreme-flood future this plan does not hold'} <small>(modelled exposure {storm.exposure}, limit {storm.limit})</small>
        </p>

        <section className="plan-areas">
          {plan.rounds.map((r) => {
            const sc = PLAN_SCENARIOS.find((s) => s.id === r.scenarioId)!;
            const yes = Object.entries(r.votes).filter(([, v]) => v).map(([s]) => Number(s));
            const no = state.players.map((p) => p.seat).filter((s) => !yes.includes(s));
            const unhappy = r.scores.filter((s) => s.mandate === 0).map((s) => s.seat);
            return (
              <article key={r.round} className={`plan-area is-${r.verdict}`}>
                <p className="plan-kicker">{districtById(r.district).name} · round {r.round}</p>
                <h2 className="vr text-[20px] leading-tight">{r.verdict === 'approved' ? optionOf(sc, r.adopted.option)?.name : sc.statusQuo.name}</h2>
                <p className="text-[13px] font-bold opacity-80">{sc.title}</p>
                <p className={`verdict-pill ${r.verdict === 'approved' ? 'approved' : r.verdict === 'delayed' ? 'delayed' : 'rejected'}`}>{r.verdict === 'no-money' ? 'No money' : r.verdict}</p>
                {r.accepted && r.verdict === 'approved' && <p className="text-[13px] font-black">🤝 {amendmentOf(sc, r.accepted.amendment)?.name} <small>(asked by {nameOf(state, r.accepted.bySeat)})</small></p>}
                <p className="text-[13px] font-bold">💲 {r.verdict === 'approved' ? r.cost : 0} of {r.budget} units</p>
                <p className="text-[12px] font-bold">👍 {yes.map((s) => nameOf(state, s)).join(', ') || 'nobody'}</p>
                {no.length > 0 && <p className="text-[12px] font-bold">👎 {no.map((s) => nameOf(state, s)).join(', ')}</p>}
                {r.blockedBy && <p className="warn-line">🚧 {r.blockedBy}</p>}
                {r.verdict === 'approved' && unhappy.length > 0 && (
                  <p className="text-[12px] font-bold opacity-85">Unresolved: {unhappy.map((s) => `${PERSONA_INFO[state.players.find((p) => p.seat === s)!.persona].name} ("${sc.mandates[state.players.find((p) => p.seat === s)!.persona].objective}")`).join('; ')}</p>
                )}
                <Sources sc={sc} />
              </article>
            );
          })}
        </section>

        <section className="plan-totals">
          <p className="vr text-[17px]">💲 {spent} of {plan.rounds.length * 10} units committed <small>(illustrative)</small></p>
          <ul>
            {[...final.totals].sort((a, b) => b.total - a.total).map((t) => (
              <li key={t.seat} className={t.total === best ? 'is-win' : ''}>
                <FaceOrb persona={t.persona} size={36} />
                <span className="min-w-0 flex-1"><b>{nameOf(state, t.seat)}</b> <small>{PERSONA_INFO[t.persona].name}</small></span>
                <span className="plan-pts" title="Goal · Deal · City, added over three rounds">🎯<i>{t.mandate}</i> 🤝<i>{t.deal}</i> 🏙️<i>{t.feasibility}</i> = <b>{t.total}</b> of 18</span>
                {t.total === best && <span className="lchip lchip-sun">🏆</span>}
              </li>
            ))}
          </ul>
          <p className="text-[12px] font-bold opacity-75">🎯 Goal: the plan gave your role what it wanted (0–3 a round) · 🤝 Deal: your requested change got in (0–2) · 🏙️ City: the plan was approved, affordable and allowed (0–1). A game design convention, not a measured score.</p>
        </section>

        <section className="plan-sim">
          <p className="vr text-[18px]">🧪 How the model rates it</p>
          <div className="plan-chips" role="tablist">
            {FUTURES.map((f) => (
              <button key={f.id} type="button" role="tab" aria-selected={future === f.id} className={`gel gel-sm ${future === f.id ? 'gel-sun' : ''}`} onClick={() => setFuture(f.id)} title={f.note}>{FUTURE_SHORT[f.id]}</button>
            ))}
          </div>
          <p className="text-[12px] font-bold opacity-80">{FUTURES.find((f) => f.id === future)!.note}</p>
          <p className="text-[13px] font-black">Your plan has lower worst-case flood exposure than {beats}% of the feasible plans the model compared.</p>
          <ul className="sim-list">
            <PlanRow title="Your plan" o={mine} future={future} mine />
            {alts.map((a) => <PlanRow key={a.id} title={a.title} why={a.why} o={a.outcome} future={future} />)}
          </ul>
          <p className="text-[12px] font-bold opacity-80">None of these is "the right plan": each one trades protection, cost and public access differently.</p>
        </section>

        <section className="plan-diverge">
          <p className="vr text-[18px]">↔️ Where built, preferred and modelled part ways</p>
          <ul>
            {diverge.map((d, i) => {
              const sc = PLAN_SCENARIOS[i]!;
              return (
                <li key={d.scenarioId}>
                  <b>{districtById(d.district).name}</b>
                  <span>Built: {d.adopted}</span>
                  <span>Model rates best for flood (extreme): {d.modelBest} {d.agrees ? '✔ same project' : '✘ different'}</span>
                  <span>
                    Personal picks (voluntary, outside the role): {d.personal.length ? d.personal.map((p) => `${p.option === 'none' ? 'Do nothing' : optionOf(sc, p.option)?.name ?? p.option} ×${p.count}`).join(', ') : 'nobody answered'}
                    {d.personalAgrees === false && ' · they differ from the model'}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>

        <details className="plan-more frost">
          <summary>📐 What the model assumes ({ASSUMPTIONS.filter((a) => a.kind === 'assumed').length} assumed, {ASSUMPTIONS.filter((a) => a.kind !== 'assumed').length} real or derived)</summary>
          <p className="text-[12px] font-bold">{SIM_DISCLAIMER}</p>
          <ul className="plan-sources">
            {ASSUMPTIONS.map((a) => (
              <li key={a.id}>
                <span className={`lchip ${a.kind === 'real' ? 'lchip-lime' : a.kind === 'derived' ? 'lchip-aqua' : 'lchip-sun'}`}>{a.kind}</span>
                <b>{a.label}</b>: {a.value}{a.unit ? ` ${a.unit}` : ''} <small>— {a.source}</small>
              </li>
            ))}
          </ul>
          <p className="text-[12px] font-bold">The storm line is a modelled exposure of {MODEL.stormHeldMax} (assumed). This game's votes are not real municipal approvals.</p>
        </details>

        <div className="plan-actions">
          {host ? <button type="button" className="gel gel-lime gel-big" onClick={room.again}>Play again</button> : <p className="plan-wait">The host can start another match.</p>}
          <Link to="/atlas" className="gel gel-big">Open Civic Atlas</Link>
          <button type="button" className="gel" onClick={onClose}>Back to the map</button>
        </div>
        <p className="sr-only">{describe(PLAN_SCENARIOS[0]!, final.plan[0]!)} {configCost(PLAN_SCENARIOS[0]!, final.plan[0]!)}</p>
      </div>
    </div>
  );
}
