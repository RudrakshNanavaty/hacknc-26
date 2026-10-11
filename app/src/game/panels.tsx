// The phase panels beside the map: crisis, your hand, the reveal, the negotiating table, the
// resolution with its rule trace, and the end of the session.
import { useMemo, useState } from 'react';
import {
  CARDS, NEGOTIATION_COST, PERSONA_INFO, PREFERENCE_QUESTION, PROJECTS, cardEligibility, districtById, districtFacts, handOf, resolveRound,
  type Board, type CardId, type Proposal, type RoomState, type RuleEvent,
} from '@shared';
import type { Room } from '../room/useRoom';
import { Link } from '../router';
import { GameCard } from './GameCard';
import { PersonaOrb } from './Players';
import { STATUS_STYLE, deltaText } from './format';
import { playDeal, unlockAudio } from '../ui/sound';

const proposalLabel = (p: Proposal) => `${PROJECTS[p.kind].name} · ${districtById(p.district).name}`;

export function CrisisPanel({ state }: { state: RoomState }) {
  const c = state.crisis;
  if (!c) return null;
  const me = state.players.find((p) => p.seat === state.you);
  return (
    <div className="flex flex-col gap-3">
      <p className="chip w-fit text-aqua-deep">Round {state.round} crisis · scenario</p>
      <h2 className="font-display text-32 leading-tight font-black">{c.title}</h2>
      <p className="text-15">{c.text.replace(/^Scenario: /, '')}</p>
      <div className="flex flex-col gap-2">
        {c.spotlight.map((id) => {
          const d = districtById(id);
          return (
            <div key={id} className="rounded-2xl border border-white/80 bg-white/60 p-3">
              <p className="font-display text-18 font-black">📍 {d.name}</p>
              <ul className="mt-1 list-disc pl-5 text-13">
                {districtFacts(d).map((f) => <li key={f}>{f}</li>)}
              </ul>
            </div>
          );
        })}
      </div>
      <p className="text-13 opacity-80">Approved projects in a spotlight area this round add {deltaText(c.bonus)} (rule K1, illustrative).</p>
      {me && (
        <p className="rounded-2xl bg-white/50 p-3 text-13"><b>Your agenda ({PERSONA_INFO[me.persona].name}):</b> {PERSONA_INFO[me.persona].goal}</p>
      )}
    </div>
  );
}

/** Your three cards and where to play them. */
export function HandPanel({ state, room, card, setCard, target, setTarget, onHover }: {
  state: RoomState; room: Room; card: CardId | null; setCard: (c: CardId | null) => void; target: string | null; setTarget: (d: string | null) => void;
  onHover?: (c: CardId | null) => void;
}) {
  const me = state.players.find((p) => p.seat === state.you);
  if (!me) return null;
  const locked = state.mine?.selection;
  if (locked) {
    return (
      <div className="flex items-center gap-3">
        <GameCard id={locked.card} compact />
        <div>
          <p className="font-display text-18 font-black">Locked in</p>
          <p className="text-15">{CARDS[locked.card].name} → {districtById(locked.district).name}</p>
          <p className="text-13 opacity-75">Hidden until everyone plays. {state.players.filter((p) => !p.ready).length} still deciding…</p>
        </div>
      </div>
    );
  }
  const where = card && target ? cardEligibility(card, target) : null;
  return (
    <div className="flex flex-col gap-3">
      <div className="hand">
        {handOf(me.persona).map((id) => {
          const short = CARDS[id].cost > me.influence;
          return (
            <GameCard
              key={id} id={id} selected={card === id} disabled={short} note={short ? 'Not enough influence' : null}
              onHover={(on) => onHover?.(on ? id : null)}
              onClick={() => {
                unlockAudio();
                setCard(card === id ? null : id);
                if (target && !cardEligibility(id, target).ok) setTarget(null);
              }}
            />
          );
        })}
      </div>
      {card && (
        <div className="glass flex flex-col gap-2 p-3">
          <p className="text-13"><b>{CARDS[card].name}:</b> {CARDS[card].rule}</p>
          <p className="text-13 opacity-80"><b>Trade-off:</b> {CARDS[card].tradeoff}</p>
          <p className="text-13 font-bold">{target ? `Target: ${districtById(target).name}` : 'Tap a highlighted area on the map, or pick one:'}</p>
          <div className="flex flex-wrap gap-2">
            {state.city && Object.keys(state.city.districts).map((id) => {
              const ok = cardEligibility(card, id);
              return (
                <button key={id} type="button" className="aero-btn !px-3 !py-1 text-13" aria-pressed={target === id} disabled={!ok.ok} title={ok.reason} onClick={() => setTarget(id)}>
                  {districtById(id).name}
                </button>
              );
            })}
          </div>
          {where && <p className={`text-13 ${where.ok ? 'text-leaf-deep' : 'text-coral'}`}>{where.reason}</p>}
          <button
            type="button" className="aero-btn aero-btn-go aero-btn-lg self-start" disabled={!target || !where?.ok}
            onClick={() => {
              if (!card || !target) return;
              playDeal();
              room.select(card, target);
            }}
          >
            Deploy {CARDS[card].art}
          </button>
        </div>
      )}
    </div>
  );
}

function BoardList({ board, state }: { board: Board; state: RoomState }) {
  const by = (seat: number) => state.players.find((p) => p.seat === seat);
  return (
    <div className="flex flex-col gap-2">
      {board.proposals.map((p) => {
        const acting = board.attachments.filter((a) => a.proposalId === p.id);
        return (
          <div key={p.id} className="proposal glass" style={{ ['--tint' as string]: PERSONA_INFO[p.persona].color }}>
            <div className="flex items-center gap-2">
              <PersonaOrb persona={p.persona} size={30} />
              <p className="min-w-0 flex-1 font-display text-15 font-black leading-tight">{PROJECTS[p.kind].marker} {proposalLabel(p)}</p>
              {p.carried && <span className="chip text-[11px]">delayed</span>}
            </div>
            <p className="text-[12px] opacity-75">Proposed by {by(p.seat)?.name} ({PERSONA_INFO[p.persona].name})</p>
            {acting.map((a) => (
              <p key={a.seat} className="mt-1 text-13">
                {CARDS[a.card].art} <b>{CARDS[a.card].name}</b> from {by(a.seat)?.name}
                <span className="opacity-70"> · {CARDS[a.card].category}</span>
              </p>
            ))}
          </div>
        );
      })}
      {board.attachments.filter((a) => !a.proposalId).map((a) => (
        <p key={a.seat} className="rounded-xl bg-white/50 p-2 text-13">
          {CARDS[a.card].art} <b>{CARDS[a.card].name}</b> ({by(a.seat)?.name}) in {districtById(a.district).name}: nothing to act on. {CARDS[a.card].fallback?.text}
        </p>
      ))}
      {!board.proposals.length && !board.attachments.length && <p className="text-15">Nobody played a card this round.</p>}
    </div>
  );
}

export function RevealPanel({ state }: { state: RoomState }) {
  if (!state.board) return null;
  return (
    <div className="flex flex-col gap-3">
      <h2 className="font-display text-32 leading-tight font-black">Cards on the table</h2>
      <BoardList board={state.board} state={state} />
      {state.board.compromises.length > 0 && (
        <p className="rounded-2xl bg-sun/40 p-3 text-13"><b>Compromise on the table:</b> {state.board.compromises.map((c) => c.title).join('; ')}. Negotiation is next.</p>
      )}
    </div>
  );
}

export function NegotiationPanel({ state, room }: { state: RoomState; room: Room }) {
  const board = state.board;
  const me = state.players.find((p) => p.seat === state.you);
  // The engine is shared: everyone sees what would happen if the table closed now.
  const preview = useMemo(() => (board ? resolveRound(board, state.actions, state.city) : null), [board, state.actions, state.city]);
  if (!board || !preview) return null;
  const moved = !!state.mine?.moved;
  const done = !!me && state.players.find((p) => p.seat === me.seat)?.ready;
  const by = (seat: number) => state.players.find((p) => p.seat === seat);
  return (
    <div className="flex flex-col gap-3">
      <h2 className="font-display text-32 leading-tight font-black">Negotiate</h2>
      <p className="text-13 opacity-80">One move each: back (1), oppose (1) or fund (2). Owners can accept compromises. The preview is the rules engine run on the table as it stands.</p>
      {board.proposals.map((p) => {
        const o = preview.outcomes.find((x) => x.proposalId === p.id)!;
        const st = STATUS_STYLE[o.status];
        const offers = board.compromises.filter((c) => c.proposalId === p.id);
        const moves = state.actions.filter((a) => a.proposalId === p.id);
        return (
          <div key={p.id} className="proposal glass" style={{ ['--tint' as string]: PERSONA_INFO[p.persona].color }}>
            <div className="flex items-center gap-2">
              <PersonaOrb persona={p.persona} size={30} />
              <p className="min-w-0 flex-1 font-display text-15 font-black leading-tight">{PROJECTS[p.kind].marker} {proposalLabel(p)}</p>
              <span className="status-pill" style={{ background: st.bg, color: st.color }}>{st.label}</span>
            </div>
            <p className="text-13">
              <b>{o.support}</b> support vs <b>{o.opposition - o.ignored}</b> opposition{o.ignored ? ` (${o.ignored} ignored)` : ''}
              {o.funding === 'budget' && ` · $${PROJECTS[p.kind].budgetCost}M from budget`}
              {o.funding === 'covered' && ' · cost covered'}
            </p>
            {moves.map((m) => <p key={m.seat} className="text-[12px]">↳ {by(m.seat)?.name} {m.move === 'back' ? 'backs it' : m.move === 'oppose' ? 'opposes it' : 'funds it'}</p>)}
            {offers.map((c) => (
              <div key={c.id} className="mt-2 rounded-xl bg-white/60 p-2 text-13">
                <p><b>🤝 {c.title}</b> {c.accepted ? <span className="text-leaf-deep font-bold">· accepted</span> : <span className="opacity-70">· offered by {by(c.offeredBy)?.name}</span>}</p>
                <p className="opacity-80">{c.text}</p>
                {!c.accepted && c.owner === state.you && (
                  <button type="button" className="aero-btn aero-btn-go mt-1 !py-1 text-13" onClick={() => room.accept(c.id)}>Accept compromise</button>
                )}
              </div>
            ))}
            {me && !moved && !done && (
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" className="aero-btn aero-btn-aqua !py-1 text-13" disabled={me.influence < NEGOTIATION_COST.back} onClick={() => room.move('back', p.id)}>👍 Back (1)</button>
                {p.seat !== state.you && (
                  <button type="button" className="aero-btn aero-btn-coral !py-1 text-13" disabled={me.influence < NEGOTIATION_COST.oppose} onClick={() => room.move('oppose', p.id)}>👎 Oppose (1)</button>
                )}
                {PROJECTS[p.kind].budgetCost > 0 && o.funding !== 'covered' && (
                  <button type="button" className="aero-btn !py-1 text-13" disabled={me.influence < NEGOTIATION_COST.fund} onClick={() => room.move('fund', p.id)}>💰 Fund (2)</button>
                )}
              </div>
            )}
          </div>
        );
      })}
      {me && (
        done
          ? <p className="text-15 font-bold">You're done. Waiting for the table…</p>
          : <button type="button" className="aero-btn aero-btn-go aero-btn-lg self-start" onClick={() => room.done()}>{moved ? 'Done ✓' : 'Pass and finish'}</button>
      )}
    </div>
  );
}

function Rule({ e }: { e: RuleEvent }) {
  return (
    <li className="rule-line">
      <span className="rule-id">{e.rule}</span>
      <span>{e.text}</span>
    </li>
  );
}

export function ResolvePanel({ state }: { state: RoomState }) {
  const last = state.history[state.history.length - 1];
  const [open, setOpen] = useState<string | null>(null);
  if (!last) return null;
  const r = last.resolution;
  const loose = r.events.filter((e) => !r.outcomes.some((o) => o.rules.includes(e.id)));
  return (
    <div className="flex flex-col gap-3">
      <h2 className="font-display text-32 leading-tight font-black">The city changes</h2>
      {r.outcomes.map((o) => {
        const st = STATUS_STYLE[o.status];
        return (
          <div key={o.proposalId} className="proposal glass" style={{ ['--tint' as string]: PERSONA_INFO[o.persona].color }}>
            <div className="flex items-center gap-2">
              <span className="text-24">{PROJECTS[o.kind].marker}</span>
              <p className="min-w-0 flex-1 font-display text-15 font-black leading-tight">{PROJECTS[o.kind].name} · {districtById(o.district).name}</p>
              <span className="status-pill stamp-in" style={{ background: st.bg, color: st.color }}>{st.label}</span>
            </div>
            {o.status === 'approved' && <p className="text-13 font-bold">{deltaText(o.delta) || 'No change'}</p>}
            {o.conditions.length > 0 && <p className="text-13">🤝 With: {o.conditions.join(', ')}</p>}
            <button type="button" className="mt-1 text-[12px] font-bold text-aqua-deep underline" onClick={() => setOpen(open === o.proposalId ? null : o.proposalId)}>
              {open === o.proposalId ? 'Hide' : 'Show'} the rules that decided it
            </button>
            {open === o.proposalId && <ol className="mt-1 flex flex-col gap-1">{o.rules.map((id) => r.events.find((e) => e.id === id)).filter(Boolean).map((e) => <Rule key={e!.id} e={e!} />)}</ol>}
          </div>
        );
      })}
      {loose.length > 0 && <ol className="flex flex-col gap-1">{loose.map((e) => <Rule key={e.id} e={e} />)}</ol>}
      <p className="text-[12px] opacity-70">Effects are illustrative scenario values, not engineering predictions. Geography (zoning, FEMA zones) is real.</p>
    </div>
  );
}

export function FinalPanel({ state, room }: { state: RoomState; room: Room }) {
  const f = state.final;
  const me = state.players.find((p) => p.seat === state.you);
  const host = state.you !== null && state.you === state.hostSeat;
  const proposals = useMemo(() => {
    const seen = new Map<string, Proposal>();
    for (const h of state.history) for (const p of h.board.proposals) if (!seen.has(p.id)) seen.set(p.id, p);
    return [...seen.values()];
  }, [state.history]);
  if (!f) return null;
  const ranked = [...f.scores].sort((a, b) => b.total - a.total);
  const answered = state.mine?.responded ?? null;
  return (
    <div className="flex flex-col gap-3">
      <h2 className="font-display text-32 leading-tight font-black">{f.viable ? 'Miami Beach holds' : 'Miami Beach is in trouble'}</h2>
      <ol className="flex flex-col gap-2">
        {ranked.map((s, i) => {
          const p = state.players.find((x) => x.persona === s.persona);
          return (
            <li key={s.persona} className={`proposal glass ${f.winners.includes(s.persona) ? 'is-winner' : ''}`} style={{ ['--tint' as string]: PERSONA_INFO[s.persona].color }}>
              <div className="flex items-center gap-2">
                <span className="font-display text-24 font-black">{i + 1}</span>
                <PersonaOrb persona={s.persona} size={32} />
                <p className="min-w-0 flex-1 font-bold">{p?.name} <span className="opacity-70">· {PERSONA_INFO[s.persona].name}</span></p>
                <span className="font-display text-24 font-black tabular">{s.total}</span>
                {f.winners.includes(s.persona) && <span className="text-24">🏆</span>}
              </div>
              <ul className="mt-1 text-[12px] opacity-80">{s.parts.map((x) => <li key={x.label}>{x.points >= 0 ? '+' : ''}{x.points} · {x.label}</li>)}</ul>
            </li>
          );
        })}
      </ol>
      {me && (
        <div className="rounded-2xl border-2 border-sun bg-white/70 p-3">
          <p className="font-display text-18 font-black">One honest question</p>
          <p className="text-15">{PREFERENCE_QUESTION}</p>
          <p className="mb-2 text-[12px] opacity-70">Optional. Your answer is stored apart from your role-play, and marked as {state.sessionKind === 'community' ? 'a community participant' : 'a demo participant'}.</p>
          <div className="flex flex-col gap-1">
            {proposals.map((p) => (
              <button key={p.id} type="button" className="aero-btn justify-start !py-1 text-13" aria-pressed={answered === p.id} onClick={() => room.respond(p.id)}>
                {PROJECTS[p.kind].marker} {proposalLabel(p)}
              </button>
            ))}
            <button type="button" className="aero-btn justify-start !py-1 text-13" aria-pressed={answered === 'none'} onClick={() => room.respond('none')}>None of these</button>
          </div>
          {answered && <p className="mt-2 text-13 font-bold text-leaf-deep">Thanks: recorded for the planners.</p>}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Link to={`/studio${state.matchId ? `?match=${state.matchId}` : ''}`} className="aero-btn aero-btn-aqua aero-btn-lg">Open Planning Studio →</Link>
        {host && <button type="button" className="aero-btn" onClick={() => room.again()}>New match</button>}
      </div>
    </div>
  );
}
