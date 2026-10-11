// Your hand, fanned along the bottom of the map. While you choose, it is the four cards this crisis
// dealt you: point at one to light the areas it may go to, click it to hold it, then click a lit area
// to read it there and deploy. While the table negotiates, the same fan is your move: back, oppose or
// fund the proposal in view, or pass. The rules are the engine's (blocker, checkMove); this only draws
// them. Outside those two phases the hand tucks below the edge.
import { useEffect, useMemo, type CSSProperties } from 'react';
import { CARDS, DISTRICT_IDS, PERSONA_INFO, PROJECTS, cardName, dealtHand, districtById, resolveRound, type CardId, type RoomState } from '@shared';
import type { Room } from '../room/useRoom';
import { blocker } from './DistrictPopover';
import { MOVE_CARDS, moveBlocker } from './moves';

const MOVE_COLOR = { lime: '#8bd346', coral: '#ff7a6b', sun: '#ffd23f' } as const;
const CATEGORY = { project: 'Project', support: 'Support', opposition: 'Opposition', negotiation: 'Deal' } as const;

type Tone = 'project' | 'support' | 'opposition' | 'negotiation' | 'lime' | 'coral' | 'sun' | 'pass';

interface Face {
  key: string;
  icon: string;
  name: string;
  cost: number | null;
  text: string;
  tag: string;
  tone: Tone;
  color: string;
  /** Why it cannot be played right now (null: it can). */
  why: string | null;
  /** The small line at the foot when it can be played. */
  foot?: string;
  /** Held for the next click on the map (select) or already played (locked). */
  armed?: boolean;
  locked?: boolean;
  card?: CardId;
  onPick?: () => void;
}

export function HandDeck({ state, room, armed, setArmed, onHoverCard, focus }: {
  state: RoomState;
  room: Room;
  armed: CardId | null;
  setArmed: (card: CardId | null) => void;
  /** Pointer or focus on a card: the map lights up where it may go. */
  onHoverCard: (card: CardId | null) => void;
  /** The proposal in view on the case file (negotiation). */
  focus: string | null;
}) {
  const me = state.players.find((p) => p.seat === state.you) ?? null;
  const mode = state.phase === 'select' ? 'select' : state.phase === 'negotiate' ? 'negotiate' : null;
  const locked = state.mine?.selection ?? null;
  const moved = !!state.mine?.moved;
  const done = !!me?.ready && mode === 'negotiate';

  const board = state.board;
  const preview = useMemo(() => (board ? resolveRound(board, state.actions, state.city) : null), [board, state.actions, state.city]);
  const proposal = board ? board.proposals.find((p) => p.id === focus) ?? board.proposals[0] ?? null : null;
  const outcome = proposal && preview ? preview.outcomes.find((o) => o.proposalId === proposal.id) ?? null : null;

  useEffect(() => {
    if (!armed) return;
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setArmed(null);
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [armed, setArmed]);

  if (!me) return null;
  const open = (mode === 'select' || (mode === 'negotiate' && !done));

  let faces: Face[];
  if (mode === 'negotiate') {
    faces = [
      ...MOVE_CARDS.map<Face>((m) => {
        const why = moved ? 'Move made' : !board || !proposal ? 'Nothing on the table'
          : moveBlocker(m.move, { board, seat: me.seat, influence: me.influence, proposalId: proposal.id, funding: outcome?.funding ?? null });
        return {
          key: m.move, icon: m.icon, name: m.name, cost: m.cost, text: m.blurb, tag: 'Move', tone: m.tone, color: MOVE_COLOR[m.tone],
          why, foot: proposal ? PROJECTS[proposal.kind].name : undefined,
          onPick: () => proposal && room.move(m.move, proposal.id),
        };
      }),
      {
        key: 'pass', icon: moved ? '✅' : '✋', name: moved ? 'Done' : 'Pass', cost: null, tag: 'Finish', tone: 'pass', color: '#8bd346', why: null,
        text: moved ? 'Finish the round with your move made.' : 'No move this round. Keep your influence.',
        onPick: () => room.done(),
      },
    ];
  } else {
    const hand = dealtHand(me.persona, state.round, state.crisis);
    faces = hand.map<Face>((id) => {
      const c = CARDS[id];
      const areas = DISTRICT_IDS.filter((d) => !blocker(id, d, me.influence));
      const why = c.cost > me.influence ? `Needs ${c.cost} ⚡ (you have ${me.influence})` : areas.length === 0 ? 'No legal area now' : null;
      return {
        key: `${state.round}-${id}`, icon: c.art, name: cardName(id, state.crisis), cost: c.cost, text: c.text, tag: CATEGORY[c.category], tone: c.category,
        color: PERSONA_INFO[c.persona].color, why, card: id,
        foot: `${areas.length} of ${DISTRICT_IDS.length} areas`,
        armed: armed === id, locked: locked?.card === id,
        onPick: () => setArmed(armed === id ? null : id),
      };
    });
  }

  const n = faces.length;
  const sealed = mode === 'select' && !!locked;
  const label = mode === 'negotiate'
    ? moved ? 'Move made' : `Your move on ${proposal ? PROJECTS[proposal.kind].name : 'the table'}`
    : sealed ? `Played face down in ${districtById(locked!.district).name}`
      : armed ? `Pick a lit area for ${cardName(armed, state.crisis)}` : 'Your hand';

  return (
    <div className="deck deck-block" data-open={open} data-mode={mode ?? 'select'} role="group" aria-label={mode === 'negotiate' ? 'Your negotiation move' : 'Your hand'} aria-hidden={!open}>
      <p className="deck-label lchip">{label} · ⚡ {me.influence}</p>
      {faces.map((f, i) => {
        const spread = i - (n - 1) / 2;
        const off = !!f.why || sealed;
        const style = { ['--i']: i, ['--rot']: `${spread * 6.5}deg`, ['--dy']: `${spread * spread * 3}px`, ['--c']: f.color } as CSSProperties;
        return (
          <button
            key={f.key} type="button"
            className={`hcard tone-${f.tone} ${f.armed ? 'is-armed' : ''} ${f.locked ? 'is-locked' : ''} ${off && !f.locked ? 'is-off' : ''}`}
            style={style} tabIndex={open ? 0 : -1} aria-disabled={off} aria-pressed={f.card ? !!f.armed : undefined}
            aria-describedby={f.why ? `${f.key}-why` : undefined}
            onClick={() => !off && f.onPick?.()}
            onPointerEnter={() => !off && f.card && onHoverCard(f.card)} onPointerLeave={() => f.card && onHoverCard(null)}
            onFocus={() => !off && f.card && onHoverCard(f.card)} onBlur={() => f.card && onHoverCard(null)}
          >
            <span className="hc-top">
              {f.cost !== null ? <span className="hc-cost" aria-label={`${f.cost} influence`}>{f.cost}</span> : <span className="hc-cost hc-free" aria-hidden>·</span>}
              <span className="hc-tag">{f.tag}</span>
            </span>
            <span className="hc-art" aria-hidden>{f.icon}</span>
            <span className="hc-name vr">{f.name}</span>
            <span className="hc-text">{f.text}</span>
            {f.why
              ? <span id={`${f.key}-why`} className="hc-foot is-why" title={f.why}>{f.why}</span>
              : f.locked ? <span className="hc-foot is-locked">Face down</span> : f.foot ? <span className="hc-foot">{f.foot}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
