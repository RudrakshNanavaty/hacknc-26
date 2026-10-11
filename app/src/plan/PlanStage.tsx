// The Planning Edition's stage: the real Miami Beach map is the board. Each round is one real situation
// pinned to one area (West Avenue, South Pointe, Collins/Mid-Beach), three steps (Play a Card, Make a
// Deal, See What Happens), a side panel with the one thing to do, and after round 3 the storm and
// "Your Miami Beach plan". The server runs every rule; this page shows what it is sent.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { DISTRICT_IDS, PERSONA_INFO, optionOf, planOutcome, stormResult, type Bubble, type RoomState } from '@shared';
import { CityMap, type Overlays } from '../map/CityMap';
import { CrisisFx } from '../map/CrisisFx';
import { LivingLayer } from '../map/LivingLayer';
import { Legend } from '../routes/Play';
import { NewsTV } from '../game/NewsTV';
import { PlanRibbon } from './PlanRibbon';
import { FaceOrb } from '../game/Players';
import type { Room } from '../room/useRoom';
import { useSound, playApproved, playBlocked, playThunder, startRain, stopRain, playRumble } from '../ui/sound';
import { dropWaitingSpeech, enqueueSpeech, hush, useVoicePref, type VoiceName } from '../ui/voice';
import { spokenForm } from '../ui/spoken';
import { PlanPanel } from './PlanPanel';
import { PlanFinale } from './PlanFinale';
import { describe, scenarioById2 } from './bits';

/** The one thing to do now, in a dozen words or fewer. */
function instruction(state: RoomState): string {
  const me = state.players.find((p) => p.seat === state.you);
  const plan = state.plan;
  switch (state.phase) {
    case 'select': return state.mine?.plan?.pick ? '🔒 Locked in. Waiting for the others…' : '👇 Read the story, then play one card.';
    case 'propose': return me?.persona === 'mayor' && !plan?.leading ? '🎖️ You are the Mayor: put one project forward.' : '👀 Everyone’s card is face up.';
    case 'deal': return me?.ready ? '✓ Ready. Waiting for the others…' : '🤝 Support, oppose, or ask for one change.';
    case 'vote': return state.mine?.plan?.vote !== null && state.mine?.plan?.vote !== undefined ? '🗳️ Voted. Waiting for the others…' : '🗳️ Approve or reject. It needs three of four.';
    case 'result': return plan?.rounds.at(-1)?.verdict === 'approved' ? '✅ The plan goes ahead.' : 'Here is what happened.';
    default: return '';
  }
}

function Players({ state }: { state: RoomState }) {
  const rounds = state.plan?.rounds ?? [];
  const waiting = ['select', 'propose', 'deal', 'vote', 'result'].includes(state.phase);
  return (
    <div className="player-bubbles">
      {state.players.map((p) => {
        const you = p.seat === state.you;
        const pts = rounds.reduce((s, r) => s + (r.scores.find((x) => x.seat === p.seat)?.total ?? 0), 0);
        return (
          <div key={p.seat} className={`pb wet ${you ? 'is-you' : ''}`} data-seat={p.seat} style={{ opacity: p.connected ? 1 : 0.5 }}>
            <FaceOrb persona={p.persona} size={44} />
            <span className="who min-w-0">
              <span className="vr block truncate text-15 leading-tight">{p.name}{you ? ' (you)' : ''}</span>
              <span className="block text-[11px] leading-tight opacity-75">{PERSONA_INFO[p.persona].name}{p.bot ? ' · bot' : ''}</span>
              <span className="block text-[11px] font-black leading-tight" title="Points so far: up to 6 a round">⭐ {pts} points</span>
            </span>
            {waiting && <span className={`ready-tick ${p.ready ? 'on' : ''}`}>{p.ready ? '✓' : '…'}</span>}
          </div>
        );
      })}
    </div>
  );
}

/** The verdict lands in the middle of the screen for a moment, then gives way to the panel. */
function Slab({ state, onDone }: { state: RoomState; onDone: () => void }) {
  const r = state.plan?.rounds.at(-1);
  const sc = r ? scenarioById2(r.scenarioId) : null;
  useEffect(() => {
    if (!r) return;
    if (r.verdict === 'approved') playApproved();
    else playBlocked();
    const t = setTimeout(onDone, 2600);
    return () => clearTimeout(t);
    // once per result
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r?.round]);
  if (!r || !sc) return null;
  const good = r.verdict === 'approved';
  const word = { approved: 'Approved', rejected: 'Rejected', delayed: 'Delayed', 'no-money': 'No money' }[r.verdict];
  return (
    <div className="climax-scrim" onClick={onDone} role="status" aria-live="polite">
      <div className={`verdict-slab ${good ? 'is-good' : 'is-bad'}`}>
        <p className="text-13 font-black opacity-75">{sc.title}</p>
        <p className={`big-stamp ${good ? 'is-good' : 'is-bad'}`}>{word}</p>
        <p className="vr text-[20px] leading-tight">{good ? describe(sc, r.adopted) : sc.statusQuo.name}</p>
        {r.blockedBy && <p className="text-[13px] font-bold">{r.blockedBy}</p>}
      </div>
      <p className="climax-skip">click to skip</p>
    </div>
  );
}

/** After round 3: the storm tests the plan the table built, in the model's extreme-flood future. */
function Storm({ state, onDone }: { state: RoomState; onDone: () => void }) {
  const final = state.plan?.final;
  const result = useMemo(() => (final ? stormResult(planOutcome(final.plan)) : null), [final]);
  const [beat, setBeat] = useState(0);
  useEffect(() => {
    startRain();
    playThunder(0.1);
    playRumble(3, 0.8);
    const timers = [
      setTimeout(() => setBeat(1), 700),
      setTimeout(() => {
        setBeat(2);
        playThunder(0);
        if (result && !result.held) playBlocked();
        else playApproved();
      }, 3200),
      setTimeout(onDone, 6200),
    ];
    return () => {
      timers.forEach(clearTimeout);
      stopRain();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!result) return null;
  return (
    <div className="storm-scrim" onClick={onDone} role="status" aria-live="polite">
      <div className="rain-layer" data-level="heavy" aria-hidden><span className="storm-flash" /></div>
      <div className="storm-card">
        <p className="storm-title">🌀 The storm tests your plan</p>
        <p className="text-15 font-bold">The model’s extreme-flood future: NOAA’s major flood level. The plan must keep modelled exposure at {result.limit} or lower.</p>
        <div className="storm-gauge" aria-label={`Modelled exposure ${result.exposure}, limit ${result.limit}`}>
          <span className="storm-fill" style={{ width: beat >= 1 ? `${Math.min(100, result.exposure)}%` : '0%', background: result.held ? undefined : 'linear-gradient(180deg,#ffd6cc,#ef5a43)' }} />
          <span className="storm-line" style={{ left: `${result.limit}%` }}><b>{result.limit} limit</b></span>
          <span className="storm-value">🌊 {beat >= 1 ? result.exposure : 0}</span>
        </div>
        {beat >= 2 && <p className={`big-stamp storm-verdict ${result.held ? 'is-good' : 'is-bad'}`}>{result.held ? '🛡️ The plan held' : '🌊 Flooding gets through'}</p>}
        {beat >= 2 && <p className="text-13 font-bold opacity-85">Modelled with illustrative effect sizes on real tide levels. A ranking, not a forecast.</p>}
      </div>
      <p className="climax-skip">click to skip</p>
    </div>
  );
}

export function PlanStage({ room }: { room: Room }) {
  const state = room.state!;
  const plan = state.plan!;
  const [map, setMap] = useState<MapLibreMap | null>(null);
  const [overlays, setOverlays] = useState<Overlays>({ flood: true, zoning: false });
  const [layers, setLayers] = useState(false);
  const sound = useSound();
  const voiceOn = useVoicePref((s) => s.on);
  const toggleVoice = useVoicePref((s) => s.toggle);
  const [slab, setSlab] = useState(false);
  const [stormDone, setStormDone] = useState(false);
  const [finaleOpen, setFinaleOpen] = useState(true);
  const [newsOpen, setNewsOpen] = useState(false);
  const phase = state.phase;
  const sc = scenarioById2(plan.scenarioId);
  const final = plan.final;
  const storm = useMemo(() => (final ? stormResult(planOutcome(final.plan)) : null), [final]);

  useEffect(() => {
    if (phase === 'result') setSlab(true);
    else setSlab(false);
  }, [phase, state.round]);
  useEffect(() => {
    if (phase !== 'final') {
      setStormDone(false);
      setFinaleOpen(true);
    }
  }, [phase]);

  // The anchor reads each headline.
  const headlineKey = state.headline?.key;
  const headlineText = state.headline?.text;
  useEffect(() => {
    if (!headlineKey || !headlineText) return;
    const t = setTimeout(() => enqueueSpeech(`headline:${headlineKey}`, spokenForm(headlineText), 'broadcast'), 600);
    return () => clearTimeout(t);
  }, [headlineKey, headlineText]);
  useEffect(() => dropWaitingSpeech(), [state.round, phase]);
  useEffect(() => () => hush(), []);

  const heard = useRef({ moment: '' });
  const myPersona = state.players.find((p) => p.seat === state.you)?.persona ?? null;
  const onBubble = useCallback((b: Bubble) => {
    if (b.speaker !== myPersona || heard.current.moment === b.id.split(':')[0]) return;
    heard.current.moment = b.id.split(':')[0] ?? '';
    enqueueSpeech(`bubble:${b.id}`, b.text, b.speaker as VoiceName);
  }, [myPersona]);

  const district = sc?.district ?? null;
  const roundOf = useMemo(() => new Map(plan.rounds.map((r) => [r.district, r])), [plan.rounds]);
  const chipNote = useCallback((id: string) => {
    const r = roundOf.get(id);
    const here = phase !== 'final' && id === district;
    if (r && (phase === 'result' || phase === 'final' || id !== district)) {
      const s = scenarioById2(r.scenarioId)!;
      return r.verdict === 'approved' ? `🏗️ ${optionOf(s, r.adopted.option)?.name}${r.adopted.amendment ? ' + deal' : ''}` : `⛔ ${r.verdict === 'delayed' ? 'Delayed' : 'Not built'}`;
    }
    return here ? `📍 Round ${state.round}: ${sc?.title.split(':')[0]}` : null;
  }, [roundOf, phase, district, state.round, sc]);
  const chipBadge = useCallback((id: string) => (phase !== 'final' && id === district ? '🌊' : null), [phase, district]);

  const flooded = phase === 'final' && stormDone && !!storm && !storm.held;
  const padding = phase === 'final' ? { top: 120, bottom: 40, left: 260, right: 60 } : { top: 130, bottom: 60, left: 270, right: 500 };

  if (!sc && phase !== 'final') return null;
  return (
    <main className="stage is-plan">
      <section className="stage-map">
        <CityMap
          city={state.city} spotlight={phase === 'final' ? [] : district ? [district] : []} target={phase === 'final' ? null : district}
          eligible={null} overlays={overlays} focus={phase === 'final' ? null : district} free={false} recenter={0} padding={padding}
          onReady={setMap} chipNote={chipNote} chipBadge={chipBadge}
        />
      </section>
      <CrisisFx
        map={map} id={flooded ? 'final-storm' : district ? `${district}-${state.round}` : null} kind="flood"
        spotlight={flooded ? DISTRICT_IDS : district && phase !== 'final' ? [district] : []} intensity={flooded ? 3 : 2}
        stage={flooded ? 'alert' : phase === 'select' ? 'alert' : phase === 'final' ? 'off' : 'rest'}
      />
      <LivingLayer map={map} state={state} onFocusProposal={() => undefined} onBubble={onBubble} />
      <div className="plan-hud">
        <PlanRibbon state={state} offset={room.offset} />
        {phase !== 'final' && <p key={`${phase}${state.round}`} className="instruction hud-block" aria-live="polite">{instruction(state)}</p>}
        {room.error && <p role="alert" className="hud-pill hud-block lchip lchip-coral">{room.error}</p>}
      </div>
      <NewsTV state={state} open={newsOpen} setOpen={setNewsOpen} quiet={(phase === 'deal' || phase === 'vote') && !newsOpen} />
      <Players state={state} />
      <div className="map-tools">
        <button type="button" className="gel gel-icon" onClick={sound.toggle} aria-pressed={sound.on} title="Sound">{sound.on ? '🔊' : '🔇'}</button>
        <button type="button" className={`gel gel-sm ${voiceOn ? 'gel-lime' : ''}`} onClick={toggleVoice} aria-pressed={voiceOn} title="The anchor and the characters speak">Voice</button>
        <button type="button" className={`gel gel-icon ${layers ? 'gel-sun' : ''}`} onClick={() => setLayers((v) => !v)} aria-pressed={layers} title="Real data layers">🗺️</button>
        {layers && <Legend overlays={overlays} setOverlays={setOverlays} />}
      </div>
      {phase !== 'final' && !(phase === 'result' && slab) && <PlanPanel state={state} room={room} />}
      {phase === 'result' && slab && <Slab state={state} onDone={() => setSlab(false)} />}
      {phase === 'final' && !stormDone && <Storm state={state} onDone={() => setStormDone(true)} />}
      {phase === 'final' && stormDone && final && (finaleOpen
        ? <PlanFinale state={state} room={room} onClose={() => setFinaleOpen(false)} />
        : <button type="button" className="gel gel-lime plan-reopen" onClick={() => setFinaleOpen(true)}>📋 Your Miami Beach plan</button>)}
    </main>
  );
}
