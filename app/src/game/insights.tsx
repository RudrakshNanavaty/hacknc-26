// What the rules and the Game Director add to the lagoon screens, in the Aero Lagoon look:
// the round's twist, "why?" explanations, public negotiation hints, before/after previews,
// "if it passes" effects, combos, the round's bill, and the end-of-match recap. Every number shown
// here comes from the shared engine or the validated state the server sent; the AI only words things.
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  COMBOS, INDICATORS, INDICATOR_INFO, NEGOTIATION_COST, PROJECTS, WALLET_INFO, billFor, districtById, ifApproved, inMillions, upcomingCosts,
  type AcceptedEvent, type ComboHit, type Delta, type Outcome, type ProjectPreview, type Proposal, type RoomState, type TableHint,
} from '@shared';
import type { Room } from '../room/useRoom';
import type { ExplainAnswer } from '../api';
import { deltaText } from './format';

const fmt = (k: keyof typeof INDICATOR_INFO, v: number) => (k === 'budget' ? `$${v}M` : String(v));

/** Count toward a new value (one bounded animation per change; none with reduced motion). */
export function useTween(value: number, ms = 900) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setShown(value);
      from.current = value;
      return;
    }
    const start = from.current;
    const t0 = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / ms);
      const v = Math.round(start + (value - start) * (1 - (1 - k) ** 3));
      setShown(v);
      from.current = v;
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, ms]);
  return shown;
}

/** The round's twist: game fiction, checked and sized by the rules (the AI never sets its numbers). */
export function TwistCard({ ev }: { ev: AcceptedEvent }) {
  return (
    <div className="frost twist-card flex flex-col gap-1 p-3">
      <p className="flex flex-wrap items-center gap-1.5">
        <span className="lchip lchip-sun">🎲 Game event · fictional</span>
        <span className="lchip" title={ev.source === 'gemini' ? 'Proposed by the AI Game Director, checked and sized by the rules' : 'Authored fallback event'}>
          {ev.source === 'gemini' ? '✦ AI-proposed, rules-checked' : 'Authored'}
        </span>
      </p>
      <p className="vr text-18 leading-tight">{ev.title} · {districtById(ev.district).name}</p>
      <p className="text-13 font-semibold">{ev.narrative}</p>
      <p className="text-13 font-black">
        {deltaText(ev.delta)}{ev.resilience ? ` · area resilience ${ev.resilience}` : ''}{' '}
        <span className="font-semibold opacity-70">(illustrative, when play starts)</span>
      </p>
    </div>
  );
}

/** "Why?": the engine's answer from the rules and the GIS facts, optionally reworded in plain language. */
export function WhyButton({ ask, label = 'Why?' }: { ask: () => Promise<ExplainAnswer>; label?: string }) {
  const [a, setA] = useState<ExplainAnswer | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <span className="flex flex-col items-start gap-1">
      <button
        type="button" className="gel gel-sm" disabled={busy}
        onClick={() => {
          setBusy(true);
          ask()
            .then(setA, () => setA({ question: '', answer: 'Could not reach the server. The rule text above is the full answer.', source: 'template' }))
            .finally(() => setBusy(false));
        }}
      >
        {busy ? '…' : `🤔 ${label}`}
      </button>
      {a && <span className="why-answer">{a.source === 'gemini' && <b className="text-[#0a6f9a]" title="Reworded by the AI from the engine's answer">✦ </b>}{a.answer}</span>}
    </span>
  );
}

/** Public hints: the engine found these moves; the AI may only word them. Everyone sees the same ones. */
export function Hints({ hints, state, room }: { hints: TableHint[]; state: RoomState; room: Room }) {
  const [hidden, setHidden] = useState<string[]>([]);
  const shown = hints.filter((h) => !hidden.includes(h.id));
  if (!shown.length) return null;
  return (
    <div className="frost hint-box flex flex-col gap-1.5 p-3">
      <p className="text-[11px] font-black tracking-wide uppercase opacity-75">Table hints · everyone sees these · you decide</p>
      {shown.map((h) => {
        const mine = h.seat === state.you;
        const canDo = mine && ((h.kind === 'move' && !state.mine?.moved) || h.kind === 'accept');
        return (
          <div key={h.id} className="flex items-start gap-1.5">
            <span className="text-15">{h.kind === 'combo' ? '✨' : h.kind === 'accept' ? '🤝' : '💡'}</span>
            <p className="min-w-0 flex-1 text-13 font-semibold">
              {h.source === 'gemini' && <b className="text-[#0a6f9a]" title="Worded by the AI; the move was found by the rules engine">✦ </b>}{h.text}
            </p>
            {canDo && (
              <button
                type="button" className="gel gel-lime gel-sm"
                onClick={() => (h.kind === 'accept' && h.compromiseId ? room.accept(h.compromiseId) : h.move && h.move !== 'accept' ? room.move(h.move, h.proposalId) : undefined)}
              >
                {h.kind === 'accept' ? 'Accept deal' : h.move === 'back' ? `👍 Back (${NEGOTIATION_COST.back})` : h.move === 'oppose' ? `👎 Oppose (${NEGOTIATION_COST.oppose})` : `💰 Fund (${NEGOTIATION_COST.fund})`}
              </button>
            )}
            <button type="button" className="hint-x" aria-label="Dismiss hint" onClick={() => setHidden([...hidden, h.id])}>✕</button>
          </div>
        );
      })}
    </div>
  );
}

/** Before -> after for the indicators a project would move, if approved as it stands. */
export function PreviewBox({ p }: { p: ProjectPreview }) {
  const moved = INDICATORS.filter((k) => p.after[k] !== p.before[k]);
  return (
    <div className="frost flex flex-col gap-1.5 p-3">
      <p className="text-[11px] font-black tracking-wide uppercase opacity-75">If approved as it stands · illustrative</p>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {moved.map((k) => {
          const up = p.after[k] > p.before[k];
          return (
            <span key={k} className="text-13 font-black whitespace-nowrap">
              {INDICATOR_INFO[k].icon} {fmt(k, p.before[k])} → <span className={up ? 'text-[#2f7a0e]' : 'text-[#c0392b]'}>{fmt(k, p.after[k])}</span>
            </span>
          );
        })}
      </div>
      {p.warnings.map((w) => <p key={w} className="warn-line">⚠ {w}</p>)}
    </div>
  );
}

/** What the focused proposal would change if it passes (or is changing, if it passes as things stand). */
export function IfItPasses({ state, p, o }: { state: RoomState; p: Proposal; o: Outcome }) {
  const project = PROJECTS[p.kind];
  // The engine itself, run as if the vote tipped: crisis bonus, conditions, cards' effects and combos included.
  const would = useMemo(() => (state.board ? ifApproved(state.board, state.actions, state.city, p.id) : null), [state.board, state.actions, state.city, p.id]);
  if (o.status === 'blocked' || would?.status === 'blocked') {
    return <p className="frost px-3 py-2 text-center text-13 font-semibold">Blocked by a rule (see the verdict): backing cannot pass it as it stands.</p>;
  }
  const delta: Delta = would?.delta ?? project.delta;
  return (
    <p className="frost px-3 py-2 text-center text-13 font-semibold">
      {o.status === 'approved' ? 'Passing now: ' : 'If it passes: '}
      {would?.status === 'unfunded' ? <b>it would be approved but unfunded (nobody can pay for it)</b> : <b>{deltaText(delta) || 'no change'}</b>}
      {o.status === 'approved' && o.paidBy ? ` · paid by ${WALLET_INFO[o.paidBy].short} ($${project.privateCost || project.budgetCost}M)` : project.budgetCost + project.privateCost > 0 && would?.status !== 'unfunded' ? ` · costs $${project.privateCost || project.budgetCost}M` : ''}
      {project.upkeep > 0 ? ` · then $${project.upkeep}M upkeep a round` : ''}
      <span className="opacity-70"> (illustrative)</span>
    </p>
  );
}

export function ComboBanners({ combos }: { combos: ComboHit[] }) {
  return (
    <>
      {combos.map((c) => (
        <div key={c.event} className="combo-banner wet">
          <span className="text-24">✨</span>
          <div>
            <p className="vr text-16">Combo: {COMBOS[c.combo].name}</p>
            <p className="text-13 font-semibold">{districtById(c.district).name} · {deltaText(c.delta)}</p>
          </div>
        </div>
      ))}
    </>
  );
}

/** Three rounds at a glance: what was built, combos, twists. */
export function Recap({ state }: { state: RoomState }) {
  return (
    <ol className="flex flex-col gap-1.5">
      {state.history.map((h) => {
        const built = h.resolution.outcomes.filter((o) => o.status === 'approved');
        return (
          <li key={h.round} className="frost recap-round flex items-start gap-2 p-2">
            <span className="recap-n">{h.round}</span>
            <span className="min-w-0 flex-1 text-13 font-semibold">
              <b>{h.board.crisis.title}</b>
              {built.length ? ` · built ${built.map((o) => `${PROJECTS[o.kind].marker} ${districtById(o.district).name}`).join(', ')}` : ' · nothing built'}
              {(h.resolution.combos ?? []).map((c) => <span key={c.event} className="recap-tag">✨ {COMBOS[c.combo].name}</span>)}
              {h.event && <span className="recap-tag is-twist" title="Game event (fictional)">🎲 {h.event.title}{h.event.source === 'gemini' ? ' ✦' : ''}</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** What the city already owes when this round resolves: upkeep, installments, availability payments, delayed consequences. */
export function Bill({ state }: { state: RoomState }) {
  if (state.phase === 'resolve' || state.phase === 'final' || state.phase === 'lobby') return null;
  // The bill as the engine will charge it (reserves first, arrears if the budget is short).
  const bill = billFor(state.city, state.round);
  const up = upcomingCosts(state.city);
  const parts = [
    ...bill.entries.map((e) => `${e.kind === 'arrears' ? '⚠ arrears ' : ''}${e.kind === 'upkeep' ? 'upkeep' : e.kind === 'debt-service' ? 'bond installment' : e.kind === 'availability' ? `partner payment to ${WALLET_INFO[e.to].short}` : e.rule} $${inMillions(e.amount)}M`),
    ...up.pending.filter((p) => p.dueRound <= state.round).map((p) => p.text.replace(/\.$/, '')),
  ];
  if (!parts.length) return null;
  return <p className="lchip lchip-sun bill-chip" title="Charged when this round resolves (simulated money, illustrative effects)">⏳ This round’s bill: {parts.join(' · ')}</p>;
}

