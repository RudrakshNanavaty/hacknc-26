// The front door: real Miami Beach with its real flood zones behind glass, the four stakeholders,
// and three ways in (host a match, join one, open Planning Studio).
import { useState, type FormEvent } from 'react';
import { CARDS, DATA_SOURCES, DISTRICTS, PERSONAS, PERSONA_INFO, districtFacts, startCity } from '@shared';
import { CityMap, type Overlays } from '../map/CityMap';
import { Link, navigate } from '../router';
import { Bubbles } from '../ui/Bubbles';
import { PersonaOrb } from '../game/Players';
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
    <main className="relative min-h-full">
      <section className="relative h-[100svh] min-h-[640px] overflow-hidden">
        <div className="absolute inset-0">
          <CityMap city={CITY} overlays={overlays} onPick={setArea} target={area} padding={window.innerWidth >= 1024 ? { top: 60, bottom: 40, left: 520, right: 40 } : { top: 300, bottom: 120, left: 20, right: 20 }} />
        </div>
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/10 via-transparent to-abyss/30" />
        <div className="pointer-events-none relative flex h-full flex-col justify-between gap-4 p-4 sm:p-8">
          <div className="pointer-events-auto glass max-w-xl p-5 sm:p-7">
            <p className="chip mb-2 w-fit bg-white/70 text-aqua-deep">Miami Beach, Florida · real GIS data</p>
            <h1 className="hero-title font-display text-48 font-black sm:text-72">Coastal Clash</h1>
            <p className="mt-2 text-18 font-semibold">Clash Royale meets real-world coastal planning. Four stakeholders deploy cards on a real city, their proposals collide, and every match becomes geographically linked feedback for planners.</p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button type="button" className="aero-btn aero-btn-go aero-btn-lg pulse" onClick={() => { unlockAudio(); navigate(`/play/${newRoomCode()}`); }}>Host a match ▶</button>
              <form onSubmit={join} className="flex items-center gap-2">
                <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={4} placeholder="CODE" aria-label="Room code" className="aero-input w-28 text-center tracking-widest uppercase" />
                <button className="aero-btn aero-btn-aqua">Join</button>
              </form>
              <Link to="/studio" className="aero-btn">Planning Studio</Link>
            </div>
          </div>
          <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div className="pointer-events-auto"><Legend overlays={overlays} setOverlays={setOverlays} /></div>
            {d ? (
              <div className="pointer-events-auto glass max-w-sm p-4">
                <p className="font-display text-24 font-black">{d.name}</p>
                <p className="text-13">{d.blurb}</p>
                <ul className="mt-2 list-disc pl-5 text-13">{districtFacts(d).map((f) => <li key={f}>{f}</li>)}</ul>
                <p className="mt-2 text-[11px] opacity-70">Built from {d.sources.zoningIds.length} City zoning polygons · {d.planningDistrict} planning district</p>
              </div>
            ) : (
              <p className="pointer-events-auto glass p-3 text-13 font-bold">Tap a playable area to see its real flood and zoning profile.</p>
            )}
          </div>
        </div>
      </section>

      <section className="relative mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10">
        <Bubbles count={14} seed={3} />
        <h2 className="relative font-display text-48 font-black text-white drop-shadow">Four stakeholders. One shoreline.</h2>
        <div className="relative grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {PERSONAS.map((id) => {
            const p = PERSONA_INFO[id];
            return (
              <article key={id} className="glass flex flex-col gap-2 p-4" style={{ ['--tint' as string]: p.color }}>
                <PersonaOrb persona={id} size={56} />
                <h3 className="font-display text-24 font-black">{p.name}</h3>
                <p className="text-13 font-bold opacity-80">{p.title}</p>
                <p className="text-15">{p.goal}</p>
                <p className="text-13 italic opacity-80">{p.voice}</p>
              </article>
            );
          })}
        </div>
        <div className="relative glass flex flex-col gap-3 p-5">
          <h3 className="font-display text-32 font-black">How a round plays</h3>
          <ol className="grid grid-cols-1 gap-2 text-15 sm:grid-cols-2 lg:grid-cols-4">
            <li><b>1. Crisis.</b> A scenario spotlights real places: a king tide, a hotel boom, storm season.</li>
            <li><b>2. Deploy.</b> Each stakeholder plays one card on a playable area. The real zoning and FEMA layers decide where each card is allowed.</li>
            <li><b>3. Clash & negotiate.</b> Cards are revealed together. Back, oppose, fund, or accept a compromise.</li>
            <li><b>4. Resolve.</b> A deterministic rules engine decides, shows every rule it applied, and the city changes.</li>
          </ol>
          <div className="flex gap-2 overflow-x-auto pb-2">
            {(['hotel-development', 'environmental-challenge', 'public-access-guarantee', 'emergency-funding', 'living-shoreline'] as const).map((c) => <GameCard key={c} id={c} />)}
          </div>
          <p className="text-13 opacity-80">{Object.keys(CARDS).length} cards with authored, tested rules. Effects are illustrative scenario values; geography is real.</p>
        </div>
        <footer className="relative glass p-4 text-13">
          <p className="font-bold">Data sources</p>
          <ul className="mt-1 list-disc pl-5">
            {DATA_SOURCES.map((s) => <li key={s.id}><a className="underline" href={s.layer} target="_blank" rel="noreferrer">{s.name}</a> · fetched {s.fetchedAt.slice(0, 10)}</li>)}
          </ul>
          <p className="mt-2 opacity-80">Budgets in the game are hypothetical. Role-play choices are not public opinion; the end-of-match question asks players for their own view, recorded separately.</p>
        </footer>
      </section>
    </main>
  );
}
