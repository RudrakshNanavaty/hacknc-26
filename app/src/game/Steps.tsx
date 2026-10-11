// Where you are, and the one thing to do now. The round is three steps (STEP_OF in shared/src/room.ts):
// Play a Card (the crisis lands, then you choose), Make a Deal (the reveal, then the table), See What
// Happens (the result). Under the steps sits a single short instruction for this moment, so the
// screen never asks for two things at once. In a sprint the step carries the server's countdown.
import { useEffect, useState } from 'react';
import { STEP_OF, type CrisisKind, type RoomState, type RoundStep } from '@shared';
import { playTick } from '../ui/sound';

const STEPS: { id: RoundStep; n: number; label: string }[] = [
  { id: 'play', n: 1, label: 'Play a Card' },
  { id: 'deal', n: 2, label: 'Make a Deal' },
  { id: 'result', n: 3, label: 'See What Happens' },
];

/** Seconds left on the server's deadline (null without one), ticking with the clock. */
export function useCountdown(endsAt: number | null, offset: number): number | null {
  const [now, setNow] = useState(() => Date.now() + offset);
  useEffect(() => {
    if (endsAt === null) return;
    const t = setInterval(() => setNow(Date.now() + offset), 250);
    return () => clearInterval(t);
  }, [endsAt, offset]);
  return endsAt === null ? null : Math.max(0, Math.ceil((endsAt - now) / 1000));
}

export function RoundSteps({ state, offset }: { state: RoomState; offset: number }) {
  const step = STEP_OF[state.phase] ?? null;
  const left = useCountdown(state.pace === 'sprint' && state.crisis ? state.endsAt : null, offset);
  useEffect(() => {
    if (left !== null && left > 0 && left <= 5) playTick();
  }, [left]);
  if (!step) return null;
  const at = STEPS.findIndex((s) => s.id === step);
  return (
    <nav className="steps hud-block" aria-label={`Round ${state.round} of ${state.totalRounds}: step ${at + 1} of 3, ${STEPS[at]!.label}`}>
      <span className="steps-round">Round {state.round}<small>/{state.totalRounds}</small></span>
      <ol className="steps-list">
        {STEPS.map((s, i) => (
          <li key={s.id} className={`step ${i < at ? 'is-done' : i === at ? 'is-now' : ''}`} aria-current={i === at ? 'step' : undefined}>
            <span className="step-n">{i < at ? '✓' : s.n}</span>
            <span className="step-label">{s.label}</span>
          </li>
        ))}
      </ol>
      {left !== null && <span className={`steps-clock ${left <= 5 ? 'is-low' : ''}`} role="timer" aria-label={`${left} seconds left`}>⏱ {left}s</span>}
    </nav>
  );
}

const CRISIS_LINE: Record<CrisisKind, string> = {
  flood: '🌊 The streets are flooding!',
  storm: '🌀 A storm is heading for Miami Beach!',
  erosion: '🏖️ The beach is washing away!',
  development: '🏗️ Developers want to build big!',
  budget: '💸 The city is running short of money!',
};

/** What the page knows that the server does not: which card you hold, which area is open. */
export interface LocalUi {
  armed: boolean;
  confirming: boolean;
  /** Negotiation: a compromise is offered to you; you made your move. */
  offered: boolean;
  moved: boolean;
  /** The project in view is your own (you cannot oppose it). */
  own: boolean;
}

/** The one instruction for this moment (12 words or fewer). */
export function instructionFor(state: RoomState, ui: LocalUi): string {
  const me = state.players.find((p) => p.seat === state.you);
  const c = state.conflict;
  if (state.mode === 'beginner' && c) {
    const mine = me?.persona === c.owner;
    switch (state.phase) {
      case 'crisis': return mine ? 'You propose a project. Read it, then go on.' : 'One decision this round. Read it, then go on.';
      case 'select':
        if (mine) return 'Your project is on the table. The others answer it.';
        return state.mine?.selection ? '🔒 Played. Waiting for the others…' : '👇 Pick one card to answer it.';
      case 'reveal': return "👀 Here's what everyone played.";
      case 'negotiate':
        if (me?.ready) return '✓ Done. Waiting for the others…';
        if (ui.offered) return '🤝 Someone asks for a change. Accept it?';
        if (ui.moved) return 'Move made. Press Done.';
        return ui.own ? 'Your project: back it, or wait for changes.' : 'Support it, oppose it, or suggest a change?';
      case 'resolve': return state.round >= state.totalRounds ? "🌀 Here's what happened, and the storm." : "Here's what happened.";
      default: return '';
    }
  }
  switch (state.phase) {
    case 'crisis':
      return state.crisis ? CRISIS_LINE[state.crisis.kind] : 'Checking the tide and the weather in Miami Beach…';
    case 'select':
      if (state.mine?.selection) return '🔒 Locked in. Waiting for the others…';
      if (ui.confirming) return 'Check it, then lock it in.';
      if (ui.armed) return '👆 Choose where to play it: a green area.';
      return '👇 Pick a card from your hand.';
    case 'reveal':
      return "👀 Here's what everyone played.";
    case 'negotiate':
      if (me?.ready) return '✓ Done. Waiting for the others…';
      if (ui.offered) return '🤝 You were offered a deal. Accept it?';
      if (ui.moved) return 'Move made. Press Done.';
      return ui.own ? 'Your project: back it, or pay its bill?' : 'Support it, oppose it, or pay for it?';
    case 'resolve':
      return state.round >= state.totalRounds ? "🌀 Here's what happened, and the storm." : "Here's what happened.";
    default:
      return '';
  }
}
