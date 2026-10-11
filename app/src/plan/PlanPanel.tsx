// The Planning Edition's side panel: one thing to do per phase, as little text as it takes.
//   select   the real story, your goal, how points work, and three project cards (play one)
//   propose  everyone's card is face up; the Mayor puts one forward
//   deal     support or oppose, ask for one amendment (the sponsor decides)
//   vote     3 of 4 approve
//   result   verdict, the points with a reason for each, and your own optional after-answer
import { useEffect, useState } from 'react';
import {
  PERSONAL_REASONS, PERSONA_INFO, REASON_LABEL, ROUND_BUDGET, VOTES_TO_APPROVE, amendmentOf, configCost, mandatePoints, optionOf, pointsIfStopped, previewScore, unmetConstraint,
  type PersonalReason, type PlanRound, type PlanScenario, type RoomState,
} from '@shared';
import type { Room } from '../room/useRoom';
import { ReadyBar } from '../game/Turn';
import { FaceOrb } from '../game/Players';
import { BudgetBar, GoalLine, OptionCard, ScoreGuide, Sources, Stars, STANCE_ICON, Table, describe, nameOf, scenarioById2 } from './bits';

/** "What would YOU pick?" outside the role: optional, never scored. */
function PersonalPrompt({ sc, state, room, stage }: { sc: PlanScenario; state: RoomState; room: Room; stage: 'before' | 'after' }) {
  const mine = state.mine?.plan;
  const answered = stage === 'before' ? mine?.before !== null && mine?.before !== undefined : !!mine?.after;
  const [reason, setReason] = useState<PersonalReason | null>(null);
  const [moved, setMoved] = useState<boolean | null>(null);
  const accepted = state.plan?.rounds.at(-1)?.accepted ?? state.plan?.accepted ?? null;
  const picked = stage === 'before' ? mine?.before : mine?.after?.option;
  if (state.you === null) return null;
  const options = [...sc.options.map((o) => ({ id: o.id, name: o.name })), { id: 'none', name: 'Do nothing' }];
  return (
    <details className="plan-personal frost" open={stage === 'after' && !answered}>
      <summary>
        🙋 What would <i>you</i> pick, not your character?{answered ? ` · ${options.find((o) => o.id === picked)?.name ?? '—'}` : ''} <span className="lchip">optional · no points</span>
      </summary>
      <p className="text-[12px] font-bold opacity-80">{stage === 'before' ? 'Before the deal. Your honest view is recorded apart from the game.' : 'After the result: has anything changed your mind?'}</p>
      {stage === 'after' && (
        <div className="plan-chips">
          {PERSONAL_REASONS.map((r) => (
            <button key={r} type="button" className={`lchip ${reason === r ? 'lchip-sun' : ''}`} aria-pressed={reason === r} onClick={() => setReason(reason === r ? null : r)}>{REASON_LABEL[r]}</button>
          ))}
        </div>
      )}
      {stage === 'after' && accepted && (
        <label className="plan-check"><input type="checkbox" checked={moved === true} onChange={(e) => setMoved(e.target.checked ? true : null)} /> The accepted change moved my pick</label>
      )}
      <div className="plan-chips">
        {options.map((o) => (
          <button
            key={o.id} type="button" className={`gel gel-sm ${picked === o.id ? 'gel-lime' : ''}`}
            onClick={() => room.personal(stage, o.id, stage === 'after' ? { reason, moved } : undefined)}
          >{o.name}</button>
        ))}
      </div>
    </details>
  );
}

/** One screen: the real story, your goal, how points work, and the three cards. */
function Select({ sc, state, room }: { sc: PlanScenario; state: RoomState; room: Room }) {
  const me = state.players.find((p) => p.seat === state.you);
  const mine = state.mine?.plan?.pick ?? null;
  return (
    <>
      <p className="plan-kicker">Round {state.round} of {state.totalRounds} · {sc.title}</p>
      <p className="plan-situation">{sc.situation}</p>
      {me && <GoalLine sc={sc} persona={me.persona} you />}
      <ScoreGuide />
      <p className="plan-question">{sc.question} <small>Play one card.</small></p>
      <div className="plan-cards">
        {me ? sc.options.map((o, i) => (
          <OptionCard key={o.id} sc={sc} option={o} persona={me.persona} tone={i} picked={mine === o.id} disabled={!!mine} onPick={() => room.pick(o.id)} />
        )) : <p className="text-15 font-bold">Watching this round.</p>}
      </div>
      <p className="plan-wait">{mine ? '🔒 Locked in. Cards stay face down until everyone has played.' : 'Cards stay face down until everyone has played.'}</p>
      <div className="plan-extras">
        <Sources sc={sc} />
        <PersonalPrompt sc={sc} state={state} room={room} stage="before" />
      </div>
    </>
  );
}

function Propose({ sc, state, room }: { sc: PlanScenario; state: RoomState; room: Room }) {
  const plan = state.plan!;
  const me = state.players.find((p) => p.seat === state.you);
  const picks = plan.picks ?? {};
  const isMayor = me?.persona === 'mayor';
  const submitted = [...new Set(Object.values(picks))];
  return (
    <>
      <p className="plan-kicker">The cards are face up</p>
      <Table state={state} badge={(seat) => <span className="lchip">{optionOf(sc, picks[seat])?.name ?? '—'}</span>} />
      {isMayor && !plan.leading ? (
        <>
          <p className="plan-question">You are the <b>Mayor</b>. Put one project forward. You cannot approve it alone: all four vote.</p>
          <div className="plan-chips plan-col">
            {submitted.map((id) => {
              const o = optionOf(sc, id)!;
              const n = Object.values(picks).filter((x) => x === id).length;
              return <button key={id} type="button" className="gel gel-lime" onClick={() => room.lead(id)}>Put forward: {o.name} <small>({n} card{n > 1 ? 's' : ''} · {o.cost} units)</small></button>;
            })}
          </div>
        </>
      ) : plan.leading ? (
        <p className="plan-question">The Mayor puts forward <b>{optionOf(sc, plan.leading.option)?.name}</b>, sponsored by {nameOf(state, plan.leading.sponsorSeat)}. <small>Moving on…</small></p>
      ) : (
        <p className="plan-wait">Waiting for the Mayor to choose…</p>
      )}
    </>
  );
}

function Deal({ sc, state, room }: { sc: PlanScenario; state: RoomState; room: Room }) {
  const plan = state.plan!;
  const lead = plan.leading;
  const me = state.players.find((p) => p.seat === state.you);
  if (!lead || !me) return null;
  const option = optionOf(sc, lead.option)!;
  const sponsor = lead.sponsorSeat === me.seat;
  const accepted = plan.accepted;
  const config = { option: option.id, amendment: accepted?.amendment ?? null };
  const cost = configCost(sc, config);
  const myOffer = plan.offers.find((o) => o.seat === me.seat);
  const blocked = unmetConstraint(sc, config);
  const now = previewScore(sc, me.persona, config);
  const stance = state.mine?.plan?.stance ?? null;
  const myConcern = sc.mandates[me.persona].concern;
  return (
    <>
      <p className="plan-kicker">Make a deal · sponsor {nameOf(state, lead.sponsorSeat)}</p>
      <h2 className="vr plan-title">{option.name}{accepted ? ` + ${amendmentOf(sc, accepted.amendment)?.name}` : ''}</h2>
      <BudgetBar used={option.cost} pending={cost - option.cost} />
      {blocked && <p className="warn-line">🚧 {blocked.because}</p>}
      <p className="plan-now" title="Points you would get if this passes now, and if it is stopped">If it passes: 🎯 <Stars n={now.mandate} /> · 🏙️ {now.feasible ? '+1' : '0'}{!accepted && !sponsor && ' · 🤝 up to +2 if your change gets in'}<small className="block opacity-80">If it is stopped: 🎯 <Stars n={pointsIfStopped(sc, me.persona, option.id)} /> for you</small></p>
      <Table state={state} badge={(seat) => (plan.stances[seat] ? <span className={`lchip ${plan.stances[seat] === 'support' ? 'lchip-lime' : 'lchip-coral'}`} title={STANCE_ICON[plan.stances[seat]!]}>{plan.stances[seat] === 'support' ? '👍' : '👎'}</span> : <span className="opacity-60">…</span>)} />
      <div className="plan-chips">
        <button type="button" className={`gel gel-sm ${stance === 'support' ? 'gel-lime' : ''}`} onClick={() => room.stance('support')}>👍 Support</button>
        <button type="button" className={`gel gel-sm ${stance === 'oppose' ? 'gel-coral' : ''}`} onClick={() => room.stance('oppose')}>👎 Oppose</button>
      </div>

      <section className="plan-deal">
        <p className="vr text-[15px]">🤝 Make a Deal <small>ask for one change · {sponsor ? 'you decide' : `${nameOf(state, lead.sponsorSeat)} decides`}</small></p>
        {accepted ? (
          <p className="plan-done">✅ <b>{amendmentOf(sc, accepted.amendment)?.name}</b> is in the plan (asked by {nameOf(state, accepted.bySeat)}).</p>
        ) : (
          <>
            {plan.offers.filter((o) => o.state === 'open').map((o) => {
              const a = amendmentOf(sc, o.amendment)!;
              return (
                <div key={o.seat} className="plan-offer">
                  <p className="text-[13px] font-black">{nameOf(state, o.seat)} asks for <b>{a.name}</b> ({a.cost >= 0 ? '+' : '−'}{Math.abs(a.cost)} units)</p>
                  <p className="text-[12px] font-bold">{a.text} <span className="opacity-70">Trade-off: {a.tradeoff}</span></p>
                  {sponsor && (
                    <div className="plan-chips">
                      <button type="button" className="gel gel-lime gel-sm" onClick={() => room.decide(o.seat, true)}>Accept</button>
                      <button type="button" className="gel gel-sm" onClick={() => room.decide(o.seat, false)}>Decline</button>
                    </div>
                  )}
                </div>
              );
            })}
            {!sponsor && !myOffer && (
              <ul className="plan-amends">
                {sc.amendments.filter((a) => a.appliesTo.includes(option.id)).map((a) => {
                  const over = option.cost + a.cost > ROUND_BUDGET;
                  const mine = a.addresses === myConcern;
                  return (
                    <li key={a.id} className={mine ? 'is-mine' : ''}>
                      <div className="min-w-0 flex-1">
                        <b>{a.name}</b> <span className="lchip">{a.cost >= 0 ? '+' : '−'}{Math.abs(a.cost)}</span>{mine && <span className="lchip lchip-sun" title="This answers your own concern, so it earns you deal points if it gets in">🤝 +2 for you</span>}
                        <p className="text-[12px] font-bold">{a.text}</p>
                        <p className="text-[11px] opacity-70">Trade-off: {a.tradeoff}</p>
                      </div>
                      <button type="button" className="gel gel-sm" disabled={over} title={over ? `It would cost ${option.cost + a.cost} of ${ROUND_BUDGET}` : undefined} onClick={() => room.offer(a.id)}>Ask</button>
                    </li>
                  );
                })}
              </ul>
            )}
            {myOffer && !sponsor && <p className="plan-wait">You asked for {amendmentOf(sc, myOffer.amendment)?.name}: {myOffer.state === 'open' ? 'waiting for the sponsor…' : myOffer.state === 'declined' ? 'declined.' : 'accepted.'}</p>}
            {sponsor && !plan.offers.some((o) => o.state === 'open') && <p className="plan-wait">Others may ask for a change. You decide.</p>}
            {!sponsor && !accepted && state.players[lead.sponsorSeat]?.bot && <p className="plan-wait">{nameOf(state, lead.sponsorSeat)} picks among the offers when everyone is ready.</p>}
          </>
        )}
      </section>
      <PersonalPrompt sc={sc} state={state} room={room} stage="before" />
      <ReadyBar state={state} room={room} label="Ready to vote ▶" />
    </>
  );
}

function Vote({ sc, state, room }: { sc: PlanScenario; state: RoomState; room: Room }) {
  const plan = state.plan!;
  const lead = plan.leading;
  const me = state.players.find((p) => p.seat === state.you);
  if (!lead || !me) return null;
  const config = { option: lead.option, amendment: plan.accepted?.amendment ?? null };
  const pv = previewScore(sc, me.persona, config);
  const voted = state.mine?.plan?.vote;
  return (
    <>
      <p className="plan-kicker">The vote · needs {VOTES_TO_APPROVE} of 4</p>
      <h2 className="vr plan-title">{describe(sc, config)}</h2>
      <BudgetBar used={pv.cost} />
      {pv.blockedBy && <p className="warn-line">🚧 Even if it passes: {pv.blockedBy}</p>}
      <p className="plan-now">If it passes: 🎯 <Stars n={pv.mandate} /> · 🏙️ {pv.feasible ? '+1' : '0'} <span className="opacity-80">· if it is stopped: 🎯 <Stars n={pointsIfStopped(sc, me.persona, config.option)} /></span></p>
      <ul className="plan-why plan-why-box">{mandatePoints(sc, me.persona, config).parts.map((p, i) => <li key={i}>{p.because}</li>)}</ul>
      <Table state={state} badge={(seat) => (plan.voted.includes(seat) ? <span className="lchip lchip-aqua">✓ voted</span> : <span className="opacity-60">…</span>)} />
      {voted === null || voted === undefined ? (
        <div className="plan-chips">
          <button type="button" className="gel gel-lime gel-big" onClick={() => room.vote(true)}>✅ Approve</button>
          <button type="button" className="gel gel-coral gel-big" onClick={() => room.vote(false)}>❌ Reject</button>
        </div>
      ) : <p className="plan-wait">You voted {voted ? 'to approve' : 'to reject'}. Waiting for the others…</p>}
      <p className="text-[11px] font-bold opacity-70">If it fails, nothing is built and the status quo stands. A game vote, not a real approval.</p>
    </>
  );
}

function Score({ round, state }: { round: PlanRound; state: RoomState }) {
  return (
    <ul className="plan-scores">
      {round.scores.map((s) => (
        <li key={s.seat} className={s.seat === state.you ? 'is-you' : ''}>
          <details open={s.seat === state.you}>
            <summary>
              <FaceOrb persona={s.persona} size={30} />
              <span className="min-w-0 flex-1"><b>{s.seat === state.you ? 'You' : nameOf(state, s.seat)}</b> <small>{PERSONA_INFO[s.persona].name}</small></span>
              <span className="plan-pts" title="Goal 0–3 · Deal 0–2 · City 0–1">🎯<i>{s.mandate}</i> 🤝<i>{s.deal}</i> 🏙️<i>{s.feasibility}</i> = <b>{s.total}</b></span>
            </summary>
            <ul className="plan-why">
              {s.parts.mandate.map((p, i) => <li key={`m${i}`}><b>🎯 +{p.points}</b> {p.because}</li>)}
              {s.parts.deal.map((p, i) => <li key={`d${i}`}><b>🤝 +{p.points}</b> {p.because}</li>)}
              {s.parts.feasibility.map((p, i) => <li key={`f${i}`}><b>🏙️ +{p.points}</b> {p.because}</li>)}
            </ul>
          </details>
        </li>
      ))}
    </ul>
  );
}

function Result({ sc, state, room }: { sc: PlanScenario; state: RoomState; room: Room }) {
  const round = state.plan!.rounds.at(-1);
  if (!round) return null;
  const yes = Object.values(round.votes).filter(Boolean).length;
  return (
    <>
      <p className="plan-kicker">See what happens · {sc.title}</p>
      <h2 className="vr plan-title">{round.verdict === 'approved' ? describe(sc, round.adopted) : sc.statusQuo.name}</h2>
      <p className="text-[13px] font-bold">
        {round.verdict === 'approved' ? `Approved ${yes} to ${4 - yes}. Cost ${round.cost} of ${round.budget} units.` : round.verdict === 'rejected' ? `${round.leading ? `Only ${yes} of 4 voted yes` : 'Nothing was put forward'}: the status quo stands. ${sc.statusQuo.text}` : round.blockedBy}
      </p>
      <ScoreGuide />
      <Score round={round} state={state} />
      <PersonalPrompt sc={sc} state={state} room={room} stage="after" />
      <ReadyBar state={state} room={room} label={state.round >= state.totalRounds ? 'See your plan ▶' : 'Next fight ▶'} />
    </>
  );
}

export function PlanPanel({ state, room }: { state: RoomState; room: Room }) {
  const sc = state.plan ? scenarioById2(state.plan.scenarioId) : null;
  const [key, setKey] = useState(0);
  useEffect(() => setKey((k) => k + 1), [state.phase, state.round]);
  if (!sc || !state.plan) return null;
  return (
    <aside className="plan-panel float-card" key={key} aria-live="polite">
      {state.phase === 'select' && <Select sc={sc} state={state} room={room} />}
      {state.phase === 'propose' && <Propose sc={sc} state={state} room={room} />}
      {state.phase === 'deal' && <Deal sc={sc} state={state} room={room} />}
      {state.phase === 'vote' && <Vote sc={sc} state={state} room={room} />}
      {state.phase === 'result' && <Result sc={sc} state={state} room={room} />}
    </aside>
  );
}
