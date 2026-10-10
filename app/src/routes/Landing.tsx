// Screen 1, the Living Ocean: the globe with real reefs pinned on it. Pick a reef to see its card,
// then test solo, open a room, or join one by code.
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Map as MapLibreMap, Marker } from 'maplibre-gl';
import { REEFS, reefById, type ReefId } from '@shared';
import { globeStyle } from '../map/globe';
import { Link, navigate } from '../router';
import { tokens } from '../tokens';
import { useTheme } from '../theme';
import { ReefCard } from '../ui/ReefCard';
import { button } from '../workshop/Workshop';

// No I or O, so codes read cleanly off a projector.
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const newRoomCode = () => Array.from({ length: 4 }, () => LETTERS[Math.floor(Math.random() * LETTERS.length)]).join('');

/** The globe at rest: the Pacific, with Hawaiʻi and the Great Barrier Reef in view. */
const HOME = { center: [-170, 5] as [number, number], zoom: 1.6 };

export function Landing() {
  const container = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<MapLibreMap | null>(null);
  const [focus, setFocus] = useState<ReefId>('kaneohe');
  const [code, setCode] = useState('');
  const dark = useTheme((s) => s.theme === 'dark');

  useEffect(() => {
    if (!container.current) return;
    const m = new MapLibreMap({
      container: container.current,
      style: globeStyle(tokens(), dark),
      center: HOME.center,
      zoom: HOME.zoom,
      attributionControl: { compact: true },
    });
    for (const reef of REEFS) {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = `border-(length:--rule) border-ink px-2 py-1 text-13 font-semibold shadow-piece ${reef.ready ? 'bg-signal' : 'bg-bond'}`;
      el.textContent = reef.ready ? reef.name : `${reef.name} · next`;
      el.addEventListener('click', () => setFocus(reef.id));
      new Marker({ element: el, anchor: 'bottom' }).setLngLat([reef.lon, reef.lat]).addTo(m);
    }
    setMap(m);
    return () => m.remove();
    // The globe is made once; the theme is applied below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    map?.setStyle(globeStyle(tokens(), dark));
  }, [map, dark]);

  useEffect(() => {
    const reef = reefById(focus);
    map?.flyTo({ center: [reef.lon, reef.lat], zoom: 3.2, duration: 1600, essential: true });
  }, [map, focus]);

  const reef = reefById(focus);
  const joinRoom = (e: FormEvent) => {
    e.preventDefault();
    const c = code.trim().toUpperCase();
    if (/^[A-HJ-NP-Z]{4}$/.test(c)) navigate(`/play/${c}`);
  };

  return (
    <main className="relative h-full">
      {/* maplibre-gl.css makes the map element position: relative (unlayered, so it beats Tailwind's
          absolute): the map fills a positioned wrapper instead. */}
      <div className="absolute inset-0">
        <div ref={container} className="h-full w-full" />
      </div>
      <div className="pointer-events-none absolute inset-0 flex flex-col justify-between gap-4 p-4 sm:p-6">
        <header className="pointer-events-auto flex flex-wrap items-start justify-between gap-3">
          <div className="border-(length:--rule) border-ink bg-bond px-4 py-2 shadow-plate">
            <h1 className="font-display text-48 font-extrabold leading-none">ReefForge</h1>
            <p className="text-15">Build for fun. Discover for real.</p>
          </div>
          <Link to="/research" className={button}>Research Mode</Link>
        </header>
        <div className="pointer-events-auto flex flex-col items-start gap-3">
          <ReefCard reef={reef}>
            {reef.ready ? (
              <>
                <Link to={`/solo/${reef.id}`} className={button}>Test solo</Link>
                <button className={button} onClick={() => navigate(`/play/${newRoomCode()}`)}>Start a room</button>
              </>
            ) : (
              <p className="text-15">Coming next.</p>
            )}
          </ReefCard>
          <form onSubmit={joinRoom} className="flex gap-2 border-(length:--rule) border-ink bg-bond p-2 shadow-plate">
            <label className="sr-only" htmlFor="code">Room code</label>
            <input
              id="code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 4))}
              placeholder="CODE"
              className="tabular w-24 border-(length:--rule) border-ink bg-bond px-2 text-18 font-semibold tracking-widest"
            />
            <button className={button}>Join room</button>
          </form>
        </div>
      </div>
    </main>
  );
}
