// The news. A TV window in the top-right corner stays on for the whole match: the anchor reads the
// latest headline (the narrator's line, or the crisis title until there is one). Click the TV for the
// details the old crisis screen had: the real facts of each spotlight area, what the crisis adds this
// round (rule K1), your agenda, and the round's twist. While the crisis lands, the full story and the
// live readings still drop in top-center as the briefing (CrisisBriefing), then fold into the TV.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { CRISIS_KIND_INFO, INDICATOR_INFO, PERSONA_INFO, districtById, districtFacts, type RoomState } from '@shared';
import { spriteSvg } from '../map/sprites';
import { TwistCard } from './insights';

const ANCHOR_SVG = spriteSvg('anchor');
/** The lower third shows this many lines; a longer headline pans like a teleprompter. */
const LINES = 3;
const LINE_PX = 16;

const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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

/** The crisis phase, top-center: the live desk gathering readings, then the breaking story. */
export function CrisisBriefing({ state }: { state: RoomState }) {
  if (state.phase !== 'crisis') return null;
  const c = state.crisis;
  if (!c) {
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

/** The drawer under the TV. */
function NewsDetails({ state }: { state: RoomState }) {
  const c = state.crisis;
  const twist = state.event && state.event.round === state.round ? state.event : null;
  const headline = state.headline;
  if (!c) return <p className="text-15 font-semibold">The live desk is still gathering this match’s readings.</p>;
  const kind = CRISIS_KIND_INFO[c.kind];
  return (
    <>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="lchip lchip-sun">{kind.icon} {kind.label}</span>
        <Source state={state} />
        {headline?.source === 'gemini' && <span className="lchip">✨ Anchor line by Gemini</span>}
      </div>
      {headline && <p className="frost p-2.5 text-15 font-bold">“{headline.text}”</p>}
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
    </>
  );
}

export function NewsTV({ state, open, setOpen }: { state: RoomState; open: boolean; setOpen: (open: boolean) => void }) {
  const c = state.crisis;
  const kind = c ? CRISIS_KIND_INFO[c.kind] : null;
  const crisisPhase = state.phase === 'crisis';
  const headline = state.headline;
  // The crisis title leads while the crisis lands; after that the narrator's line is the news.
  const text = (crisisPhase ? c?.title : headline?.text ?? c?.title) ?? 'Checking Miami Beach right now…';
  const tag = crisisPhase || !headline ? 'BREAKING' : headline.source === 'gemini' ? 'LIVE' : 'NEWS';

  // The anchor talks for about as long as the line takes to read.
  const [talking, setTalking] = useState(false);
  useEffect(() => {
    setTalking(true);
    const t = setTimeout(() => setTalking(false), Math.min(9000, 700 + text.length * 55));
    return () => clearTimeout(t);
  }, [text]);

  // A line longer than the lower third pans up like a teleprompter (never with reduced motion: the drawer has it all).
  const inner = useRef<HTMLSpanElement>(null);
  const [pan, setPan] = useState(0);
  useLayoutEffect(() => {
    const over = (inner.current?.scrollHeight ?? 0) - LINES * LINE_PX;
    setPan(over > 2 && !reduceMotion() ? over : 0);
  }, [text]);

  const spot = c?.spotlight.map((id) => districtById(id).name) ?? [];
  return (
    <div className="tv-zone">
      <button
        type="button" className="tv hud-block" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls="news-drawer"
        aria-label="Coastal Clash Live news desk. Show details"
      >
        <span className="tv-bar">
          <span className={`tv-tag ${tag === 'BREAKING' ? 'is-breaking' : ''}`}><i />{tag}</span>
          <span className="tv-name">Coastal Clash Live</span>
          <span className={`tv-chev ${open ? 'is-open' : ''}`} aria-hidden>▾</span>
        </span>
        <span className="tv-screen">
          <svg className="tv-skyline" viewBox="0 0 320 70" preserveAspectRatio="none" aria-hidden>
            <path d="M0 70V48h18V30h14v18h10V38h16V22h12v26h14V34h12v14h16V26h14v22h12V40h18V18h14v30h12V36h16v12h14V30h12v18h16V42h18v28Z" fill="#fff" />
          </svg>
          <span className="tv-anchor" data-talking={talking ? 'true' : 'false'} aria-hidden dangerouslySetInnerHTML={{ __html: ANCHOR_SVG }} />
          <span className="tv-desk" aria-hidden />
          {kind && (
            <span className="tv-ots" aria-hidden>
              <span className="tv-ots-icon">{kind.icon}</span>
              <span className="tv-ots-text">
                <b>{kind.label}</b>
                <span>{spot.slice(0, 2).join(' · ')}</span>
              </span>
            </span>
          )}
          <span className="tv-scan" aria-hidden />
        </span>
        <span className="tv-lower">
          <span key={text} className="tv-line" aria-live="polite">
            <span
              ref={inner} className={`tv-scroll ${pan ? 'is-long' : ''}`}
              style={pan ? { ['--pan' as string]: `-${pan}px`, ['--pan-ms' as string]: `${Math.max(2500, (pan / LINE_PX) * 1500)}ms` } : undefined}
            >
              {text}
            </span>
          </span>
        </span>
      </button>
      {open && (
        <div id="news-drawer" className="float-card tv-drawer flex flex-col gap-2">
          <NewsDetails state={state} />
        </div>
      )}
    </div>
  );
}
