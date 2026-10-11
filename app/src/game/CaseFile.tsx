// The case file (step 2, Make a Deal), pinned beside the proposal's area. Top: the project, where, whose,
// and its likely outcome right now (the rules engine run on the table as it stands). Then only the moves
// you can actually make, each with a one-line preview of what it changes, computed by running the engine
// with that move added: Support (+1 support), Oppose (+1 opposition), Pay for it (the `fund` move: you
// cover its public bill), Accept deal (a compromise offered on your own project). Who played what,
// table hints, reactions and cards with nothing to act on are under More.
import { useEffect, useMemo } from 'react';
import type { Map as MapLibreMap } from 'maplibre-gl';
import {
  CARDS, NEGOTIATION_COST, PERSONA_INFO, PING_EMOTES, PROJECTS, SUGGESTED_CHANGES, cardName, checkBeginnerMove, districtById, resolveRound, suggestion,
  type BeginnerMove,
  type Attachment, type Board, type InfluenceMove, type NegotiationAction, type Outcome, type OutcomeStatus, type Proposal, type RoomState,
} from '@shared';
import type { Room } from '../room/useRoom';
import { MapAnchor } from '../map/MapAnchor';
import { Hints, IfItPasses } from './insights';
import { Soap } from './ui';
import { useCard } from './story';
import { CardArt } from './CardArt';
import { moveBlocker } from './moves';

const placeName = (id: string) => districtById(id).name;
const who = (state: RoomState, seat: number) => state.players.find((p) => p.seat === seat);

/** The likely outcome, in a few words. */
export const LIKELY: Record<OutcomeStatus, { icon: string; text: string }> = {
  approved: { icon: '✅', text: 'Would pass' },
  rejected: { icon: '❌', text: 'Would be rejected' },
  blocked: { icon: '⛔', text: 'Blocked by a rule' },
  delayed: { icon: '⏳', text: 'Tie: delayed a round' },
  unfunded: { icon: '💸', text: 'Passes, but nobody pays' },
};

function sideOf(a: Attachment): 'backs' | 'fights' | 'deal' {
  const cat = CARDS[a.card].category;
  return cat === 'opposition' ? 'fights' : cat === 'negotiation' ? 'deal' : 'backs';
}

function ClashCard({ a, state }: { a: Attachment; state: RoomState }) {
  const story = useCard(a.card);
  const side = sideOf(a);
  return (
    <div className={`sc wet ${side} ${side === 'fights' ? 'land-r' : 'land-l'}`}>
      <CardArt id={a.card} className="sc-art" />
      <span>{story.name}</span>
      <span className="text-[11px] opacity-70">{side === 'fights' ? '👎 ' : '👍 '}{who(state, a.seat)?.name}</span>
    </div>
  );
}

interface Action {
  key: string;
  label: string;
  cost: number;
  effect: string;
  after: Outcome | undefined;
  /** Suggest a Change: the outcome if the owner does not accept. */
  afterNo?: Outcome | undefined;
  run: () => void;
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
  const p: Proposal | undefined = board.proposals.find((x) => x.id === focus) ?? board.proposals[0];
  const loose = board.attachments.filter((a) => !a.proposalId);
  const done = !!me?.ready && negotiating;

  if (!p) {
    return (
      <aside className="float-card side-float flex flex-col gap-2" aria-label="This round's table">
        <h2 className="glow-title !text-[24px]">No projects this round</h2>
        <p className="text-13 font-semibold">Nobody proposed a project, so there is nothing to vote on.</p>
        {negotiating && me && !done && <button type="button" className="gel gel-lime gel-big" onClick={room.done}>Done ▶</button>}
      </aside>
    );
  }

  const o = preview.outcomes.find((x) => x.proposalId === p.id)!;
  const acting = board.attachments.filter((a) => a.proposalId === p.id);
  const moves = state.actions.filter((a) => a.proposalId === p.id);
  const owner = PERSONA_INFO[p.persona];
  const moved = !!state.mine?.moved;
  const beginnerMode = state.mode === 'beginner';
  const likely = LIKELY[o.status];
  const hints = negotiating ? state.hints?.list ?? [] : [];

  // What each move would do, from the engine itself.
  const outcomeWith = (extra: NegotiationAction | null, acceptId: string | null) => {
    const b: Board = acceptId ? { ...board, compromises: board.compromises.map((c) => (c.id === acceptId ? { ...c, accepted: true } : c)) } : board;
    return resolveRound(b, extra ? [...state.actions, extra] : state.actions, state.city).outcomes.find((x) => x.proposalId === p.id);
  };
  const actions: Action[] = [];
  if (negotiating && me && !done) {
    for (const c of board.compromises.filter((x) => x.proposalId === p.id && x.owner === me.seat && !x.accepted)) {
      actions.push({
        key: c.id, label: c.kind === 'change' ? `🤝 Accept the change: ${c.title}` : `🤝 Accept deal: ${c.title}`, cost: 0,
        effect: c.kind === 'change' ? `${who(state, c.offeredBy)?.name} asks. If you do not accept it counts as +1 against` : `Offered by ${who(state, c.offeredBy)?.name}`,
        after: outcomeWith(null, c.id), run: () => room.accept(c.id),
      });
    }
    if (!moved && beginnerMode) {
      // Beginner Mode: three free moves, each previewed by the engine with it on the table.
      const change = SUGGESTED_CHANGES[p.kind];
      const wanted = suggestion(board, p.id, me.seat);
      const withChange = (acceptedIt: boolean) => {
        const b: Board = { ...board, compromises: [...board.compromises, { ...wanted, accepted: acceptedIt }] };
        return resolveRound(b, [...state.actions, { seat: me.seat, persona: me.persona, move: 'suggest', proposalId: p.id }], state.city).outcomes.find((x) => x.proposalId === p.id);
      };
      const B: { move: BeginnerMove; label: string; effect: string }[] = [
        { move: 'back', label: '👍 Support', effect: '+1 for' },
        { move: 'oppose', label: '👎 Oppose', effect: '+1 against' },
        { move: 'suggest', label: `💡 Suggest a change: ${change.title}`, effect: 'If they accept: +1 for, and the change is built in. If not: +1 against' },
      ];
      for (const m of B) {
        if (checkBeginnerMove(board, me.seat, m.move, p.id)) continue;
        actions.push({
          key: m.move, label: m.label, cost: 0, effect: m.effect,
          after: m.move === 'suggest' ? withChange(true) : outcomeWith({ seat: me.seat, persona: me.persona, move: m.move, proposalId: p.id }, null),
          afterNo: m.move === 'suggest' ? withChange(false) : undefined,
          run: () => room.move(m.move, p.id),
        });
      }
    } else if (!moved) {
      const MOVES: { move: InfluenceMove; label: string; effect: string }[] = [
        { move: 'back', label: '👍 Support', effect: '+1 support' },
        { move: 'oppose', label: '👎 Oppose', effect: '+1 opposition' },
        { move: 'fund', label: '💲 Pay for it', effect: `You cover its $${PROJECTS[p.kind].budgetCost}M bill, not the city` },
      ];
      for (const m of MOVES) {
        if (moveBlocker(m.move, { board, seat: me.seat, influence: me.influence, proposalId: p.id, funding: o.funding })) continue;
        actions.push({
          key: m.move, label: m.label, cost: NEGOTIATION_COST[m.move], effect: m.effect,
          after: outcomeWith({ seat: me.seat, persona: me.persona, move: m.move, proposalId: p.id }, null), run: () => room.move(m.move, p.id),
        });
      }
    }
  }
  const afterText = (a: Outcome | undefined) => {
    if (!a) return '';
    const l = LIKELY[a.status];
    return a.status === o.status ? `still ${l.text.toLowerCase()}` : `${l.icon} ${l.text.toLowerCase()}!`;
  };

  return (
    <MapAnchor map={map} district={p.district} label={`${PROJECTS[p.kind].name} in ${placeName(p.district)}`} width={360}>
      <div className="flex flex-col gap-2">
        {board.proposals.length > 1 && (
          <div className="tabs">
            {board.proposals.map((x) => (
              <button key={x.id} type="button" className={`gel gel-sm ${x.id === p.id ? 'gel-sun' : ''}`} onClick={() => setFocus(x.id)} title={placeName(x.district)}>
                {PROJECTS[x.kind].marker} {PROJECTS[x.kind].name}
              </button>
            ))}
          </div>
        )}
        <div className="flex items-center gap-2.5">
          <Soap size={54} tint={owner.color}>{PROJECTS[p.kind].marker}</Soap>
          <div className="min-w-0 flex-1">
            <p className="vr text-[17px] leading-tight">{PROJECTS[p.kind].name}</p>
            <p className="text-13 font-semibold">📍 {placeName(p.district)} · {who(state, p.seat)?.name}{p.carried ? ' · from last round' : ''}</p>
          </div>
        </div>
        <p key={`${p.id}-${o.status}`} className={`likely is-${o.status} stamp-in`}>
          <span>{likely.icon} {likely.text}</span>
          <small>{o.support} for · {o.opposition - o.ignored} against</small>
        </p>
        {!negotiating && acting.length > 0 && (
          <div className="clash-row">{acting.map((a) => <ClashCard key={a.seat} a={a} state={state} />)}</div>
        )}

        {actions.map((a) => (
          <button key={a.key} type="button" className="act-row" onClick={a.run}>
            <span className="act-main">
              <b>{a.label}</b>
              <small>{a.effect}{a.afterNo ? ` → accepted: ${afterText(a.after)}; not: ${afterText(a.afterNo)}` : a.after ? ` → ${afterText(a.after)}` : ''}</small>
            </span>
            {beginnerMode ? null : a.cost > 0 ? <span className="cost-dot" title={`${a.cost} influence`}>{a.cost}</span> : <span className="act-free">free</span>}
          </button>
        ))}
        {negotiating && me && !done && (
          <>
            {!moved && actions.length === 0 && <p className="text-13 font-bold opacity-80">No move you can afford here. You can still finish.</p>}
            <button type="button" className={`gel ${moved ? 'gel-lime gel-big' : ''}`} onClick={room.done}>{moved ? 'Done ▶' : beginnerMode ? 'Skip my move' : 'Pass: keep my influence'}</button>
          </>
        )}
        <IfItPasses state={state} p={p} o={o} />

        <details className="frost p-2 text-13">
          <summary className="cursor-pointer font-black">More: who played what{hints.length ? ', hints' : ''}{loose.length ? ', other cards' : ''}</summary>
          <div className="mt-2 flex flex-col gap-2">
            {negotiating && acting.length > 0 && <div className="clash-row">{acting.map((a) => <ClashCard key={a.seat} a={a} state={state} />)}</div>}
            {acting.length === 0 && <p className="font-semibold">No one else played a card on this project.</p>}
            {moves.length > 0 && <p className="font-black">{moves.map((m) => `${who(state, m.seat)?.name}: ${m.move === 'back' ? '👍 support' : m.move === 'oppose' ? '👎 oppose' : '💲 paid'}`).join(' · ')}</p>}
            {board.compromises.filter((c) => c.proposalId === p.id).map((c) => <p key={c.id}><b>🤝 {c.title}</b>{c.accepted ? ' (accepted)' : ''}: {c.text}</p>)}
            {hints.length > 0 && <Hints hints={hints} state={state} room={room} />}
            {loose.map((a) => <p key={a.seat}><b>{cardName(a.card, state.crisis)}</b> ({who(state, a.seat)?.name}) in {placeName(a.district)}: {CARDS[a.card].fallback?.text}</p>)}
            {negotiating && me && (
              <div className="flex items-center gap-1.5" role="group" aria-label="React on the map">
                <span className="text-[12px] font-black opacity-80">React:</span>
                {PING_EMOTES.map((e) => <button key={e} type="button" className="ping-btn" onClick={() => room.ping(p.district, e)} aria-label={`React ${e} on ${placeName(p.district)}`}>{e}</button>)}
              </div>
            )}
          </div>
        </details>
      </div>
    </MapAnchor>
  );
}
