// Step 3, See What Happens. Each project's verdict lands on the map (Flights.tsx `Stamps`) and reads as
// one plain sentence on the result card (`outcomeSentence`). After the last round, once, the storm hits:
// rain, thunder, the city's flood safety rising against the line it needs, and the verdict, with the real
// FEMA flood zones filling the map if the city falls short. Then the result card.
// Presentation only: the outcomes and the storm's damage (rule S9) are the engine's, already resolved.
import { useEffect, useState } from 'react';
import { INDICATORS, PLAIN, PROJECTS, STORM_TEST, plainDelta, type Outcome, type RoomState } from '@shared';
import { playApproved, playBlocked, playRumble, playThunder, startRain, stopRain } from '../ui/sound';
import { useTween } from './insights';

const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const STORM_MS = 6500;

/** What the result step is showing: the storm (last round only), then the result card. */
export type ResolveShow = 'storm' | 'result';

/** The storm's outcome from the last round's resolution (rule S9). */
export function stormOf(state: RoomState) {
  const last = state.history[state.history.length - 1];
  if (!last || last.round < state.totalRounds) return null;
  const e = last.resolution.events.find((x) => x.rule === 'S9');
  if (!e) return null;
  const loss = -(e.delta?.economy ?? 0);
  return { flood: last.resolution.after.flood, loss, held: loss <= 0, text: e.text };
}

/** The storm plays once, after the last round; `skip` jumps to the result card. */
export function useResolveShow(state: RoomState | null): { show: ResolveShow; skip: () => void } {
  const last = state?.phase === 'resolve' ? state.history[state.history.length - 1] : null;
  const key = last ? `resolve-${last.round}` : null;
  const storm = !!(state && last && stormOf(state));
  const [show, setShow] = useState<ResolveShow>('result');
  useEffect(() => {
    if (!key || !storm || reduceMotion()) return setShow('result');
    // A beat for the verdicts to land on the map first.
    setShow('result');
    const timers = [setTimeout(() => setShow('storm'), 2200), setTimeout(() => setShow('result'), 2200 + STORM_MS)];
    return () => timers.forEach(clearTimeout);
    // One storm per match.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return { show: key ? show : 'result', skip: () => setShow('result') };
}

const STATUS_WORD: Record<Outcome['status'], string> = {
  approved: 'approved!', rejected: 'rejected.', blocked: 'blocked.', delayed: 'delayed a round.', unfunded: 'approved, but not built.',
};

/** "Seawall approved!" + "Flood safety +5, nature −3, city spent $7M." + one plain reason. */
export function outcomeSentence(o: Outcome): { head: string; effect: string; reason: string } {
  const project = PROJECTS[o.kind];
  const built = o.status === 'approved';
  const keys = INDICATORS.filter((k) => k !== 'budget' && o.delta[k]);
  const up = keys.filter((k) => o.delta[k]! > 0).sort((a, b) => o.delta[b]! - o.delta[a]!)[0];
  const down = keys.filter((k) => o.delta[k]! < 0).sort((a, b) => o.delta[a]! - o.delta[b]!)[0];
  const money = built && project.budgetCost > 0 ? (o.funding === 'covered' ? 'someone else paid the bill' : `city spent $${project.budgetCost}M`) : '';
  const effect = built ? [up && plainDelta(up, o.delta[up]!), down && plainDelta(down, o.delta[down]!), money].filter(Boolean).join(', ') : 'Nothing changes on the map.';
  const tally = `${o.support} for, ${o.opposition - o.ignored} against`;
  const reason = {
    approved: `More support than opposition (${tally}).`,
    rejected: `More opposition than support (${tally}).`,
    blocked: 'A legal challenge: this coast is too hazardous for it.',
    delayed: `A tie (${tally}): it comes back next round.`,
    unfunded: 'The city could not pay for it, and nobody covered the bill.',
  }[o.status];
  return { head: `${project.marker} ${project.name} ${STATUS_WORD[o.status]}`, effect, reason };
}

export function StormFinale({ state, onSkip }: { state: RoomState; onSkip: () => void }) {
  const storm = stormOf(state);
  const [beat, setBeat] = useState(0);
  const shown = useTween(beat >= 1 ? storm?.flood ?? 0 : 0, 2200);
  useEffect(() => {
    startRain();
    playThunder(0.1);
    playRumble(3, 0.8);
    const timers = [
      setTimeout(() => setBeat(1), 700),
      setTimeout(() => {
        setBeat(2);
        playThunder(0);
        if (storm && !storm.held) playBlocked();
        else playApproved();
      }, 3300),
    ];
    return () => {
      timers.forEach(clearTimeout);
      stopRain();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!storm) return null;
  return (
    <div className="storm-scrim" onClick={onSkip} role="status" aria-live="polite">
      <div className="rain-layer" data-level="heavy" aria-hidden><span className="storm-flash" /></div>
      <div className="storm-card">
        <p className="storm-title">🌀 The storm hits</p>
        <p className="text-15 font-bold">Is Miami Beach ready? It needs {STORM_TEST.threshold} flood safety.</p>
        <div className="storm-gauge" aria-label={`Flood safety ${storm.flood} of ${STORM_TEST.threshold} needed`}>
          <span className="storm-fill" style={{ width: beat >= 1 ? `${storm.flood}%` : '0%' }} />
          <span className="storm-line" style={{ left: `${STORM_TEST.threshold}%` }}><b>{STORM_TEST.threshold} needed</b></span>
          <span className="storm-value">🌊 {shown}</span>
        </div>
        {beat >= 2 && (
          <p className={`big-stamp storm-verdict ${storm.held ? 'is-good' : 'is-bad'}`}>
            {storm.held ? '🛡️ The city held!' : `🌊 Flood damage: −${storm.loss} ${PLAIN.economy}`}
          </p>
        )}
        {beat >= 2 && <p className="text-13 font-bold opacity-85">{storm.held ? 'No flood damage. Every flood project paid off.' : 'Not enough flood protection: streets flood and businesses close.'}</p>}
      </div>
      <p className="climax-skip">click to skip</p>
    </div>
  );
}
