// Over the map: the five city meters as gel tubes, the stakeholders as
// soap bubbles with their influence pips.
import { INDICATORS, INDICATOR_INFO, PERSONA_INFO, VIABILITY_FLOOR, type Indicator, type RoomState } from '@shared';
import { Pips, RoundDots, Tube, type Tone } from './ui';
import { Bill, useTween } from './insights';
import { FaceOrb } from './Players';

/** A meter's number, counting toward its new value. */
function Count({ k, value }: { k: Indicator; value: number }) {
  const shown = useTween(value);
  return <>{k === 'budget' ? `$${shown}M` : shown}</>;
}

const TONE: Record<Indicator, Tone> = { flood: 'aqua', economy: 'sun', environment: 'lime', access: 'coral', budget: 'lilac' };

export function Meters({ state }: { state: RoomState }) {
  const v = state.city.indicators;
  // A budget crunch lands on the Budget meter itself.
  const crunch = state.phase === 'crisis' && state.crisis?.kind === 'budget';
  return (
    <div className="meters">
      {INDICATORS.map((k) => {
        const info = INDICATOR_INFO[k];
        const low = k !== 'budget' && v[k] < VIABILITY_FLOOR;
        return (
          <Tube
            key={k} tone={low ? 'coral' : TONE[k]} value={v[k]} max={k === 'budget' ? 40 : 100}
            className={crunch && k === 'budget' ? 'tube-shake' : ''}
            title={`${info.label}: ${k === 'budget' ? `$${v[k]}M (hypothetical)` : v[k]}${low ? ` (below ${VIABILITY_FLOOR}: the city is at risk)` : ''}`}
            label={<><span>{info.icon}</span><span className="nm">{info.short}</span><span className={`v ${low ? 'text-[#d0103a]' : ''}`}><Count k={k} value={v[k]} /></span></>}
          />
        );
      })}
      <Bill state={state} />
    </div>
  );
}

export function PlayerBubbles({ state }: { state: RoomState }) {
  const waiting = state.phase === 'select' || state.phase === 'negotiate' || state.phase === 'final';
  return (
    <div className="player-bubbles">
      <span className="lchip round-pill w-fit">Round {state.round} of {state.totalRounds} <RoundDots round={state.round} total={state.totalRounds} /></span>
      {state.players.map((p) => {
        const info = PERSONA_INFO[p.persona];
        return (
          <div key={p.seat} className={`pb wet ${p.seat === state.you ? 'is-you' : ''}`} data-seat={p.seat} style={{ opacity: p.connected ? 1 : 0.5 }}>
            <FaceOrb persona={p.persona} size={44} />
            <span className="who min-w-0">
              <span className="vr block truncate text-15 leading-tight">{p.name}{p.seat === state.hostSeat ? ' (host)' : ''}</span>
              <span className="block text-[11px] leading-tight opacity-75">{info.name}</span>
              <Pips n={p.influence} />
            </span>
            {waiting && <span className={`ready-tick ${p.ready ? 'on' : ''}`}>{p.ready ? '✓' : '…'}</span>}
          </div>
        );
      })}
    </div>
  );
}
