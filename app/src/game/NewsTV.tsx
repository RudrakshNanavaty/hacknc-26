// The news, on for the whole match. A crawl runs across the top edge (the crisis, its live readings, the
// spotlight areas, the round's twist, the last result); a card in the top-right corner has the pulsing
// anchor and the latest headline (the narrator's line, or the crisis title until there is one). Click the
// card for the details the old crisis screen had: the real facts of each spotlight area, what the crisis
// adds this round (rule K1), your agenda, and the round's twist. While the crisis lands, the full story
// and the live readings still drop in top-center as the briefing (CrisisBriefing), then fold into the card.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { CRISIS_KIND_INFO, INDICATOR_INFO, PERSONA_INFO, districtById, districtFacts, type RoomState } from '@shared';
import { spriteSvg } from '../map/sprites';
import { usePortrait } from '../characters/portraits';
import { useVoice } from '../ui/voice';
import { TwistCard } from './insights';
import { scenarioById2 } from '../plan/bits';
import { EvidenceStrip, StoryPanel } from './story';

const ANCHOR_SVG = spriteSvg('anchor');

/** The anchor: the 3D character's bust once rendered, the drawn one until then. Talking is a nod, or the mouth on the sprite. */
function AnchorFigure({ talking }: { talking: boolean }) {
  const p = usePortrait('anchor');
  if (p) return <span className="tv-anchor tv-anchor-3d" data-talking={talking ? 'true' : 'false'}><img src={p.bust} alt="" draggable={false} /></span>;
  return <span className="tv-anchor" data-talking={talking ? 'true' : 'false'} dangerouslySetInnerHTML={{ __html: ANCHOR_SVG }} />;
}
/** The card shows this many lines; a longer headline pans like a teleprompter. */
const LINES = 6;
/** The crawl's speed and the gap between its items. */
const CRAWL_PX_PER_S = 70;
const CRAWL_GAP = 40;
const LINE_PX = 16;

const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function Bonus({ state }: { state: RoomState }) {
  const c = state.crisis!;
  const parts = Object.entries(c.bonus).map(([k, v]) => `+${v} ${INDICATOR_INFO[k as keyof typeof INDICATOR_INFO].short.toLowerCase()}`);
  return <p className="lchip lchip-lime w-fit whitespace-normal">Approved projects in {c.spotlight.map((id) => districtById(id).name).join(' or ')} this round: {parts.join(', ')} (rule K1)</p>;
}

function Agenda({ state }: { state: RoomState }) {
  const me = state.players.find((p) => p.seat === state.you);
  if (!me || state.crisis?.story) return null;
  return <p className="text-13"><b>Your agenda, {PERSONA_INFO[me.persona].name}:</b> {PERSONA_INFO[me.persona].goal}</p>;
}

const Source = ({ state }: { state: RoomState }) => {
  const gemini = state.crisis?.source === 'gemini';
  return <span className="lchip">{state.crisis?.story ? (gemini ? 'Real story, told live by Gemini' : 'Real story') : gemini ? '✨ Written live by Gemini' : 'Authored scenario'}</span>;
};

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
      <EvidenceStrip crisis={c} />
      <Agenda state={state} />
    </div>
  );
}

/** The drawer under the TV. */
function NewsDetails({ state }: { state: RoomState }) {
  if (state.plan) {
    const sc = scenarioById2(state.plan.scenarioId);
    return (
      <>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="lchip lchip-sun">📰 {sc ? sc.title : 'Planning session'}</span>
          {state.headline?.source === 'gemini' && <span className="lchip">✨ Anchor line by Gemini</span>}
        </div>
        {state.headline && <p className="frost p-2.5 text-15 font-bold">“{state.headline.text}”</p>}
        {sc && <p className="text-15 font-semibold">{sc.situation}</p>}
        {sc && <ul className="list-disc pl-5 text-13 font-semibold">{sc.facts.map((f) => <li key={f}>{f}</li>)}</ul>}
        {sc && <p className="text-13 font-bold opacity-80">{sc.sources.length} sources, listed under “Play a Card”.</p>}
      </>
    );
  }
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
      <StoryPanel crisis={c} you={state.players.find((p) => p.seat === state.you)?.persona ?? null} />
      {!c.story && <div className="frost p-2.5"><Agenda state={state} /></div>}
      {twist && <TwistCard ev={twist} />}
    </>
  );
}

/** What runs across the top: short, from what the match already knows (no new numbers). */
function crawlItems(state: RoomState): string[] {
  if (state.plan) {
    const sc = scenarioById2(state.plan.scenarioId);
    const last = state.plan.rounds.at(-1);
    return [
      sc ? `Round ${state.round} of ${state.totalRounds}: ${sc.title}` : 'Coastal Clash planning session',
      ...(sc ? sc.facts.slice(0, 3) : []),
      last ? `Round ${last.round}: ${last.verdict}` : '',
      'Real Miami Beach stories, sourced and checked',
    ].filter(Boolean);
  }
  const c = state.crisis;
  if (!c) return ['Live desk checking Miami Beach right now: tide gauge, flood thresholds, forecast, FEMA zones'];
  const twist = state.event && state.event.round === state.round ? state.event : null;
  const last = state.history.at(-1);
  return [
    c.title,
    ...c.readings,
    `Spotlight: ${c.spotlight.map((id) => districtById(id).name).join(' and ')}`,
    twist ? `Twist: ${twist.title}` : '',
    last ? `Round ${last.round}: ${last.headline}` : '',
  ].filter(Boolean);
}

/** The strip across the top: an alert label, then the items crawling left, looped. */
function Crawl({ state, label, quiet }: { state: RoomState; label: string; quiet: boolean }) {
  // While a player decides, the crawl holds still on one line instead of competing with the instruction.
  const text = quiet ? 'Your move: the news waits. Tap the TV to read it.' : crawlItems(state).join('  ◆  ');
  const probe = useRef<HTMLSpanElement>(null);
  const [fit, setFit] = useState({ reps: 2, ms: 60000 });
  useLayoutEffect(() => {
    const w = (probe.current?.offsetWidth ?? 0) + CRAWL_GAP;
    if (w <= CRAWL_GAP) return;
    // Each half of the loop is at least as wide as the screen, so there is never a gap.
    const reps = Math.max(1, Math.ceil(window.innerWidth / w));
    setFit({ reps, ms: Math.round(((reps * w) / CRAWL_PX_PER_S) * 1000) });
  }, [text]);
  const half = Array.from({ length: fit.reps }, (_, i) => <span key={i} className="crawl-item">{text}</span>);
  return (
    <div className="crawl" aria-hidden>
      <span className="crawl-tag"><i />{label}</span>
      {quiet ? <span className="crawl-view"><span className="crawl-item">{text}</span></span> : <span className="crawl-view">
        <span ref={probe} className="crawl-probe">{text}</span>
        <span key={text} className="crawl-track" style={{ ['--crawl-ms' as string]: `${fit.ms}ms` }}>
          {half}
          {half}
        </span>
      </span>}
    </div>
  );
}

export function NewsTV({ state, open, setOpen, quiet = false }: { state: RoomState; open: boolean; setOpen: (open: boolean) => void; quiet?: boolean }) {
  const c = state.crisis;
  const kind = c ? CRISIS_KIND_INFO[c.kind] : null;
  const crisisPhase = state.phase === 'crisis';
  const headline = state.headline;
  // The crisis title leads while the crisis lands; after that the narrator's line is the news.
  const text = (crisisPhase ? c?.title : headline?.text ?? c?.title) ?? (state.plan ? 'Coastal Clash Live: the planning session is on' : 'Checking Miami Beach right now…');
  const live = !crisisPhase && headline?.source === 'gemini';
  const label = crisisPhase ? 'Breaking' : kind ? `${kind.label} alert` : 'Live desk';

  // The anchor talks for about as long as the line takes to read.
  const [reading, setReading] = useState(false);
  useEffect(() => {
    setReading(true);
    const t = setTimeout(() => setReading(false), Math.min(9000, 700 + text.length * 55));
    return () => clearTimeout(t);
  }, [text]);
  // With a voice, she nods for exactly as long as her clip plays; without one, for about as long as it takes to read.
  const voiced = useVoice((s) => s.voice === 'broadcast' && !!s.clip);
  const anyVoice = useVoice((s) => !!s.clip);
  const talking = voiced || (reading && !anyVoice);

  // A line longer than the card pans up like a teleprompter (never with reduced motion: the drawer has it all).
  const inner = useRef<HTMLSpanElement>(null);
  const [pan, setPan] = useState(0);
  useLayoutEffect(() => {
    const over = (inner.current?.scrollHeight ?? 0) - LINES * LINE_PX;
    setPan(over > 2 && !reduceMotion() ? over : 0);
  }, [text]);

  return (
    <>
      <Crawl state={state} label={label} quiet={quiet} />
      <div className={`tv-zone ${quiet ? 'is-quiet' : ''}`}>
        <button
          type="button" className="tv hud-block" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls="news-drawer"
          aria-label="Coastal Clash Live news desk. Show details"
        >
          <span className="tv-face" aria-hidden>
            <span className="tv-face-clip">
              <svg className="tv-skyline" viewBox="0 0 320 70" preserveAspectRatio="none">
                <path d="M0 70V48h18V30h14v18h10V38h16V22h12v26h14V34h12v14h16V26h14v22h12V40h18V18h14v30h12V36h16v12h14V30h12v18h16V42h18v28Z" fill="#fff" />
              </svg>
              <AnchorFigure talking={talking} />
              <span className="tv-live"><i />LIVE</span>
              <span className="tv-net">Coastal Clash News</span>
            </span>
            <span className="tv-ring" />
          </span>
          <span className="tv-copy">
            <span className="tv-tags">
              {kind && <span className="tv-chip is-dark">{kind.icon} {kind.label}</span>}
              <span className="tv-chip">{live ? '✨ Gemini' : 'News desk'}</span>
              <span className={`tv-chev ${open ? 'is-open' : ''}`} aria-hidden>▾</span>
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
          </span>
        </button>
        {open && (
          <div id="news-drawer" className="float-card tv-drawer flex flex-col gap-2">
            <NewsDetails state={state} />
          </div>
        )}
      </div>
    </>
  );
}
