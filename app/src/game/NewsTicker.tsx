// The news, top center over the map. While the crisis lands it is a breaking card (the live readings
// and the story); once play starts it folds into a one-line ticker that keeps the crisis and the latest
// headline in view. Click it for the details the old crisis screen had: the real facts of each
// spotlight area, what the crisis adds this round (rule K1), your agenda, and the round's twist.
import { CRISIS_KIND_INFO, INDICATOR_INFO, PERSONA_INFO, districtById, districtFacts, type RoomState } from '@shared';
import { TwistCard } from './insights';

function Bonus({ state }: { state: RoomState }) {
  const c = state.crisis!;
  const parts = Object.entries(c.bonus).map(([k, v]) => `+${v} ${INDICATOR_INFO[k as keyof typeof INDICATOR_INFO].short.toLowerCase()}`);
  return <p className="lchip lchip-lime w-fit whitespace-normal">Approved projects in {c.spotlight.map((id) => districtById(id).name).join(' or ')} this round: {parts.join(', ')} (rule K1)</p>;
}

function Agenda({ state }: { state: RoomState }) {
  const me = state.players.find((p) => p.seat === state.you);
  if (!me) return null;
  return <p className="text-13"><b>Your agenda, {PERSONA_INFO[me.persona].name}:</b> {PERSONA_INFO[me.persona].goal}</p>;
}

const Source = ({ state }: { state: RoomState }) => (
  <span className="lchip">{state.crisis?.source === 'gemini' ? '✨ Written live by Gemini' : 'Authored scenario'}</span>
);

export function NewsTicker({ state, open, setOpen }: { state: RoomState; open: boolean; setOpen: (open: boolean) => void }) {
  const c = state.crisis;

  if (!c) {
    if (state.phase !== 'crisis') return null;
    return (
      <div className="float-card crisis-card hud-block flex flex-col gap-2">
        <span className="breaking w-fit"><i />LIVE DESK</span>
        <h2 className="glow-title !text-[26px]">Checking Miami Beach right now…</h2>
        <div className="wet scanning grid grid-cols-2 gap-1.5 p-2">
          <p className="reading">🌊 NOAA tide gauge, Virginia Key</p>
          <p className="reading">⚠️ NOAA flood thresholds</p>
          <p className="reading">⛅ National Weather Service forecast</p>
          <p className="reading">🗺️ FEMA flood zones and City zoning</p>
        </div>
        <p className="text-13 font-bold">Gemini is writing this match’s crises from the live readings.</p>
      </div>
    );
  }

  const kind = CRISIS_KIND_INFO[c.kind];
  const twist = state.event && state.event.round === state.round ? state.event : null;

  if (state.phase === 'crisis') {
    return (
      <div key={c.id} className="float-card crisis-card hud-block drop-in flex flex-col gap-2" aria-live="polite">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="breaking"><i />BREAKING</span>
          <span className="lchip lchip-sun">{kind.icon} {kind.label}</span>
          <Source state={state} />
        </div>
        <h2 className="glow-title !text-[28px]">{c.title}</h2>
        <p className="typed text-15 font-semibold">{c.text}</p>
        {c.readings.length > 0 && <div className="flex flex-wrap gap-1">{c.readings.map((r) => <span key={r} className="reading !py-1">{r}</span>)}</div>}
        <Agenda state={state} />
      </div>
    );
  }

  const headline = state.headline;
  return (
    <div className="ticker-zone">
      <button type="button" className="ticker wet hud-block" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls="news-drawer">
        <span className="ticker-top">
          <span className="ticker-tag">{headline?.source === 'gemini' ? 'LIVE' : 'NEWS'}</span>
          <span className="text-18" aria-hidden>{kind.icon}</span>
          <b className="vr min-w-[40%] flex-1 truncate text-left text-[16px]">{c.title}</b>
          {twist && <span className="lchip lchip-sun shrink-0 !py-0">🎲 Twist</span>}
          {c.readings[0] && <span className="ticker-reading">{c.readings[0]}</span>}
          <span className={`ticker-chev ${open ? 'is-open' : ''}`} aria-hidden>▾</span>
        </span>
        {headline && <span key={headline.key + headline.source} className="ticker-line typed" aria-live="polite">{headline.text}</span>}
      </button>
      {open && (
        <div id="news-drawer" className="float-card ticker-drawer flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="lchip lchip-sun">{kind.icon} {kind.label}</span>
            <Source state={state} />
          </div>
          <p className="text-15 font-semibold">{c.text}</p>
          {c.readings.length > 0 && <div className="flex flex-wrap gap-1">{c.readings.map((r) => <span key={r} className="reading !py-1">{r}</span>)}</div>}
          {c.spotlight.map((id) => (
            <div key={id} className="frost p-2.5">
              <p className="vr text-[16px]">📍 {districtById(id).name}</p>
              <ul className="mt-1 list-disc pl-5 text-13 font-semibold">{districtFacts(districtById(id)).map((f) => <li key={f}>{f}</li>)}</ul>
            </div>
          ))}
          <Bonus state={state} />
          <div className="frost p-2.5"><Agenda state={state} /></div>
          {twist && <TwistCard ev={twist} />}
        </div>
      )}
    </div>
  );
}
