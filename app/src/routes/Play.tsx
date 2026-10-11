// A Coastal Clash room. Lobby, then the stage: the real Miami Beach map as the arena (city meters,
// clock and stakeholders over it) and the lagoon column beside it (or below, on a phone) with one
// screen per phase. The server runs the clock and every rule; this page shows what it is sent.
import { useEffect, useMemo, useState } from 'react';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { DISTRICT_IDS, cardEligibility, type CardId } from '@shared';
import { CityMap, FLOOD_COLORS, ZONING_FAMILIES, type Overlays } from '../map/CityMap';
import { savedPlayer, useRoom } from '../room/useRoom';
import { Link } from '../router';
import { useSound } from '../ui/sound';
import { say, hush } from '../ui/voice';
import { Flights, Stamps } from '../game/Flights';
import { LivingLayer } from '../map/LivingLayer';
import { Meters, PlayerBubbles, TimerOrb } from '../game/Hud';
import { JoinForm, Lobby } from '../game/Lobby';
import { CardScreen, CrisisScreen, DuelScreen, FinalScreen, ResultScreen } from '../game/screens';
import { LagoonBubbles } from '../game/ui';
import { useCountdown } from '../game/format';
import { LedgerPanel, MoneyToasts } from '../game/money';
import { SoundToggle } from '../ui/SoundToggle';

function useWide() {
  const q = '(min-width: 1024px)';
  const [wide, setWide] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q);
    const on = () => setWide(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return wide;
}

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
  const left = useCountdown(state, room.offset);
  const wide = useWide();
  const [map, setMap] = useState<MapLibreMap | null>(null);
  const [card, setCard] = useState<CardId | null>(null);
  /** The card under the pointer: its legal targets light up before you pick it. */
  const [hoverCard, setHoverCard] = useState<CardId | null>(null);
  const [target, setTarget] = useState<string | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const [overlays, setOverlays] = useState<Overlays>({ flood: true, zoning: false });
  const [layers, setLayers] = useState(false);
  const [ledger, setLedger] = useState(false);
  const sound = useSound();
  const [voiceOn, setVoiceOn] = useState(false);

  const me = state?.you ?? null;
  const host = me !== null && state?.hostSeat === me;
  const phase = state?.phase;
  useEffect(() => {
    setCard(null);
    setTarget(null);
    setHoverCard(null);
  }, [state?.round, phase === 'select']);

  useEffect(() => {
    if (!voiceOn || !state?.headline) return;
    void say(state.headline.text, 'broadcast');
    return () => hush();
  }, [voiceOn, state?.headline?.key, state?.headline?.source]);

  const shownCard = card ?? hoverCard;
  const eligible = useMemo(
    () => (phase === 'select' && shownCard && !state?.mine?.selection ? Object.fromEntries(DISTRICT_IDS.map((d) => [d, cardEligibility(shownCard, d).ok])) : null),
    [phase, shownCard, state?.mine?.selection],
  );
  const focusDistrict = useMemo(() => state?.board?.proposals.find((p) => p.id === focus)?.district ?? state?.board?.proposals[0]?.district ?? null, [state?.board, focus]);

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
        <SoundToggle />
      </main>
    );
  }

  const camera =
    phase === 'crisis' ? state.crisis?.spotlight[0] ?? null
      : phase === 'select' ? target
        : phase === 'reveal' || phase === 'negotiate' ? focusDistrict
          : null;
  const pickArea = phase === 'select' && card && !state.mine?.selection ? (id: string) => cardEligibility(card, id).ok && setTarget(id) : undefined;
  const screen =
    phase === 'crisis' ? <CrisisScreen state={state} />
      : phase === 'select' ? <CardScreen state={state} room={room} card={card} setCard={setCard} target={target} setTarget={setTarget} map={map} onHover={setHoverCard} />
        : phase === 'reveal' || phase === 'negotiate' ? <DuelScreen state={state} room={room} focus={focus} setFocus={setFocus} />
          : phase === 'resolve' ? <ResultScreen state={state} host={host} onNext={room.skip} />
            : <FinalScreen state={state} room={room} />;

  return (
    <main className="stage">
      <section className="stage-map">
        <CityMap
          city={state.city}
          spotlight={phase === 'final' ? [] : state.crisis?.spotlight ?? []}
          target={phase === 'select' ? target ?? state.mine?.selection?.district ?? null : phase === 'reveal' || phase === 'negotiate' ? focusDistrict : null}
          eligible={eligible}
          overlays={overlays}
          onPick={pickArea}
          focus={camera}
          padding={wide ? { top: 110, bottom: 40, left: 250, right: 40 } : { top: 70, bottom: 60, left: 10, right: 10 }}
          onReady={setMap}
        />
        <LivingLayer map={map} state={state} />
        <div className="map-top">
          <Meters state={state} />
          <TimerOrb state={state} left={left} />
        </div>
        <PlayerBubbles state={state} />
        <div className="map-tools">
          <button type="button" className="gel gel-icon" onClick={sound.toggle} aria-pressed={sound.on} title="Sound">{sound.on ? '🔊' : '🔇'}</button>
          <button type="button" className={`gel gel-icon ${voiceOn ? 'gel-lime' : ''}`} onClick={() => setVoiceOn((v) => !v)} aria-pressed={voiceOn} title="Read the news aloud">🎙️</button>
          <button type="button" className={`gel gel-icon ${layers ? 'gel-sun' : ''}`} onClick={() => setLayers((v) => !v)} aria-pressed={layers} title="Real data layers">🗺️</button>
          <button type="button" className={`gel gel-icon ${ledger ? 'gel-sun' : ''}`} onClick={() => setLedger((v) => !v)} aria-pressed={ledger} title="Ledger: every payment and its bank-mirror status">📒</button>
          {host && state.endsAt !== null && <button type="button" className="gel" onClick={room.skip} title="Host: end this phase now">Skip ⏭</button>}
          {layers && <Legend overlays={overlays} setOverlays={setOverlays} />}
        </div>
        {ledger && <LedgerPanel state={state} onClose={() => setLedger(false)} />}
        <MoneyToasts state={state} />
      </section>
      <aside className="stage-side lagoon">
        <LagoonBubbles count={12} seed={phase?.length ?? 3} />
        {room.error && <p role="alert" className="wet p-2 text-13 font-black text-[#c0392b]">{room.error}</p>}
        {screen}
      </aside>
      <Flights map={map} state={state} />
      <Stamps map={map} state={state} />
    </main>
  );
}
