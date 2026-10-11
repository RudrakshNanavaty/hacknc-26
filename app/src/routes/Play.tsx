// A Coastal Clash room. Lobby, then the stage: the real Miami Beach map is the whole board. Each round
// is three steps (game/Steps.tsx): Play a Card (the crisis lands on the map, then you pick a card and a
// green area), Make a Deal (the cards are revealed and the table negotiates on a case file pinned to
// the proposal's area), See What Happens (big verdict stamps, the storm after the last round, then the
// result beside the map). Turn-based by default; in a sprint the server puts each step on a short
// clock. The server runs every rule; this page shows what it is sent.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { CRISIS_KIND_INFO, DISTRICT_IDS, cardEligibility, type Bubble, type CardId } from '@shared';
import { CityMap, FLOOD_COLORS, ZONING_FAMILIES, type Overlays } from '../map/CityMap';
import { CrisisAlert } from '../map/CrisisAlert';
import { CrisisFx, type CrisisStage } from '../map/CrisisFx';
import { crisisIntensity } from '../map/intensity';
import { savedPlayer, useRoom, type Room } from '../room/useRoom';
import { Link } from '../router';
import { useSound } from '../ui/sound';
import { dropWaitingSpeech, enqueueSpeech, hush, useVoicePref, type VoiceName } from '../ui/voice';
import { spokenForm } from '../ui/spoken';
import { Flights, Stamps } from '../game/Flights';
import { HandDeck } from '../game/HandDeck';
import { LivingLayer } from '../map/LivingLayer';
import { PingLayer } from '../map/PingLayer';
import { Meters, PlayerBubbles } from '../game/Hud';
import { ReadyBar } from '../game/Turn';
import { JoinForm, Lobby } from '../game/Lobby';
import { CaseFile } from '../game/CaseFile';
import { DistrictPopover } from '../game/DistrictPopover';
import { NewsTV } from '../game/NewsTV';
import { ResultOverlay } from '../game/ResultOverlay';
import { RoundDots } from '../game/ui';
import { Seascape } from '../ui/FloatingBubbles';
import { CrisisProvider } from '../game/story';
import { RoundSteps, instructionFor } from '../game/Steps';
import { StormFinale, stormOf, useResolveShow } from '../game/Climax';
import { PlanStage } from '../plan/PlanStage';

export function Legend({ overlays, setOverlays }: { overlays: Overlays; setOverlays: (o: Overlays) => void }) {
  return (
    <div className="layer-pop wet">
      <p className="vr text-13 opacity-80">Real data layers</p>
      <label className="flex items-center gap-2 font-bold"><input type="checkbox" checked={overlays.flood} onChange={(e) => setOverlays({ ...overlays, flood: e.target.checked })} />FEMA flood zones</label>
      {overlays.flood && <p className="flex flex-wrap gap-2 pl-6 text-[11px]"><span><i className="swatch" style={{ background: FLOOD_COLORS.VE }} />VE coastal high hazard</span><span><i className="swatch" style={{ background: FLOOD_COLORS.AE }} />AE 1% annual chance</span></p>}
      <label className="flex items-center gap-2 font-bold"><input type="checkbox" checked={overlays.zoning} onChange={(e) => setOverlays({ ...overlays, zoning: e.target.checked })} />City zoning</label>
      {overlays.zoning && <p className="flex flex-wrap gap-2 pl-6 text-[11px]">{ZONING_FAMILIES.map((f) => <span key={f.label}><i className="swatch" style={{ background: f.color }} />{f.label}</span>)}</p>}
      <label className="flex items-center gap-2 font-bold"><input type="checkbox" checked={!!overlays.satellite} onChange={(e) => setOverlays({ ...overlays, satellite: e.target.checked })} />Satellite imagery</label>
    </div>
  );
}

export function Play({ code }: { code: string }) {
  const room = useRoom(code);
  // The Planning Edition has its own stage once the match starts; the lobby is shared.
  if (room.state && room.state.rules === 'planning' && room.state.phase !== 'lobby' && room.state.you !== null && room.state.plan) return <PlanStage room={room} />;
  return <LegacyPlay code={code} room={room} />;
}

function LegacyPlay({ code, room }: { code: string; room: Room }) {
  const { state } = room;
  const [map, setMap] = useState<MapLibreMap | null>(null);
  /** The area whose popover is open (selection phase). */
  const [open, setOpen] = useState<string | null>(null);
  const [popKey, setPopKey] = useState(0);
  /** The card being read in the popover: its other legal areas light up. */
  const [hoverCard, setHoverCard] = useState<CardId | null>(null);
  /** The card held in your hand: the areas it may go to stay lit until you click one (or Esc). */
  const [armed, setArmed] = useState<CardId | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const [overlays, setOverlays] = useState<Overlays>({ flood: true, zoning: false });
  const [layers, setLayers] = useState(false);
  const [newsOpen, setNewsOpen] = useState(false);
  const [recenter, setRecenter] = useState(0);
  const sound = useSound();
  const voiceOn = useVoicePref((s) => s.on);
  const toggleVoice = useVoicePref((s) => s.toggle);

  const me = state?.you ?? null;
  const host = me !== null && state?.hostSeat === me;
  const phase = state?.phase;
  const locked = state?.mine?.selection ?? null;
  useEffect(() => {
    setOpen(null);
    setHoverCard(null);
    setArmed(null);
    setNewsOpen(false);
  }, [state?.round, phase]);
  useEffect(() => {
    if (locked) {
      setOpen(null);
      setArmed(null);
    }
  }, [locked]);

  // The anchor reads each headline. The template line waits a moment so the AI's wording, which
  // usually follows within a second or two, is the one that is spoken.
  const headlineKey = state?.headline?.key;
  const headlineText = state?.headline?.text;
  useEffect(() => {
    if (!headlineKey || !headlineText) return;
    const t = setTimeout(() => enqueueSpeech(`headline:${headlineKey}`, spokenForm(headlineText), 'broadcast'), 1200);
    return () => clearTimeout(t);
  }, [headlineKey, headlineText]);
  // What was waiting to be said belongs to a moment that is over; the line being spoken finishes.
  useEffect(() => dropWaitingSpeech(), [state?.round, phase]);
  useEffect(() => () => hush(), []);

  // Characters speak as their bubble pops: always your own, and one other voice, so a moment is a
  // couple of lines and never a wall of audio.
  const heard = useRef({ moment: '', others: 0 });
  const myPersona = state?.players.find((p) => p.seat === state.you)?.persona ?? null;
  const onBubble = useCallback((b: Bubble) => {
    if (b.speaker === 'fisherman') return;
    const moment = b.id.split(':')[0] ?? '';
    if (heard.current.moment !== moment) heard.current = { moment, others: 0 };
    if (b.speaker !== myPersona) {
      if (heard.current.others >= 1) return;
      heard.current.others += 1;
    }
    enqueueSpeech(`bubble:${b.id}`, b.text, b.speaker as VoiceName);
  }, [myPersona]);

  const picking = phase === 'select' && !locked && me !== null;
  const eligible = useMemo(
    () => {
      const shown = hoverCard ?? armed;
      return picking && shown ? Object.fromEntries(DISTRICT_IDS.map((d) => [d, cardEligibility(shown, d).ok])) : null;
    },
    [picking, hoverCard, armed],
  );
  const focusDistrict = useMemo(() => state?.board?.proposals.find((p) => p.id === focus)?.district ?? state?.board?.proposals[0]?.district ?? null, [state?.board, focus]);
  const crisis = state?.crisis ?? null;
  // A good spot for the card in hand: a crisis area it may go to (the crisis bonus applies there). A hint, never a limit.
  const suggested = useMemo(() => {
    const shown = hoverCard ?? armed;
    return picking && shown ? crisis?.spotlight.find((d) => cardEligibility(shown, d).ok) ?? null : null;
  }, [picking, hoverCard, armed, crisis]);
  // Area chips stay quiet unless they help the choice in hand.
  const chipNote = useCallback((id: string) => {
    if (!state || state.phase !== 'select' || me === null) return null;
    if (locked) return id === locked.district ? '🔒 Your card' : null;
    if (!eligible) return null;
    if (!eligible[id]) return null;
    return id === suggested ? '⭐ Suggested: crisis bonus' : 'Play here ›';
  }, [state, me, locked, eligible, suggested]);
  const chipBadge = useCallback(
    (id: string) => (crisis && phase !== 'final' && crisis.spotlight.includes(id) ? CRISIS_KIND_INFO[crisis.kind].icon : null),
    [crisis, phase],
  );

  const { show, skip: skipShow } = useResolveShow(state);
  const missing = !state && /not found/i.test(room.error ?? '');
  const joined = me !== null || !!savedPlayer(code);

  if (!state || state.phase === 'lobby' || me === null) {
    return (
      <main className="lagoon seascape relative flex min-h-full flex-col items-center gap-4 p-4 sm:p-6">
        <Seascape />
        <header className={`flex w-full items-center justify-between ${state && me !== null && state.phase === 'lobby' ? 'max-w-5xl' : 'seascape-head'}`}>
          <Link to="/" className="vr seascape-title text-24">🌊 Coastal Clash</Link>
          <span className="lchip">Room {code}</span>
        </header>
        {room.error && !missing && <p role="alert" className="wet max-w-2xl p-3 text-15 text-[#c0392b]">{room.error}</p>}
        <div className="flex w-full justify-center">
          {!state && !missing && <p className="wet p-6 text-18">Connecting to room {code}…</p>}
          {(missing || (state && me === null && !joined) || (state && me === null && state.phase === 'lobby')) && (state?.phase ?? 'lobby') === 'lobby' && <JoinForm room={room} create={missing} />}
          {state && me === null && state.phase !== 'lobby' && <p className="wet max-w-xl p-6 text-18">This match is under way. Join the next one from this page, or watch the results in the <Link to="/atlas" className="font-bold underline">Civic Atlas</Link>.</p>}
          {state && me !== null && state.phase === 'lobby' && <Lobby state={state} room={room} />}
        </div>
      </main>
    );
  }

  // The camera is directed for the shared beats (the crisis, the reveal, the result) and yours to
  // drive while you choose and negotiate (Recenter brings back the overview).
  const free = (phase === 'select' && !open) || phase === 'negotiate';
  // Confirming a card flies to that area, so the card and the place are seen together.
  const camera =
    phase === 'select' && open ? open
    : phase === 'crisis' ? crisis?.spotlight[0] ?? null
      : phase === 'reveal' || phase === 'negotiate' ? focusDistrict
        : null;
  // Room for the HUD at the top, the hand at the bottom, and whatever floats beside the focused area.
  const padding =
    phase === 'crisis' ? { top: 200, bottom: 40, left: 260, right: 80 }
      : phase === 'reveal' ? { top: 184, bottom: 40, left: 260, right: 470 }
        : phase === 'negotiate' ? { top: 200, bottom: 60, left: 260, right: 420 }
          : phase === 'resolve' ? { top: 184, bottom: 40, left: 260, right: 500 }
            : phase === 'select' ? (open ? { top: 200, bottom: 60, left: 260, right: 400 } : { top: 200, bottom: 260, left: 260, right: 60 }) // the hand tucks away while you confirm
              : { top: 184, bottom: 40, left: 260, right: 60 };
  const stage: CrisisStage = phase === 'crisis' ? 'alert' : phase === 'select' || phase === 'reveal' || phase === 'negotiate' ? 'rest' : 'off';
  // The storm after the last round: if the city falls short, the real FEMA flood zones fill everywhere.
  const storm = show === 'storm' ? stormOf(state) : null;
  const flooded = !!storm && !storm.held;
  const onPick =
    picking ? (id: string) => {
      if (armed && !cardEligibility(armed, id).ok) return; // a dimmed area: nothing to read there
      setOpen(id);
      setPopKey((k) => k + 1);
    }
      : phase === 'reveal' || phase === 'negotiate' ? (id: string) => {
        const p = state.board?.proposals.find((x) => x.district === id);
        if (p) setFocus(p.id);
      }
        : undefined;
  const offered = phase === 'negotiate' && !!state.board?.compromises.some((c) => c.owner === me && !c.accepted);
  const instruction = instructionFor(state, { armed: !!armed, confirming: picking && !!open, offered, moved: !!state.mine?.moved, own: state.board?.proposals.find((p) => p.id === focus)?.seat === me });
  // While you decide, the news and the characters keep quiet (both can be reopened).
  const quiet = (phase === 'select' || phase === 'negotiate') && !newsOpen;

  return (
    <CrisisProvider crisis={state.crisis}>
    <main className="stage" data-quiet={quiet}>
      <section className="stage-map">
        <CityMap
          city={state.city}
          spotlight={phase === 'final' ? [] : crisis?.spotlight ?? []}
          target={phase === 'select' ? open ?? locked?.district ?? null : phase === 'reveal' || phase === 'negotiate' ? focusDistrict : null}
          eligible={eligible}
          overlays={overlays}
          onPick={onPick}
          onBlank={() => (open ? setOpen(null) : setArmed(null))}
          focus={camera}
          free={free}
          recenter={recenter}
          padding={padding}
          onReady={setMap}
          chipNote={chipNote}
          chipBadge={chipBadge}
        />
      </section>
      <CrisisFx
        map={map} id={flooded ? 'final-storm' : crisis ? `${crisis.id}-${state.round}` : null} kind={flooded ? 'flood' : crisis?.kind ?? null}
        spotlight={flooded ? DISTRICT_IDS : crisis?.spotlight ?? []}
        intensity={flooded ? 3 : crisis ? crisisIntensity(crisis.kind, state.live) : 2} stage={flooded ? 'alert' : stage}
      />
      <LivingLayer map={map} state={state} onFocusProposal={setFocus} onBubble={onBubble} />
      <CrisisAlert map={map} state={state} />
      <div className="hud">
        <div className="hud-row hud-block">
          <Meters state={state} />
        </div>
        <div className="hud-center">
          <RoundSteps state={state} offset={room.offset} />
          {instruction && <p key={instruction} className="instruction hud-block" aria-live="polite">{instruction}</p>}
          {phase === 'crisis' && state.crisis && (
            <button type="button" className="story-chip hud-block" onClick={() => setNewsOpen(true)}>
              📰 {state.crisis.story ? 'Real story' : 'Scenario'}: {state.crisis.title} · <u>read it</u>
            </button>
          )}
          {phase === 'crisis' && state.crisis && <div className="hud-pill hud-block"><ReadyBar state={state} room={room} label="Play a Card ▶" /></div>}
          {phase === 'reveal' && <div className="hud-pill hud-block"><ReadyBar state={state} room={room} label="Make a Deal ▶" /></div>}
          {room.error && <p role="alert" className="hud-pill hud-block lchip lchip-coral">{room.error}</p>}
        </div>
      </div>
      <NewsTV state={state} open={newsOpen} setOpen={setNewsOpen} quiet={quiet} />
      <PlayerBubbles state={state} />
      <div className="map-tools">
        <button type="button" className="gel gel-icon" onClick={sound.toggle} aria-pressed={sound.on} title="Sound">{sound.on ? '🔊' : '🔇'}</button>
        <button type="button" className={`gel gel-sm ${voiceOn ? 'gel-lime' : ''}`} onClick={toggleVoice} aria-pressed={voiceOn} title="The anchor and the characters speak">Voice</button>
        <button type="button" className={`gel gel-icon ${layers ? 'gel-sun' : ''}`} onClick={() => setLayers((v) => !v)} aria-pressed={layers} title="Real data layers">🗺️</button>
        {free && <button type="button" className="gel gel-icon" onClick={() => setRecenter((n) => n + 1)} title="Recenter the map">🎯</button>}
                {layers && <Legend overlays={overlays} setOverlays={setOverlays} />}
      </div>
      {picking && open && <DistrictPopover key={popKey} state={state} room={room} map={map} district={open} setDistrict={setOpen} onCard={setHoverCard} onArm={setArmed} initialCard={armed} />}
      {(phase === 'reveal' || phase === 'negotiate') && <CaseFile state={state} room={room} map={map} focus={focus} setFocus={setFocus} />}
      {phase === 'negotiate' && <PingLayer map={map} state={state} pings={room.pings} />}
      <HandDeck state={state} room={room} armed={armed} setArmed={setArmed} onHoverCard={setHoverCard} tucked={!!open} />
      <ResultOverlay state={state} room={room} hidden={show !== 'result'} />
      {phase === 'resolve' && show === 'storm' && <StormFinale state={state} onSkip={skipShow} />}
      <Flights map={map} state={state} />
      <Stamps map={map} state={state} />
    </main>
    </CrisisProvider>
  );
}
