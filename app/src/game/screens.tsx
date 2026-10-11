// The lagoon column, one screen per phase (Aero Lagoon direction, Pocket Rivals flow):
// crisis (breaking news from live data) -> card (your character card and deck) -> duel (the clash
// on one proposal, then the negotiating table) -> result (verdict and blooms) -> podium.
import { useEffect, useMemo, useState } from 'react';
import type { Map as MapLibreMap } from 'maplibre-gl';
import {
  CARDS, CRISIS_KIND_INFO, INDICATORS, INDICATOR_INFO, NEGOTIATION_COST, PERSONA_INFO, PREFERENCE_QUESTION, PROJECTS,
  cardEligibility, districtById, districtFacts, projectPreview, resolveRound,
  type Attachment, type Board, type CardId, type Delta, type Outcome, type Proposal, type RoomState, type RuleEvent,
} from '@shared';
import type { Room } from '../room/useRoom';
import { Link } from '../router';
import { explain } from '../api';
import { CharacterCard } from './GameCard';
import { StoryPanel, useCard } from './story';
import { Deck } from './Deck';
import { CardExtras, ComboBanners, Hints, IfItPasses, PreviewBox, Recap, TwistCard, WhyButton } from './insights';
import { RoundDots, Soap, Tube } from './ui';
import { STATUS_STYLE } from './format';
import { playDeal } from '../ui/sound';

const placeName = (id: string) => districtById(id).name;
const proposalName = (p: Proposal) => `${PROJECTS[p.kind].name}`;
const who = (state: RoomState, seat: number) => state.players.find((p) => p.seat === seat);

function Narration({ state }: { state: RoomState }) {
  if (!state.headline) return null;
  return (
    <div className="narration wet" aria-live="polite">
      <span className="tag">{state.headline.source === 'gemini' ? 'LIVE' : 'NEWS'}</span>
      <span key={state.headline.key + state.headline.source} className="typed">{state.headline.text}</span>
    </div>
  );
}

function Header({ state, right }: { state: RoomState; right?: React.ReactNode }) {
  return (
    <div className="roundline">
      <span>Round {state.round} of {state.totalRounds} <RoundDots round={state.round} total={state.totalRounds} /></span>
      {right}
    </div>
  );
}

// ---------- Crisis ----------

export function CrisisScreen({ state }: { state: RoomState }) {
  const c = state.crisis;
  const me = who(state, state.you ?? -1);
  if (!c) {
    return (
      <div className="flex flex-col gap-3">
        <Header state={state} />
        <span className="breaking w-fit"><i />LIVE DESK</span>
        <h2 className="glow-title">Checking Miami Beach right now…</h2>
        <div className="wet scanning flex flex-col gap-2 p-4">
          <p className="reading">🌊 NOAA tide gauge, Virginia Key</p>
          <p className="reading">⚠️ NOAA flood thresholds</p>
          <p className="reading">⛅ National Weather Service forecast</p>
          <p className="reading">🗺️ FEMA flood zones and City zoning for four areas</p>
        </div>
        <p className="text-15 font-bold text-white drop-shadow">Gemini is writing this match’s crises from the live readings.</p>
      </div>
    );
  }
  const kind = CRISIS_KIND_INFO[c.kind];
  return (
    <div className="flex flex-col gap-3">
      <Header state={state} right={<span className="lchip lchip-sun">{kind.icon} {kind.label}</span>} />
      <span className="breaking w-fit"><i />BREAKING</span>
      <h2 className="glow-title">{c.title}</h2>
      <div className="ccard-art wet !aspect-[16/8]">
        <Soap size={120} className="bob" tint="#4fc3f7">{kind.icon}</Soap>
        <span className="lchip absolute right-3 bottom-3">{c.story ? (c.source === 'gemini' ? '📄 Real story · told live by Gemini' : '📄 Real story') : c.source === 'gemini' ? '✨ Written live by Gemini' : 'Authored scenario'}</span>
      </div>
      {c.readings.length > 0 && (
        <div className="flex flex-col gap-1">
          {c.readings.map((r) => <p key={r} className="reading">{r}</p>)}
        </div>
      )}
      <div className="narration wet"><span className="typed">{c.text}</span></div>
      <StoryPanel crisis={c} you={me?.persona ?? null} />
      {state.event && state.event.round === state.round && <TwistCard ev={state.event} />}
      {c.spotlight.map((id) => (
        <div key={id} className="frost p-3">
          <p className="vr text-18">📍 {placeName(id)}</p>
          <ul className="mt-1 list-disc pl-5 text-13 font-semibold">{districtFacts(districtById(id)).map((f) => <li key={f}>{f}</li>)}</ul>
        </div>
      ))}
      <p className="lchip lchip-lime w-fit whitespace-normal">Approved projects here this round: {Object.entries(c.bonus).map(([k, v]) => `+${v} ${INDICATOR_INFO[k as keyof typeof INDICATOR_INFO].short.toLowerCase()}`).join(', ')} (rule K1)</p>
      {me && !c.story && <p className="frost p-3 text-13"><b>Your agenda, {PERSONA_INFO[me.persona].name}:</b> {PERSONA_INFO[me.persona].goal}</p>}
    </div>
  );
}

// ---------- Play a card ----------

export function CardScreen({ state, room, card, setCard, target, setTarget, map, onHover }: {
  state: RoomState; room: Room; card: CardId | null; setCard: (c: CardId | null) => void; target: string | null; setTarget: (d: string | null) => void; map: MapLibreMap | null;
  /** The card under the pointer, so the map can light up where it may go. */
  onHover?: (c: CardId | null) => void;
}) {
  const me = who(state, state.you ?? -1);
  if (!me) return null;
  const locked = state.mine?.selection;
  const deploy = (c: CardId, d: string) => room.select(c, d);
  if (locked) {
    const waiting = state.players.filter((p) => !p.ready).length;
    return (
      <div className="flex flex-col gap-3">
        <Header state={state} />
        <span className="lchip lchip-lime w-fit">Deployed · hidden until everyone plays</span>
        <CharacterCard id={locked.card} quip={state.quips[locked.card]} />
        <div className="narration wet"><span>Your {CARDS[locked.card].name} is face down on <b>{placeName(locked.district)}</b>. {waiting ? `${waiting} stakeholder${waiting > 1 ? 's are' : ' is'} still deciding…` : 'Revealing…'}</span></div>
      </div>
    );
  }
  const shown = card ?? null;
  const where = shown && target ? cardEligibility(shown, target) : null;
  return (
    <div className="flex flex-col gap-3">
      <Header state={state} right={<span className="lchip">⚡ {me.influence} influence</span>} />
      {shown ? (
        <>
          <CharacterCard id={shown} quip={state.quips[shown]} note={CARDS[shown].cost > me.influence ? 'Not enough influence for this one.' : null} />
          <div className="frost p-3"><CardExtras id={shown} /></div>
        </>
      ) : (
        <div className="wet flex flex-col items-center gap-2 p-6 text-center">
          <Soap size={96} className="bob">🃏</Soap>
          <p className="glow-title">Pick a card</p>
          <p className="text-15 font-semibold">Tap a card to read it, or drag it straight onto an area of the map.</p>
        </div>
      )}
      {shown && (
        <div className="frost flex flex-col gap-2 p-3">
          <p className="text-13 font-black">{target ? `Target: ${placeName(target)}` : 'Tap an area on the map, or pick one:'}</p>
          <div className="flex flex-wrap gap-1.5">
            {Object.keys(state.city.districts).map((id) => {
              const ok = cardEligibility(shown, id);
              return (
                <button key={id} type="button" className={`gel gel-sm ${target === id ? 'gel-lime' : ''}`} disabled={!ok.ok} title={ok.reason} onClick={() => setTarget(id)}>
                  {placeName(id)}
                </button>
              );
            })}
          </div>
          {where && <p className={`text-13 font-bold ${where.ok ? 'text-[#2f7a0e]' : 'text-[#c0392b]'}`}>{where.reason}</p>}
          {target && <WhyButton key={`${shown}-${target}`} label={where?.ok ? 'Why here?' : 'Why not here?'} ask={() => explain({ kind: 'eligibility', card: shown, district: target })} />}
        </div>
      )}
      {shown && target && where?.ok && (() => {
        const preview = projectPreview(shown, target, state.round, state.city, state.crisis ?? undefined);
        return preview ? <PreviewBox p={preview} /> : null;
      })()}
      <div className="sticky-foot">
        <Deck persona={me.persona} round={state.round} influence={me.influence} card={card} setCard={setCard} setTarget={setTarget} map={map} onDeploy={deploy} onHover={onHover} />
        <button
          type="button" className="gel gel-lime gel-big" disabled={!shown || !target || !where?.ok}
          onClick={() => {
            if (!shown || !target) return;
            playDeal();
            deploy(shown, target);
          }}
        >
          {shown && target ? `Deploy to ${placeName(target)} ${CARDS[shown].art}` : 'Tap or drag a card onto the map'}
        </button>
      </div>
    </div>
  );
}

// ---------- Duel: reveal and negotiation ----------

const ACT_LABEL: Record<Attachment['card'], string> = Object.fromEntries(Object.values(CARDS).map((c) => [c.id, c.category === 'opposition' ? 'challenges' : c.category === 'negotiation' ? 'offers a deal' : 'backs'])) as never;

function ClashCard({ a, state, side }: { a: Attachment; state: RoomState; side: 'backs' | 'fights' | 'deal' }) {
  const c = CARDS[a.card];
  const story = useCard(a.card);
  return (
    <div className={`sc wet ${side} ${side === 'fights' ? 'land-r' : 'land-l'}`}>
      <span className="art">{c.art}</span>
      <span>{story.name}</span>
      <span className="text-[11px] opacity-70">{who(state, a.seat)?.name}</span>
    </div>
  );
}

function sideOf(a: Attachment): 'backs' | 'fights' | 'deal' {
  const cat = CARDS[a.card].category;
  return cat === 'opposition' ? 'fights' : cat === 'negotiation' ? 'deal' : 'backs';
}

export function DuelScreen({ state, room, focus, setFocus }: { state: RoomState; room: Room; focus: string | null; setFocus: (id: string | null) => void }) {
  const board = state.board as Board | null;
  const preview = useMemo(() => (board ? resolveRound(board, state.actions, state.city) : null), [board, state.actions, state.city]);
  const me = who(state, state.you ?? -1);
  const negotiating = state.phase === 'negotiate';
  useEffect(() => {
    if (board && (!focus || !board.proposals.some((p) => p.id === focus))) setFocus(board.proposals[0]?.id ?? null);
  }, [board, focus, setFocus]);
  if (!board || !preview) return null;
  const p = board.proposals.find((x) => x.id === focus) ?? board.proposals[0];
  const loose = board.attachments.filter((a) => !a.proposalId);

  if (!p) {
    return (
      <div className="flex flex-col gap-3">
        <Header state={state} />
        <h2 className="glow-title">No proposals this round</h2>
        {loose.map((a) => <p key={a.seat} className="frost p-3 text-13">{CARDS[a.card].art} <b>{CARDS[a.card].name}</b> ({who(state, a.seat)?.name}) in {placeName(a.district)}: {CARDS[a.card].fallback?.text}</p>)}
        <Narration state={state} />
      </div>
    );
  }
  const o = preview.outcomes.find((x) => x.proposalId === p.id)!;
  const acting = board.attachments.filter((a) => a.proposalId === p.id);
  const backs = acting.filter((a) => sideOf(a) !== 'fights');
  const fights = acting.filter((a) => sideOf(a) === 'fights');
  const moves = state.actions.filter((a) => a.proposalId === p.id);
  const counted = o.opposition - o.ignored;
  const max = Math.max(4, o.support, counted);
  const owner = PERSONA_INFO[p.persona];
  const st = STATUS_STYLE[o.status];
  const offers = board.compromises.filter((c) => c.proposalId === p.id);
  const done = !!me && state.players.find((x) => x.seat === me.seat)?.ready;
  const moved = !!state.mine?.moved;

  return (
    <div className="flex flex-col gap-2.5">
      {board.proposals.length > 1 && (
        <div className="tabs">
          {board.proposals.map((x) => (
            <button key={x.id} type="button" className={`gel gel-sm ${x.id === p.id ? 'gel-sun' : ''}`} onClick={() => setFocus(x.id)}>
              {PROJECTS[x.kind].marker} {placeName(x.district).split(' ')[0]}
            </button>
          ))}
        </div>
      )}
      <Tube tone="lime" value={o.support} max={max} label={<span className="vr">Support</span>} right={o.support} />
      <Tube tone="coral" value={counted} max={max} label={<span className="vr">Opposition</span>} right={counted} />
      <Header state={state} right={<span className="text-13">📍 {placeName(p.district)}</span>} />

      <div className="relative flex min-h-[170px] items-center justify-between">
        <span key={`${p.id}-${o.status}`} className={`verdict-pill ${o.status} stamp-in sparkle relative self-start`}>
          {negotiating ? `${st.label}${o.status === 'approved' ? '!' : ''}` : 'Clash!'}
        </span>
        <div className="flex flex-col items-center gap-1">
          <Soap size={140} tint={owner.color} className="bob">{PROJECTS[p.kind].marker}</Soap>
          <span className="lchip">{owner.emoji} {who(state, p.seat)?.name}’s {proposalName(p).toLowerCase()}</span>
          {p.carried && <span className="lchip lchip-sun">Delayed from last round</span>}
        </div>
      </div>

      {(backs.length > 0 || fights.length > 0) && (
        <div className="clash-row">
          {backs.map((a) => <ClashCard key={a.seat} a={a} state={state} side={sideOf(a)} />)}
          {backs.length > 0 && fights.length > 0 && <span className="lchip lchip-ink">vs</span>}
          {fights.map((a) => <ClashCard key={a.seat} a={a} state={state} side="fights" />)}
        </div>
      )}
      {acting.length === 0 && <p className="frost p-2 text-center text-13">No one else played on this proposal. It stands on its own support.</p>}
      <IfItPasses state={state} p={p} o={o} />
      {moves.length > 0 && <p className="text-center text-13 font-black text-white drop-shadow">{moves.map((m) => `${who(state, m.seat)?.name} ${m.move === 'back' ? 'backs it 👍' : m.move === 'oppose' ? 'opposes it 👎' : 'funds it 💰'}`).join(' · ')}</p>}

      {offers.map((c) => (
        <div key={c.id} className={`frost p-3 ${c.accepted ? 'ring-2 ring-[#8bd346]' : ''}`}>
          <p className="vr text-16">🤝 {c.title} {c.accepted ? <span className="lchip lchip-lime ml-1">Accepted</span> : <span className="lchip ml-1">offered by {who(state, c.offeredBy)?.name}</span>}</p>
          <p className="mt-1 text-13 font-semibold">{c.text}</p>
          {negotiating && !c.accepted && c.owner === state.you && <button type="button" className="gel gel-sun gel-sm mt-2" onClick={() => room.accept(c.id)}>Accept the deal</button>}
          {negotiating && !c.accepted && c.owner !== state.you && <p className="mt-1 text-[12px] opacity-75">Waiting for {who(state, c.owner)?.name} to accept…</p>}
        </div>
      ))}

      {negotiating && state.hints && state.hints.list.length > 0 && <Hints hints={state.hints.list} state={state} room={room} />}
      <Narration state={state} />
      {!negotiating && <p className="text-center text-13 font-black text-white drop-shadow">Negotiation opens in a moment: back, oppose, fund, or take a deal.</p>}

      {negotiating && me && !done && (
        <div className="sticky-foot">
          {!moved && (
            <div className="grid grid-cols-3 gap-2">
              <button type="button" className="gel gel-lime" disabled={me.influence < NEGOTIATION_COST.back} onClick={() => room.move('back', p.id)}>👍 Back</button>
              <button type="button" className="gel gel-coral" disabled={me.influence < NEGOTIATION_COST.oppose || p.seat === state.you} onClick={() => room.move('oppose', p.id)}>👎 Oppose</button>
              <button type="button" className="gel" disabled={me.influence < NEGOTIATION_COST.fund || PROJECTS[p.kind].budgetCost === 0 || o.funding === 'covered'} onClick={() => room.move('fund', p.id)}>💰 Fund</button>
            </div>
          )}
          <p className="hint">{moved ? 'Move made.' : 'One move per round · back 1 · oppose 1 · fund 2 influence.'} The verdict is the rules engine run on the table as it stands.</p>
          <button type="button" className="gel gel-lime gel-big" onClick={() => room.done()}>{moved ? 'Done ✓' : 'Pass and finish'}</button>
        </div>
      )}
      {negotiating && done && <p className="narration wet text-center">You’re done. Waiting for the table…</p>}
      {loose.length > 0 && (
        <details className="frost p-2 text-13">
          <summary className="cursor-pointer font-black">{loose.length} card{loose.length > 1 ? 's' : ''} found nothing to act on</summary>
          {loose.map((a) => <p key={a.seat} className="mt-1">{CARDS[a.card].art} {CARDS[a.card].name} ({who(state, a.seat)?.name}) in {placeName(a.district)}: {CARDS[a.card].fallback?.text}</p>)}
        </details>
      )}
    </div>
  );
}

// ---------- Result ----------

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
      <button type="button" className="self-start text-[12px] font-black text-[#0a6f9a] underline" onClick={() => setOpen(!open)}>{open ? 'Hide' : 'Show'} the rules that decided it</button>
      {open && <ol className="flex flex-col gap-1">{o.rules.map((id) => events.find((e) => e.id === id)).filter(Boolean).map((e) => <Rule key={e!.id} e={e!} />)}</ol>}
      {open && <WhyButton label="Explain in plain words" ask={() => explain({ kind: 'outcome', code: state.code, proposalId: o.proposalId })} />}
    </div>
  );
}

export function ResultScreen({ state, host, onNext }: { state: RoomState; host: boolean; onNext: () => void }) {
  const last = state.history[state.history.length - 1];
  if (!last) return null;
  const r = last.resolution;
  const loose = r.events.filter((e) => !r.outcomes.some((o) => o.rules.includes(e.id)));
  return (
    <div className="flex flex-col gap-3">
      <Header state={state} />
      <h2 className="glow-title">The city changes</h2>
      {r.outcomes.map((o, i) => <OutcomeCard key={o.proposalId} o={o} state={state} events={r.events} i={i} />)}
      <ComboBanners combos={r.combos ?? []} />
      {loose.length > 0 && <ol className="frost flex flex-col gap-1 p-3">{loose.map((e) => <Rule key={e.id} e={e} />)}</ol>}
      <Narration state={state} />
      <p className="text-center text-[12px] font-bold text-white drop-shadow">Effects are illustrative scenario values. The geography (zoning, FEMA zones) and the live readings are real.</p>
      {host && <div className="sticky-foot"><button type="button" className="gel gel-lime gel-big" onClick={onNext}>{state.round < state.totalRounds ? 'Next round ▶' : 'See who won ▶'}</button></div>}
    </div>
  );
}

// ---------- Final ----------

export function FinalScreen({ state, room }: { state: RoomState; room: Room }) {
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
      <Narration state={state} />
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
      <Link to={`/studio${state.matchId ? `?match=${state.matchId}` : ''}`} className="gel gel-lime gel-big">Open Planning Studio →</Link>
      {host && <button type="button" className="gel" onClick={() => room.again()}>New match</button>}
    </div>
  );
}
