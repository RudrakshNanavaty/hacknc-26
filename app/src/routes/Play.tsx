// A Coastal Clash room: lobby, then three rounds on the real Miami Beach map, then the end screen
// with the personal-preference question. The server runs the clock and every rule; this page shows
// the state it is sent and sends what the player picks.
import { useEffect, useMemo, useState } from 'react';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { DISTRICT_IDS, cardEligibility, type CardId } from '@shared';
import { CityMap, FLOOD_COLORS, ZONING_FAMILIES, type Overlays } from '../map/CityMap';
import { savedPlayer, useRoom } from '../room/useRoom';
import { Link } from '../router';
import { Bubbles } from '../ui/Bubbles';
import { useSound } from '../ui/sound';
import { say, hush } from '../ui/voice';
import { Flights, Stamps } from '../game/Flights';
import { Hud } from '../game/Hud';
import { JoinForm, Lobby } from '../game/Lobby';
import { Players } from '../game/Players';
import { CrisisPanel, FinalPanel, HandPanel, NegotiationPanel, ResolvePanel, RevealPanel } from '../game/panels';
import { useCountdown } from '../game/format';

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
    <div className="legend glass">
      <p className="text-[11px] font-black tracking-wide uppercase opacity-70">Real data layers</p>
      <label className="flex items-center gap-2 text-13 font-bold">
        <input type="checkbox" checked={overlays.flood} onChange={(e) => setOverlays({ ...overlays, flood: e.target.checked })} />
        FEMA flood zones
      </label>
      {overlays.flood && (
        <p className="flex flex-wrap gap-2 pl-6 text-[11px]">
          <span><i className="swatch" style={{ background: FLOOD_COLORS.VE }} />VE coastal high hazard</span>
          <span><i className="swatch" style={{ background: FLOOD_COLORS.AE }} />AE 1% annual chance</span>
        </p>
      )}
      <label className="flex items-center gap-2 text-13 font-bold">
        <input type="checkbox" checked={overlays.zoning} onChange={(e) => setOverlays({ ...overlays, zoning: e.target.checked })} />
        City zoning
      </label>
      {overlays.zoning && (
        <p className="flex flex-wrap gap-2 pl-6 text-[11px]">
          {ZONING_FAMILIES.map((f) => <span key={f.label}><i className="swatch" style={{ background: f.color }} />{f.label}</span>)}
        </p>
      )}
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
  const [target, setTarget] = useState<string | null>(null);
  const [overlays, setOverlays] = useState<Overlays>({ flood: true, zoning: false });
  const sound = useSound();
  const [voiceOn, setVoiceOn] = useState(false);

  const me = state?.you ?? null;
  const host = me !== null && state?.hostSeat === me;
  const phase = state?.phase;
  useEffect(() => {
    setCard(null);
    setTarget(null);
  }, [state?.round, phase === 'select']);

  // Read the news aloud (optional; captions always show).
  useEffect(() => {
    if (!voiceOn || !state?.headline) return;
    void say(state.headline.text, 'broadcast');
    return () => hush();
  }, [voiceOn, state?.headline?.key, state?.headline?.source]);

  const eligible = useMemo(
    () => (phase === 'select' && card && !state?.mine?.selection ? Object.fromEntries(DISTRICT_IDS.map((d) => [d, cardEligibility(card, d).ok])) : null),
    [phase, card, state?.mine?.selection],
  );
  const hottest = useMemo(() => {
    if (!state?.board) return null;
    const count = new Map<string, number>();
    for (const p of state.board.proposals) count.set(p.district, (count.get(p.district) ?? 0) + 2);
    for (const a of state.board.attachments) count.set(a.district, (count.get(a.district) ?? 0) + 1);
    return [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  }, [state?.board]);

  const missing = !state && /not found/i.test(room.error ?? '');
  const joined = me !== null || !!savedPlayer(code);

  if (!state || state.phase === 'lobby' || me === null) {
    return (
      <main className="relative flex min-h-full flex-col items-center gap-4 p-4 sm:p-6">
        <Bubbles count={20} />
        <header className="relative flex w-full max-w-5xl items-center justify-between">
          <Link to="/" className="font-display text-24 font-black text-white drop-shadow">🌊 Coastal Clash</Link>
          <span className="chip bg-white/70 text-ink">Room {code}</span>
        </header>
        {room.error && !missing && <p role="alert" className="glass relative max-w-2xl p-3 text-15 text-coral">{room.error}</p>}
        <div className="relative flex w-full justify-center">
          {!state && !missing && <p className="glass p-6 text-18">Connecting to room {code}…</p>}
          {(missing || (state && me === null && !joined) || (state && me === null && state.phase === 'lobby')) && (state?.phase ?? 'lobby') === 'lobby' && <JoinForm room={room} create={missing} />}
          {state && me === null && state.phase !== 'lobby' && <p className="glass max-w-xl p-6 text-18">This match is under way. You can join the next one from this page, or watch the result in <Link to="/studio" className="font-bold underline">Planning Studio</Link>.</p>}
          {state && me !== null && state.phase === 'lobby' && <Lobby state={state} room={room} />}
        </div>
      </main>
    );
  }

  const focus = phase === 'crisis' ? state.crisis?.spotlight[0] ?? null : phase === 'negotiate' ? hottest : null;
  const pickArea = phase === 'select' && card && !state.mine?.selection ? (id: string) => cardEligibility(card, id).ok && setTarget(id) : undefined;
  const panel =
    phase === 'crisis' ? <CrisisPanel state={state} />
      : phase === 'select' ? <HandPanel state={state} room={room} card={card} setCard={setCard} target={target} setTarget={setTarget} />
        : phase === 'reveal' ? <RevealPanel state={state} />
          : phase === 'negotiate' ? <NegotiationPanel state={state} room={room} />
            : phase === 'resolve' ? <ResolvePanel state={state} />
              : <FinalPanel state={state} room={room} />;

  return (
    <main className="game-screen">
      <div className="absolute inset-0">
        <CityMap
          city={state.city}
          spotlight={phase === 'final' ? [] : state.crisis?.spotlight ?? []}
          target={phase === 'select' ? target ?? state.mine?.selection?.district ?? null : null}
          eligible={eligible}
          overlays={overlays}
          onPick={pickArea}
          focus={focus}
          padding={wide ? { top: 150, bottom: 40, left: 270, right: 460 } : { top: 170, bottom: Math.round(window.innerHeight * 0.48), left: 20, right: 20 }}
          onReady={setMap}
        />
      </div>
      <Hud state={state} left={left} onSkip={room.skip} host={host} />
      <aside className="side-left">
        <Players state={state} />
        {wide && <Legend overlays={overlays} setOverlays={setOverlays} />}
      </aside>
      <section className={`phase-panel glass ${phase === 'select' ? 'is-hand' : ''}`} aria-live="polite">
        {room.error && <p role="alert" className="mb-2 rounded-xl bg-coral/20 p-2 text-13 font-bold text-coral">{room.error}</p>}
        {panel}
      </section>
      <div className="corner-tools">
        <button type="button" className="aero-btn aero-btn-icon" onClick={sound.toggle} aria-pressed={sound.on} title="Sound">{sound.on ? '🔊' : '🔇'}</button>
        <button type="button" className="aero-btn aero-btn-icon" onClick={() => setVoiceOn((v) => !v)} aria-pressed={voiceOn} title="Read the news aloud">🎙️</button>
        {!wide && (
          <button type="button" className="aero-btn aero-btn-icon" onClick={() => setOverlays({ ...overlays, flood: !overlays.flood })} aria-pressed={overlays.flood} title="FEMA flood zones">🌊</button>
        )}
      </div>
      <Flights map={map} state={state} />
      <Stamps map={map} state={state} />
    </main>
  );
}
