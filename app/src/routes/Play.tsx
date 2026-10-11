// A Coastal Clash room. Lobby, then the stage: the real Miami Beach map is the whole board. The crisis
// lands on it (a pin, an animation, then the news on the TV in the top-right corner), you click an area
// to see the cards you can play there, the table negotiates on a case file pinned to the proposal's
// area, and the round's result floats beside the map. The server runs the clock and every rule; this
// page shows what it is sent.
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { CRISIS_KIND_INFO, DISTRICT_IDS, cardEligibility, cardName, districtById, type CardId } from '@shared';
import { CityMap, FLOOD_COLORS, ZONING_FAMILIES, type Overlays } from '../map/CityMap';
import { CrisisAlert } from '../map/CrisisAlert';
import { CrisisFx, type CrisisStage } from '../map/CrisisFx';
import { crisisIntensity } from '../map/intensity';
import { savedPlayer, useRoom } from '../room/useRoom';
import { Link } from '../router';
import { useSound } from '../ui/sound';
import { say, hush } from '../ui/voice';
import { Flights, Stamps } from '../game/Flights';
import { HandDeck } from '../game/HandDeck';
import { LivingLayer } from '../map/LivingLayer';
import { PingLayer } from '../map/PingLayer';
import { Meters, PlayerBubbles } from '../game/Hud';
import { ReadyBar } from '../game/Turn';
import { JoinForm, Lobby } from '../game/Lobby';
import { CaseFile } from '../game/CaseFile';
import { DistrictPopover, playableCount } from '../game/DistrictPopover';
import { CrisisBriefing, NewsTV } from '../game/NewsTV';
import { ResultOverlay } from '../game/ResultOverlay';
import { LagoonBubbles, RoundDots } from '../game/ui';
import { CrisisProvider } from '../game/story';

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
  const [voiceOn, setVoiceOn] = useState(false);

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

  useEffect(() => {
    if (!voiceOn || !state?.headline) return;
    void say(state.headline.text, 'broadcast');
    return () => hush();
  }, [voiceOn, state?.headline?.key, state?.headline?.source]);

  const picking = phase === 'select' && !locked && me !== null;
  const eligible = useMemo(
    () => {
      const shown = hoverCard ?? armed;
      return picking && shown ? Object.fromEntries(DISTRICT_IDS.map((d) => [d, cardEligibility(shown, d).ok])) : null;
    },
    [picking, hoverCard, armed],
  );
  const focusDistrict = useMemo(() => state?.board?.proposals.find((p) => p.id === focus)?.district ?? state?.board?.proposals[0]?.district ?? null, [state?.board, focus]);
  const chipNote = useCallback((id: string) => {
    if (!state || state.phase !== 'select' || me === null) return null;
    if (locked) return id === locked.district ? '🂠 Your card, face down' : null;
    const n = playableCount(state, id);
    return n ? `${n} card${n > 1 ? 's' : ''} playable ›` : 'Nothing playable';
  }, [state, me, locked]);
  const crisis = state?.crisis ?? null;
  const chipBadge = useCallback(
    (id: string) => (crisis && phase !== 'final' && crisis.spotlight.includes(id) ? CRISIS_KIND_INFO[crisis.kind].icon : null),
    [crisis, phase],
  );

  const missing = !state && /not found/i.test(room.error ?? '');
  const joined = me !== null || !!savedPlayer(code);

  if (!state || state.phase === 'lobby' || me === null) {
    return (
      <main className="lagoon relative flex min-h-full flex-col items-center gap-4 p-4 sm:p-6">
        <LagoonBubbles count={18} />
        <header className="flex w-full max-w-5xl items-center justify-between">
          <Link to="/" className="vr text-24 text-white drop-shadow">🌊 Coastal Clash</Link>
          <span className="lchip">Room {code}</span>
        </header>
        {room.error && !missing && <p role="alert" className="wet max-w-2xl p-3 text-15 text-[#c0392b]">{room.error}</p>}
        <div className="flex w-full justify-center">
          {!state && !missing && <p className="wet p-6 text-18">Connecting to room {code}…</p>}
          {(missing || (state && me === null && !joined) || (state && me === null && state.phase === 'lobby')) && (state?.phase ?? 'lobby') === 'lobby' && <JoinForm room={room} create={missing} />}
          {state && me === null && state.phase !== 'lobby' && <p className="wet max-w-xl p-6 text-18">This match is under way. Join the next one from this page, or watch the result in <Link to="/studio" className="font-bold underline">Planning Studio</Link>.</p>}
          {state && me !== null && state.phase === 'lobby' && <Lobby state={state} room={room} />}
        </div>
      </main>
    );
  }

  // The camera is directed for the shared beats (the crisis, the reveal, the result) and yours to
  // drive while you choose and negotiate (Recenter brings back the overview).
  const free = phase === 'select' || phase === 'negotiate';
  const camera =
    phase === 'crisis' ? crisis?.spotlight[0] ?? null
      : phase === 'reveal' || phase === 'negotiate' ? focusDistrict
        : null;
  // Room for the HUD at the top, the hand at the bottom, and whatever floats beside the focused area.
  const padding =
    phase === 'crisis' ? { top: 364, bottom: 40, left: 260, right: 80 }
      : phase === 'reveal' ? { top: 184, bottom: 40, left: 260, right: 470 }
        : phase === 'negotiate' ? { top: 184, bottom: 210, left: 260, right: 470 } // the hand is out
          : phase === 'resolve' ? { top: 184, bottom: 40, left: 260, right: 500 }
            : phase === 'select' ? { top: 184, bottom: 210, left: 260, right: 60 } // the hand is out
              : { top: 184, bottom: 40, left: 260, right: 60 };
  const stage: CrisisStage = phase === 'crisis' ? 'alert' : phase === 'select' || phase === 'reveal' || phase === 'negotiate' ? 'rest' : 'off';
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
  const waiting = state.players.filter((p) => !p.ready).length;

  return (
    <CrisisProvider crisis={state.crisis}>
    <main className="stage">
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
        map={map} id={crisis ? `${crisis.id}-${state.round}` : null} kind={crisis?.kind ?? null} spotlight={crisis?.spotlight ?? []}
        intensity={crisis ? crisisIntensity(crisis.kind, state.live) : 2} stage={stage}
      />
      <LivingLayer map={map} state={state} onFocusProposal={setFocus} />
      <CrisisAlert map={map} state={state} />
      <div className="hud">
        <div className="hud-row hud-block">
          <Meters state={state} />
        </div>
        <div className="hud-center">
          {picking && !open && <p className="hud-pill hud-block lchip lchip-sun">{armed ? `👆 Click a lit area to play ${cardName(armed, state.crisis)} there` : '👆 Pick a card from your hand, then a lit area (or click an area first)'}</p>}
          {phase === 'select' && locked && (
            <p className="hud-pill hud-block lchip lchip-lime">🂠 Locked in: {cardName(locked.card, state.crisis)} on {districtById(locked.district).name} · {waiting ? `waiting for ${waiting} stakeholder${waiting > 1 ? 's' : ''}` : 'revealing…'}</p>
          )}
          {phase === 'reveal' && (
            <div className="hud-pill hud-block"><ReadyBar state={state} room={room} label="On to negotiation ▶" /></div>
          )}
          {room.error && <p role="alert" className="hud-pill hud-block lchip lchip-coral">{room.error}</p>}
        </div>
      </div>
      {phase === 'crisis' && (
        <div className="crisis-dock">
          <CrisisBriefing state={state} />
          {state.crisis && <div className="hud-pill hud-block"><ReadyBar state={state} room={room} label="Got it, to the cards ▶" /></div>}
        </div>
      )}
      <NewsTV state={state} open={newsOpen} setOpen={setNewsOpen} />
      <PlayerBubbles state={state} />
      <div className="map-tools">
        <button type="button" className="gel gel-icon" onClick={sound.toggle} aria-pressed={sound.on} title="Sound">{sound.on ? '🔊' : '🔇'}</button>
        <button type="button" className={`gel gel-icon ${voiceOn ? 'gel-lime' : ''}`} onClick={() => setVoiceOn((v) => !v)} aria-pressed={voiceOn} title="Read the news aloud">🎙️</button>
        <button type="button" className={`gel gel-icon ${layers ? 'gel-sun' : ''}`} onClick={() => setLayers((v) => !v)} aria-pressed={layers} title="Real data layers">🗺️</button>
        {free && <button type="button" className="gel gel-icon" onClick={() => setRecenter((n) => n + 1)} title="Recenter the map">🎯</button>}
                {layers && <Legend overlays={overlays} setOverlays={setOverlays} />}
      </div>
      {picking && open && <DistrictPopover key={popKey} state={state} room={room} map={map} district={open} setDistrict={setOpen} onCard={setHoverCard} initialCard={armed} />}
      {(phase === 'reveal' || phase === 'negotiate') && <CaseFile state={state} room={room} map={map} focus={focus} setFocus={setFocus} />}
      {phase === 'negotiate' && <PingLayer map={map} state={state} pings={room.pings} />}
      <HandDeck state={state} room={room} armed={armed} setArmed={setArmed} onHoverCard={setHoverCard} focus={focus} />
      <ResultOverlay state={state} room={room} />
      <Flights map={map} state={state} />
      <Stamps map={map} state={state} />
    </main>
    </CrisisProvider>
  );
}
