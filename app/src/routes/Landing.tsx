// The front door: real Miami Beach and its flood zones inside the shared seascape shell, the four stakeholders,
// and three ways in (host a match, join one, open the Civic Atlas).
import { useState, type FormEvent } from 'react';
import { CARDS, DATA_SOURCES, DISTRICTS, PERSONAS, PERSONA_INFO, districtFacts, startCity } from '@shared';
import { CityMap, type Overlays } from '../map/CityMap';
import { Link, navigate } from '../router';
import { CoastalBrand, CoastalShell } from '../ui/CoastalShell';
import { Stakeholder } from '../ui/Stakeholder';
import { GameCard } from '../game/GameCard';
import { Legend } from './Play';
import { unlockAudio } from '../ui/sound';

// No I or O, so codes read cleanly off a projector.
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const newRoomCode = () => Array.from({ length: 4 }, () => LETTERS[Math.floor(Math.random() * LETTERS.length)]).join('');
const CITY = startCity();

export function Landing() {
  const [code, setCode] = useState('');
  const [overlays, setOverlays] = useState<Overlays>({ flood: true, zoning: false });
  const [area, setArea] = useState<string | null>(null);
  const join = (e: FormEvent) => {
    e.preventDefault();
    const c = code.trim().toUpperCase();
    if (/^[A-HJ-NP-Z]{4}$/.test(c)) navigate(`/play/${c}`);
  };
  const d = area ? DISTRICTS.find((x) => x.id === area) : null;
  return (
    <CoastalShell>
      <section className="wet landing-hero">
          <div className="landing-intro">
            <p className="eyebrow">One shoreline. Four perspectives.</p>
            <h1><CoastalBrand large /></h1>
            <p className="mt-2 text-18 font-semibold">Clash Royale meets real-world coastal planning. Four stakeholders deploy cards on a real city, their proposals collide, and every match becomes geographically linked feedback for planners.</p>
            <div className="landing-actions">
              <button type="button" className="aero-btn aero-btn-go aero-btn-lg" onClick={() => { unlockAudio(); navigate(`/play/${newRoomCode()}`); }}>Host a match ▶</button>
              <form onSubmit={join} className="landing-join">
                <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={4} placeholder="CODE" aria-label="Room code" className="aero-input w-28 text-center tracking-widest uppercase" />
                <button className="aero-btn aero-btn-aqua">Join</button>
              </form>
              <Link to="/atlas" className="aero-btn">Civic Atlas</Link>
            </div>
          </div>
          <div className="landing-map-panel">
            <div className="landing-map">
              <CityMap city={CITY} overlays={overlays} onPick={setArea} target={area} padding={{ top: 35, bottom: 35, left: 25, right: 25 }} />
            </div>
            <div className="landing-map-details">
            <Legend overlays={overlays} setOverlays={setOverlays} />
            {d ? (
              <div className="landing-area">
                <p className="font-display text-24 font-black">{d.name}</p>
                <p className="text-13">{d.blurb}</p>
                <ul className="mt-2 list-disc pl-5 text-13">{districtFacts(d).map((f) => <li key={f}>{f}</li>)}</ul>
                <p className="mt-2 text-[11px] opacity-70">Built from {d.sources.zoningIds.length} City zoning polygons · {d.planningDistrict} planning district</p>
              </div>
            ) : (
              <p className="text-13 font-bold">Tap a playable area to see its real flood and zoning profile.</p>
            )}
            </div>
          </div>
      </section>

      <section className="landing-more">
        <h2 className="screen-title">Four stakeholders. One shoreline.</h2>
        <div className="relative grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {PERSONAS.map((id) => {
            const p = PERSONA_INFO[id];
            return (
              <article key={id} className="wet flex flex-col gap-3 p-4" style={{ ['--tint' as string]: p.color }}>
                <Stakeholder persona={id}>{p.title}</Stakeholder>
                <p className="text-15">{p.goal}</p>
                <p className="text-13 italic opacity-80">{p.voice}</p>
              </article>
            );
          })}
        </div>
        <div className="wet flex flex-col gap-4 p-5">
          <h3 className="section-title">How a round plays</h3>
          <ol className="grid grid-cols-1 gap-2 text-15 sm:grid-cols-2 lg:grid-cols-4">
            <li><b>1. Crisis.</b> Gemini writes each match’s crises live from NOAA’s Virginia Key tide gauge, the NWS forecast and each area’s real flood and zoning profile.</li>
            <li><b>2. Deploy.</b> Each stakeholder clicks an area and plays one of the cards it allows. The real zoning and FEMA layers decide where each card is allowed.</li>
            <li><b>3. Clash & negotiate.</b> Cards are revealed together. Back, oppose, fund, or accept a compromise.</li>
            <li><b>4. Resolve.</b> A deterministic rules engine decides, shows every rule it applied, and the city changes.</li>
          </ol>
          <div className="flex gap-2 overflow-x-auto pb-2">
            {(['hotel-development', 'environmental-challenge', 'public-access-guarantee', 'emergency-funding', 'living-shoreline'] as const).map((c) => <GameCard key={c} id={c} size="lg" />)}
          </div>
          <p className="text-13 opacity-80">{Object.keys(CARDS).length} cards with authored, tested rules. Effects are illustrative scenario values; geography is real.</p>
        </div>
        <footer className="wet p-5 text-13">
          <p className="font-bold">Data sources</p>
          <ul className="mt-1 list-disc pl-5">
            {DATA_SOURCES.map((s) => <li key={s.id}><a className="underline" href={s.layer} target="_blank" rel="noreferrer">{s.name}</a> · fetched {s.fetchedAt.slice(0, 10)}</li>)}
          </ul>
          <p className="mt-2 opacity-80">Budgets in the game are hypothetical. Role-play choices are not public opinion; the end-of-match question asks players for their own view, recorded separately.</p>
        </footer>
      </section>
    </CoastalShell>
  );
}
