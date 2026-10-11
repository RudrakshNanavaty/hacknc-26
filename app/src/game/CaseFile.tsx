// The case file: the proposal on the table, pinned to its area on the map. At the reveal it shows the
// clash (who backs it, who fights it); in negotiation it is the table: support vs opposition as the
// rules engine counts them right now, deals on offer, and your one move. Other proposals are a tab
// away, or a click on their marker on the map.
import { useEffect, useMemo } from 'react';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { CARDS, NEGOTIATION_COST, PERSONA_INFO, PROJECTS, districtById, resolveRound, type Attachment, type Board, type RoomState } from '@shared';
import type { Room } from '../room/useRoom';
import { MapAnchor } from '../map/MapAnchor';
import { STATUS_STYLE } from './format';
import { Hints, IfItPasses } from './insights';
import { Soap, Tube } from './ui';

const placeName = (id: string) => districtById(id).name;
const who = (state: RoomState, seat: number) => state.players.find((p) => p.seat === seat);

function sideOf(a: Attachment): 'backs' | 'fights' | 'deal' {
  const cat = CARDS[a.card].category;
  return cat === 'opposition' ? 'fights' : cat === 'negotiation' ? 'deal' : 'backs';
}

function ClashCard({ a, state, side }: { a: Attachment; state: RoomState; side: 'backs' | 'fights' | 'deal' }) {
  const c = CARDS[a.card];
  return (
    <div className={`sc wet ${side} ${side === 'fights' ? 'land-r' : 'land-l'}`}>
      <span className="art">{c.art}</span>
      <span>{c.name}</span>
      <span className="text-[11px] opacity-70">{who(state, a.seat)?.name}</span>
    </div>
  );
}

function Loose({ list, state }: { list: Attachment[]; state: RoomState }) {
  return <>{list.map((a) => <p key={a.seat} className="mt-1 text-13">{CARDS[a.card].art} <b>{CARDS[a.card].name}</b> ({who(state, a.seat)?.name}) in {placeName(a.district)}: {CARDS[a.card].fallback?.text}</p>)}</>;
}

export function CaseFile({ state, room, map, focus, setFocus }: { state: RoomState; room: Room; map: MapLibreMap | null; focus: string | null; setFocus: (id: string | null) => void }) {
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
  const done = !!me && state.players.find((x) => x.seat === me.seat)?.ready;

  if (!p) {
    return (
      <aside className="float-card side-float flex flex-col gap-2" aria-label="This round's table">
        <h2 className="glow-title !text-[26px]">No proposals this round</h2>
        <Loose list={loose} state={state} />
        {negotiating && me && !done && <button type="button" className="gel gel-lime gel-big" onClick={() => room.done()}>Done</button>}
      </aside>
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
  const moved = !!state.mine?.moved;
  const hints = negotiating ? state.hints?.list ?? [] : [];

  return (
    <MapAnchor map={map} district={p.district} label={`${PROJECTS[p.kind].name} in ${placeName(p.district)}`} width={400}>
      <div className="flex flex-col gap-2.5">
        {board.proposals.length > 1 && (
          <div className="tabs">
            {board.proposals.map((x) => (
              <button key={x.id} type="button" className={`gel gel-sm ${x.id === p.id ? 'gel-sun' : ''}`} onClick={() => setFocus(x.id)} title={placeName(x.district)}>
                {PROJECTS[x.kind].marker} {PROJECTS[x.kind].name}
              </button>
            ))}
          </div>
        )}
        <div className="flex items-center gap-3">
          <Soap size={64} tint={owner.color}>{PROJECTS[p.kind].marker}</Soap>
          <div className="min-w-0 flex-1">
            <p className="vr text-18 leading-tight">{PROJECTS[p.kind].name}</p>
            <p className="text-13 font-semibold">{owner.emoji} {who(state, p.seat)?.name} · {placeName(p.district)}</p>
            {p.carried && <span className="lchip lchip-sun mt-1">Delayed from last round</span>}
          </div>
          <span key={`${p.id}-${o.status}`} className={`verdict-pill ${o.status} stamp-in relative !text-[15px] ${o.status === 'approved' ? 'sparkle' : ''}`}>
            {negotiating ? `${st.label}${o.status === 'approved' ? '!' : ''}` : 'Clash!'}
          </span>
        </div>
        <Tube tone="lime" value={o.support} max={max} label={<span className="vr">Support</span>} right={o.support} />
        <Tube tone="coral" value={counted} max={max} label={<span className="vr">Opposition</span>} right={counted} />

        {(backs.length > 0 || fights.length > 0) && (
          <div className="clash-row">
            {backs.map((a) => <ClashCard key={a.seat} a={a} state={state} side={sideOf(a)} />)}
            {backs.length > 0 && fights.length > 0 && <span className="lchip lchip-ink">vs</span>}
            {fights.map((a) => <ClashCard key={a.seat} a={a} state={state} side="fights" />)}
          </div>
        )}
        {acting.length === 0 && <p className="frost p-2 text-center text-13">No one else played on this proposal. It stands on its own support.</p>}
        <IfItPasses state={state} p={p} o={o} />
        {moves.length > 0 && <p className="text-center text-13 font-black">{moves.map((m) => `${who(state, m.seat)?.name} ${m.move === 'back' ? 'backs it 👍' : m.move === 'oppose' ? 'opposes it 👎' : 'funds it 💰'}`).join(' · ')}</p>}

        {offers.map((c) => (
          <div key={c.id} className={`frost p-3 ${c.accepted ? 'ring-2 ring-[#8bd346]' : ''}`}>
            <p className="vr text-[16px]">🤝 {c.title} {c.accepted ? <span className="lchip lchip-lime ml-1">Accepted</span> : <span className="lchip ml-1">offered by {who(state, c.offeredBy)?.name}</span>}</p>
            <p className="mt-1 text-13 font-semibold">{c.text}</p>
            {negotiating && !c.accepted && c.owner === state.you && <button type="button" className="gel gel-sun gel-sm mt-2" onClick={() => room.accept(c.id)}>Accept the deal</button>}
            {negotiating && !c.accepted && c.owner !== state.you && <p className="mt-1 text-[12px] opacity-75">Waiting for {who(state, c.owner)?.name} to accept…</p>}
          </div>
        ))}

        {!negotiating && <p className="text-center text-13 font-black">Negotiation opens in a moment: back, oppose, fund, or take a deal.</p>}

        {(hints.length > 0 || loose.length > 0) && (
          <details className="frost p-2 text-13">
            <summary className="cursor-pointer font-black">
              {[hints.length ? `💡 ${hints.length} table hint${hints.length > 1 ? 's' : ''}` : '', loose.length ? `${loose.length} card${loose.length > 1 ? 's' : ''} found nothing to act on` : ''].filter(Boolean).join(' · ')}
            </summary>
            {hints.length > 0 && <div className="mt-2"><Hints hints={hints} state={state} room={room} /></div>}
            <Loose list={loose} state={state} />
          </details>
        )}

        {negotiating && me && !done && (
          <div className="anchor-foot">
            {!moved && (
              <div className="grid grid-cols-3 gap-2">
                <button type="button" className="gel gel-lime" disabled={me.influence < NEGOTIATION_COST.back} onClick={() => room.move('back', p.id)}>👍 Back</button>
                <button type="button" className="gel gel-coral" disabled={me.influence < NEGOTIATION_COST.oppose || p.seat === state.you} onClick={() => room.move('oppose', p.id)}>👎 Oppose</button>
                <button type="button" className="gel" disabled={me.influence < NEGOTIATION_COST.fund || PROJECTS[p.kind].budgetCost === 0 || o.funding === 'covered'} onClick={() => room.move('fund', p.id)}>💰 Fund</button>
              </div>
            )}
            <p className="text-center text-[11px] font-black opacity-80">{moved ? 'Move made.' : 'One move per round · back 1 · oppose 1 · fund 2 influence.'} The verdict is the rules engine run on the table as it stands.</p>
            <button type="button" className="gel gel-lime" onClick={() => room.done()}>{moved ? 'Done ✓' : 'Pass and finish'}</button>
          </div>
        )}
        {negotiating && done && <p className="frost p-2 text-center text-13 font-black">You’re done. Waiting for the table…</p>}
      </div>
    </MapAnchor>
  );
}
