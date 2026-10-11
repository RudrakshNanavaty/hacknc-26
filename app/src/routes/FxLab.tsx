// Dev only (/fx-lab): every crisis animation on demand. The authored scenario only plays flood,
// development and storm, and erosion and budget only come from Gemini, so this is the way to see them all.
import { useState } from 'react';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { CRISIS_KINDS, CRISIS_KIND_INFO, DISTRICTS, roleInfo, startCity, type CrisisKind, type RoleId } from '@shared';
import { CityMap } from '../map/CityMap';
import { CrisisFx, type CrisisStage } from '../map/CrisisFx';
import type { Intensity } from '../map/intensity';
import { spriteSvg, type SpriteRole } from '../map/sprites';

const CITY = startCity();

const SHEET_ROLES: SpriteRole[] = ['mayor', 'activist', 'resort', 'resident', 'anchor'];
const SHEET_MOODS = ['idle', 'celebrate', 'frustrated', 'worried', 'smug'] as const;

/** Every character at 2x in one mood, to review the art (the map shows them at 60px). */
function CharacterSheet() {
  const [mood, setMood] = useState<(typeof SHEET_MOODS)[number]>('idle');
  const [talk, setTalk] = useState(false);
  return (
    <div className="float-card z-30 flex flex-col gap-2 !p-3" style={{ position: 'fixed', left: 12, bottom: 12 }} aria-label="Characters">
      <div className="flex flex-wrap items-center gap-2">
        <b className="vr">Characters</b>
        {SHEET_MOODS.map((m) => <button key={m} type="button" className={`gel gel-sm ${m === mood ? 'gel-sun' : ''}`} onClick={() => setMood(m)}>{m}</button>)}
        <button type="button" className={`gel gel-sm ${talk ? 'gel-lime' : ''}`} onClick={() => setTalk((t) => !t)}>anchor talks</button>
      </div>
      <div className="flex gap-3">
        {SHEET_ROLES.map((r, i) => (
          <div key={r} className="flex flex-col items-center gap-1">
            <div
              className="avatar tv-anchor" data-mood={mood} data-talking={r === 'anchor' && talk ? 'true' : 'false'}
              style={{ width: 120, height: 150, position: 'relative', ['--tint' as string]: r === 'anchor' ? '#0fa0b4' : roleInfo(r as RoleId).color, ['--blink' as string]: `${-i * 1.1}s` }}
            >
              <div className="avatar-figure" dangerouslySetInnerHTML={{ __html: spriteSvg(r) }} />
            </div>
            <span className="text-[12px] font-black">{r}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

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
      <CharacterSheet />
    </main>
  );
}
