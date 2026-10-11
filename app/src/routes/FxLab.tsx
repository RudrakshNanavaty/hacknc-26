// Dev only (/fx-lab): every crisis animation on demand. The authored scenario only plays flood,
// development and storm, and erosion and budget only come from Gemini, so this is the way to see them all.
import { useState } from 'react';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { CRISIS_KINDS, CRISIS_KIND_INFO, DISTRICTS, startCity, type CrisisKind } from '@shared';
import { CityMap } from '../map/CityMap';
import { CrisisFx, type CrisisStage } from '../map/CrisisFx';
import type { Intensity } from '../map/intensity';

const CITY = startCity();

export function FxLab() {
  const [map, setMap] = useState<MapLibreMap | null>(null);
  const [kind, setKind] = useState<CrisisKind>('flood');
  const [spot, setSpot] = useState<string[]>(['west-avenue', 'south-pointe']);
  const [intensity, setIntensity] = useState<Intensity>(2);
  const [stage, setStage] = useState<CrisisStage>('off');
  const [run, setRun] = useState(0);
  const play = (s: CrisisStage) => {
    setStage(s);
    if (s === 'alert') setRun((n) => n + 1);
  };
  return (
    <main className="stage">
      <section className="stage-map">
        <CityMap
          city={CITY} spotlight={spot} overlays={{ flood: false, zoning: false }} onReady={setMap} focus={spot[0] ?? null}
          padding={{ top: 140, bottom: 40, left: 40, right: 40 }}
          chipBadge={(id) => (spot.includes(id) ? CRISIS_KIND_INFO[kind].icon : null)}
          onPick={(id) => setSpot((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))}
        />
      </section>
      <CrisisFx map={map} id={`lab-${run}`} kind={kind} spotlight={spot} intensity={intensity} stage={stage} />
      <div className="hud">
        <div className="float-card hud-row flex-wrap items-center !gap-2 !p-3">
          <b className="vr">FX lab</b>
          {CRISIS_KINDS.map((k) => (
            <button key={k} type="button" className={`gel gel-sm ${k === kind ? 'gel-sun' : ''}`} onClick={() => setKind(k)}>{CRISIS_KIND_INFO[k].icon} {k}</button>
          ))}
          <span className="lchip">Intensity</span>
          {([1, 2, 3] as const).map((n) => <button key={n} type="button" className={`gel gel-sm ${n === intensity ? 'gel-sun' : ''}`} onClick={() => setIntensity(n)}>{n}</button>)}
          <span className="lchip">Stage</span>
          {(['alert', 'rest', 'off'] as const).map((s) => <button key={s} type="button" className={`gel gel-sm ${s === stage ? 'gel-lime' : ''}`} onClick={() => play(s)}>{s}</button>)}
          <span className="text-13">Click areas to toggle the spotlight: {spot.map((id) => DISTRICTS.find((d) => d.id === id)?.name).join(', ') || 'none'}</span>
        </div>
      </div>
    </main>
  );
}
