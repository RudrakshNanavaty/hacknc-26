// Screen 1, the Living Ocean: a satellite globe with real reefs pinned on it. Pick a reef to see its
// mission card and data, toggle the data layers (Sources), then dive in, open a room or join one.
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { GeoJSONSource, Map as MapLibreMap, Marker } from 'maplibre-gl';
import { REEFS, reefById, type ReefId } from '@shared';
import { reefHeatGrid } from '../api';
import { HEAT_COLOR, globeStyle, setLayer, type DataLayer } from '../map/globe';
import { Link, navigate } from '../router';
import { Bubbles } from '../ui/Bubbles';
import { ReefCard, ReefFacts, ReefHero, ReefTitle } from '../ui/ReefCard';
import { Sheet } from '../ui/Sheet';
import { useMedia } from '../ui/useMedia';

// No I or O, so codes read cleanly off a projector.
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const newRoomCode = () => Array.from({ length: 4 }, () => LETTERS[Math.floor(Math.random() * LETTERS.length)]).join('');

/** The globe at rest: the Pacific, with Hawaiʻi and the Great Barrier Reef in view. */
const HOME = { center: [-175, 2] as [number, number], zoom: 2.0 };
/** Width of the reef card plus its margin: the map keeps the focused reef clear of it on wide screens. */
const CARD_CLEARANCE = 440;
const LAYERS: { id: DataLayer; label: string; note: string }[] = [
  { id: 'satellite', label: 'Satellite imagery', note: 'Esri World Imagery' },
  { id: 'relief', label: 'Seafloor relief', note: 'NOAA NCEI global DEM hillshade' },
  { id: 'heat', label: 'Heat stress', note: 'NOAA Coral Reef Watch, latest day, around the reef' },
  { id: 'sites', label: 'Data sites', note: 'Where each reef’s measurements come from' },
];
const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function Landing() {
  const container = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<MapLibreMap | null>(null);
  const [focus, setFocus] = useState<ReefId>('kaneohe');
  const [code, setCode] = useState('');
  const [layers, setLayers] = useState<Record<DataLayer, boolean>>({ satellite: true, relief: false, heat: false, sites: true });
  const [heatDate, setHeatDate] = useState<string | null | 'loading'>(null);
  const [panel, setPanel] = useState(false);
  const [diving, setDiving] = useState(false);
  const wide = useMedia('(min-width: 640px)');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [inset, setInset] = useState(190);
  const pins = useRef(new Map<ReefId, HTMLButtonElement>());

  useEffect(() => {
    if (!container.current) return;
    const m = new MapLibreMap({
      container: container.current,
      style: globeStyle(layers),
      center: HOME.center,
      zoom: window.innerWidth < 640 ? 1.3 : HOME.zoom,
      attributionControl: { compact: true },
      maxPitch: 75,
    });
    for (const reef of REEFS) {
      const el = document.createElement('button');
      el.type = 'button';
      el.setAttribute('aria-label', `${reef.name}${reef.ready ? '' : ', coming next'}`);
      el.className = 'pin';
      el.innerHTML = `
        <span class="pin-label glass-deep glass-flat">${reef.name}${reef.ready ? '' : ' <span class="pin-next">next</span>'}</span>
        <span class="orb ${reef.ready ? 'orb-sun pulse' : ''}" style="width:${reef.ready ? 22 : 16}px;height:${reef.ready ? 22 : 16}px;${reef.ready ? '' : 'opacity:.85'}"></span>`;
      el.addEventListener('click', () => setFocus(reef.id));
      pins.current.set(reef.id, el);
      new Marker({ element: el, anchor: 'bottom' }).setLngLat([reef.lon, reef.lat]).addTo(m);
    }
    // A slow idle spin until someone touches the globe.
    let spinning = !reduceMotion();
    const stop = () => (spinning = false);
    m.on('mousedown', stop);
    m.on('touchstart', stop);
    m.on('wheel', stop);
    const spin = () => {
      if (!spinning || m.getZoom() > 3) return;
      const c = m.getCenter();
      m.easeTo({ center: [c.lng + 6, c.lat], duration: 1000, easing: (t) => t });
    };
    m.on('moveend', spin);
    m.once('load', () => {
      setMap(m);
      // Start on Kāneʻohe after a short look at the whole ocean.
      setTimeout(() => {
        spinning = false;
        setFocus('kaneohe');
      }, reduceMotion() ? 0 : 1800);
    });
    return () => m.remove();
    // The globe is made once; layer changes go through setLayer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!map) return;
    flyToReef(map, focus, wide ? { left: CARD_CLEARANCE } : { bottom: inset + 16 });
    for (const [id, el] of pins.current) el.dataset.focus = String(id === focus);
  }, [map, focus, wide, inset]);

  // The heat layer follows the chosen reef.
  useEffect(() => {
    if (!map || !layers.heat) return;
    let live = true;
    setHeatDate('loading');
    reefHeatGrid(focus).then((grid) => {
      if (!live) return;
      setHeatDate(grid?.date ?? null);
      (map.getSource('heat') as GeoJSONSource | undefined)?.setData(grid ?? { type: 'FeatureCollection', features: [] });
    });
    return () => {
      live = false;
    };
  }, [map, focus, layers.heat]);

  const toggle = (id: DataLayer) => {
    const next = { ...layers, [id]: !layers[id] };
    setLayers(next);
    if (map) setLayer(map, id, next[id]);
  };

  const reef = reefById(focus);
  const dive = () => {
    if (!map || reduceMotion()) return navigate(`/dive/${reef.id}`);
    const [w, s, e, n] = reef.bbox;
    map.flyTo({ center: [(w + e) / 2, (s + n) / 2], zoom: 13.6, pitch: 62, bearing: 25, duration: 3200, curve: 1.6, essential: true });
    setTimeout(() => setDiving(true), 2400);
    setTimeout(() => navigate(`/dive/${reef.id}`), 3400);
  };
  const joinRoom = (e: FormEvent) => {
    e.preventDefault();
    const c = code.trim().toUpperCase();
    if (/^[A-HJ-NP-Z]{4}$/.test(c)) navigate(`/play/${c}`);
  };

  const actions = reef.ready ? (
    <>
      <button className="btn btn-primary btn-lg" onClick={dive}>Dive in</button>
      <button className="btn" onClick={() => navigate(`/play/${newRoomCode()}`)}>Start a room</button>
    </>
  ) : (
    <button className="btn" onClick={() => setFocus('kaneohe')}>Play Kāneʻohe Bay</button>
  );
  const joinFields = (
    <>
      <label className="sr-only" htmlFor="code">Room code</label>
      <input
        id="code"
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 4))}
        placeholder="CODE"
        autoComplete="off"
        className="field tabular w-28 text-18 tracking-widest"
      />
      <button className="btn">Join room</button>
    </>
  );

  return (
    <main className="relative h-full overflow-hidden">
      {/* maplibre-gl.css makes the map element position: relative (unlayered, so it beats Tailwind's
          absolute): the map fills a positioned wrapper instead. */}
      <div className="absolute inset-0">
        <div ref={container} className="h-full w-full" />
      </div>
      <Bubbles count={14} className="opacity-60" />

      <div className="pointer-events-none absolute inset-0 flex flex-col justify-between gap-3 p-3 sm:p-6">
        <header className="pointer-events-auto flex flex-wrap items-start justify-between gap-2">
          <div className="glass-deep flex items-center gap-3 px-4 py-2.5">
            <span className="orb h-10 w-10 shrink-0" aria-hidden />
            <div>
              <h1 className="font-brand text-32 leading-none font-black">
                Reef<span className="text-sky">Forge</span>
              </h1>
              <p className="text-13 font-semibold text-white/85">Build for fun. Discover for real.</p>
            </div>
          </div>
          <nav className="glass-deep flex items-center gap-1 rounded-full p-1">
            <button className="btn" aria-expanded={panel} onClick={() => setPanel((p) => !p)}>Sources</button>
            <Link to="/research" className="btn">Research Mode</Link>
          </nav>
        </header>

        {panel && (
          <section className="glass-deep pointer-events-auto absolute top-44 right-3 w-72 sm:top-24 max-w-[calc(100%-1.5rem)] p-4 sm:right-6" aria-label="Map data layers">
            <h2 className="font-display text-18 font-bold">Map sources</h2>
            <ul className="mt-2 space-y-2">
              {LAYERS.map((l) => (
                <li key={l.id}>
                  <label className="flex cursor-pointer items-start gap-2">
                    <input type="checkbox" className="mt-1 h-4 w-4 accent-aqua-deep" checked={layers[l.id]} onChange={() => toggle(l.id)} />
                    <span>
                      <span className="block font-bold">{l.label}</span>
                      <span className="block text-13 text-white/80">{l.note}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            {layers.heat && (
              <div className="mt-3 text-13">
                <div className="h-2.5 rounded-full" style={{ background: `linear-gradient(90deg, ${(HEAT_COLOR.slice(3) as (number | string)[]).filter((v) => typeof v === 'string').join(',')})` }} />
                <div className="mt-0.5 flex justify-between"><span>0</span><span>4</span><span>8+ °C-weeks</span></div>
                <p className="mt-1">{heatDate === 'loading' ? 'Loading NOAA grid…' : heatDate ? `NOAA Coral Reef Watch, ${heatDate}` : 'Heat grid unavailable right now'}</p>
              </div>
            )}
          </section>
        )}

        {wide && (
          <div className="pointer-events-auto flex max-h-[calc(100dvh-9rem)] min-h-0 flex-col items-start gap-3">
            <ReefCard reef={reef} className="min-h-0">{actions}</ReefCard>
            <form onSubmit={joinRoom} className="glass-deep flex items-center gap-2 p-2">{joinFields}</form>
          </div>
        )}
      </div>

      {!wide && (
        <Sheet
          label={`${reef.name} mission`}
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          onPeekHeight={setInset}
          peek={
            <>
              <ReefTitle reef={reef} showRegion />
              <div className="mt-3 flex flex-wrap gap-2">{actions}</div>
            </>
          }
        >
          <ReefFacts reef={reef} />
          <ReefHero reef={reef} className="mt-4 h-28 rounded-inner" />
          <form onSubmit={joinRoom} className="mt-4 flex items-center gap-2">{joinFields}</form>
        </Sheet>
      )}

      {diving && (
        <div className="dive-veil fixed inset-0 z-50 flex items-center justify-center">
          <Bubbles count={40} seed={3} />
          <p className="font-display text-32 font-bold text-white drop-shadow">Diving to {reef.name}…</p>
        </div>
      )}
    </main>
  );
}

function flyToReef(map: MapLibreMap, id: ReefId, padding: { left?: number; bottom?: number }) {
  const reef = reefById(id);
  map.flyTo({
    center: [reef.lon, reef.lat],
    zoom: window.innerWidth < 640 ? 4.2 : 5.2,
    pitch: 30,
    bearing: 0,
    padding: { top: 0, right: 0, left: padding.left ?? 0, bottom: padding.bottom ?? 0 },
    duration: 2200,
    essential: true,
  });
}
