// The top ribbon: which round and place, and the three steps of a round as one clear progress bar
// (Play a Card → Make a Deal → See What Happens), with the sprint clock when there is one.
import { useEffect } from 'react';
import { STEP_OF, districtById, type RoomState, type RoundStep } from '@shared';
import { useCountdown } from '../game/Steps';
import { playTick } from '../ui/sound';
import { scenarioById2 } from './bits';

const STEPS: { id: RoundStep; label: string; hint: string }[] = [
  { id: 'play', label: 'Play a Card', hint: 'Pick a project' },
  { id: 'deal', label: 'Make a Deal', hint: 'Negotiate and vote' },
  { id: 'result', label: 'See What Happens', hint: 'Verdict and points' },
];

export function PlanRibbon({ state, offset }: { state: RoomState; offset: number }) {
  const step = STEP_OF[state.phase] ?? null;
  const left = useCountdown(state.pace === 'sprint' ? state.endsAt : null, offset);
  useEffect(() => {
    if (left !== null && left > 0 && left <= 5) playTick();
  }, [left]);
  if (!step) return null;
  const sc = state.plan ? scenarioById2(state.plan.scenarioId) : null;
  const at = STEPS.findIndex((s) => s.id === step);
  return (
    <nav className="ribbon" aria-label={`Round ${state.round} of ${state.totalRounds}: step ${at + 1} of 3, ${STEPS[at]!.label}`}>
      <div className="ribbon-where">
        <b>Round {state.round}<small> of {state.totalRounds}</small></b>
        {sc && <span>{districtById(sc.district).name}</span>}
      </div>
      <ol className="ribbon-steps">
        {STEPS.map((s, i) => (
          <li key={s.id} className={i < at ? 'is-done' : i === at ? 'is-now' : ''} aria-current={i === at ? 'step' : undefined}>
            <span className="ribbon-dot">{i < at ? '✓' : i + 1}</span>
            <span className="ribbon-text"><b>{s.label}</b><small>{s.hint}</small></span>
          </li>
        ))}
      </ol>
      {left !== null && <span className={`ribbon-clock ${left <= 5 ? 'is-low' : ''}`} role="timer" aria-label={`${left} seconds left`}>{left}s</span>}
    </nav>
  );
}
