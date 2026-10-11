// Over the map: the two numbers every player needs (Flood Safety, with the storm's line, and City Money)
// as big gel tubes, the other three city meters in a drawer that warns when one nears the viability
// floor, and the stakeholders as soap bubbles with their influence pips and (yours) your goal.
import { useState } from 'react';
import { INDICATOR_INFO, PERSONA_INFO, STORM_TEST, VIABILITY_FLOOR, PLAIN, type Indicator, type PersonaId, type RoomState } from '@shared';
import { Pips, Tube, type Tone } from './ui';
import { Bill, useTween } from './insights';
import { FaceOrb } from './Players';

/** A meter's number, counting toward its new value. */
function Count({ k, value }: { k: Indicator; value: number }) {
  const shown = useTween(value);
  return <>{k === 'budget' ? `$${shown}M` : shown}</>;
}

const TONE: Record<Indicator, Tone> = { flood: 'aqua', economy: 'sun', environment: 'lime', access: 'coral', budget: 'lilac' };
const DRAWER: Indicator[] = ['economy', 'environment', 'access'];
/** A drawer meter this close to the floor is called out on the closed drawer. */
const NEAR = 5;

/** What each stakeholder scores on, in a few words (the weights and bonuses in content.ts, `finalResult`). */
export const GOAL_SHORT: Record<PersonaId, string> = {
  mayor: 'Flood safety, money left, jobs, access',
  activist: 'Nature first; stop risky hotels',
  resort: 'Jobs & business; hotels built',
  resident: 'Flood safety, beach access, homes',
};

export function Meters({ state }: { state: RoomState }) {
  const v = state.city.indicators;
  const [open, setOpen] = useState(false);
  // A budget crunch lands on the money meter itself.
  const crunch = state.phase === 'crisis' && state.crisis?.kind === 'budget';
  const risky = DRAWER.filter((k) => v[k] < VIABILITY_FLOOR + NEAR);
  const tube = (k: Indicator, label: string, extra = '') => {
    // Money is low when it could not pay for the cheapest public project left ($3M); the others at the viability floor.
    const low = k === 'budget' ? v[k] < 3 : v[k] < VIABILITY_FLOOR;
    return (
      <Tube
        key={k} tone={low ? 'coral' : TONE[k]} value={v[k]} max={k === 'budget' ? 40 : 100}
        className={`${extra} ${crunch && k === 'budget' ? 'tube-shake' : ''}`}
        title={`${INDICATOR_INFO[k].label}: ${k === 'budget' ? `$${v[k]}M (hypothetical)` : v[k]}${low ? ` (below ${VIABILITY_FLOOR}: the city is at risk)` : ''}`}
        label={<><span>{INDICATOR_INFO[k].icon}</span><span className="nm">{label}</span><span className={`v ${low ? 'text-[#d0103a]' : ''}`}><Count k={k} value={v[k]} /></span></>}
      />
    );
  };
  return (
    <div className="meters meters-main">
      <div className="meter-flood">
        {tube('flood', 'Flood safety', 'tube-big')}
        <span className="storm-mark" style={{ left: `calc(12px + (100% - 24px) * ${STORM_TEST.threshold / 100})` }} title={`The storm after round ${state.totalRounds} needs ${STORM_TEST.threshold}`} />
      </div>
      {tube('budget', 'City money', 'tube-big')}
      <div className="city-drawer">
        <button type="button" className={`gel gel-sm city-btn ${risky.length ? 'gel-coral' : ''}`} onClick={() => setOpen(!open)} aria-expanded={open}>
          🏙️ City {risky.length ? `⚠️ ${PLAIN[risky[0]!]} ${v[risky[0]!]}` : ''} <span aria-hidden>{open ? '▴' : '▾'}</span>
        </button>
        {open && (
          <div className="float-card city-pop">
            {DRAWER.map((k) => tube(k, PLAIN[k].replace(/^./, (c) => c.toUpperCase())))}
            <p className="text-[12px] font-bold opacity-80">If any of these ends below {VIABILITY_FLOOR}, every positive score is halved.</p>
          </div>
        )}
      </div>
      <Bill state={state} />
    </div>
  );
}

export function PlayerBubbles({ state }: { state: RoomState }) {
  const waiting = state.phase === 'select' || state.phase === 'negotiate' || state.phase === 'final';
  return (
    <div className="player-bubbles">
      {state.players.map((p) => {
        const info = PERSONA_INFO[p.persona];
        const you = p.seat === state.you;
        return (
          <div key={p.seat} className={`pb wet ${you ? 'is-you' : ''}`} data-seat={p.seat} style={{ opacity: p.connected ? 1 : 0.5 }}>
            <FaceOrb persona={p.persona} size={44} />
            <span className="who min-w-0">
              <span className="vr block truncate text-15 leading-tight">{p.name}{you ? ' (you)' : ''}</span>
              <span className="block text-[11px] leading-tight opacity-75">{you ? `🎯 ${GOAL_SHORT[p.persona]}` : info.name}</span>
              <Pips n={p.influence} />
            </span>
            {waiting && <span className={`ready-tick ${p.ready ? 'on' : ''}`}>{p.ready ? '✓' : '…'}</span>}
          </div>
        );
      })}
    </div>
  );
}
