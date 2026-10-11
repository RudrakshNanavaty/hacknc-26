// Dev only (/fx-lab): every crisis animation on demand. The authored scenario only plays flood,
// development and storm, and erosion and budget only come from Gemini, so this is the way to see them all.
// It also plays the end-of-match storm both ways from a deterministic fixture (`?storm=win` or
// `?storm=loss`): a real round-3 resolution from the engine on a city whose flood safety is fixed at 62
// or 38, so the storm's verdict (rule S9) is the engine's own, with no rule or balance change.
import { useState } from 'react';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { CRISIS_KINDS, CRISIS_KIND_INFO, DISTRICTS, DISTRICT_IDS, TOTAL_ROUNDS, buildBoard, crisisFor, resolveRound, roleInfo, startCity, type CrisisKind, type RoleId, type RoomState } from '@shared';
import { StormFinale } from '../game/Climax';
import { CityMap } from '../map/CityMap';
import { CrisisFx, type CrisisStage } from '../map/CrisisFx';
import type { Intensity } from '../map/intensity';
import { spriteSvg, type SpriteRole } from '../map/sprites';

const CITY = startCity();

type StormCase = 'win' | 'loss';
/** The last round resolved by the engine on a city with fixed flood safety: just enough state for the storm scene. */
function stormFixture(c: StormCase): RoomState {
  const city = startCity();
  city.indicators = { ...city.indicators, flood: c === 'win' ? 62 : 38 };
  const board = buildBoard(TOTAL_ROUNDS, [], [], crisisFor(TOTAL_ROUNDS));
  const resolution = resolveRound(board, [], city);
  return { phase: 'resolve', round: TOTAL_ROUNDS, totalRounds: TOTAL_ROUNDS, history: [{ round: TOTAL_ROUNDS, event: null, headline: '', resolution, board, actions: [] }] } as unknown as RoomState;
}
const firstStorm = (): StormCase | null => {
  const v = new URLSearchParams(window.location.search).get('storm');
  return v === 'win' || v === 'loss' ? v : null;
};

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
  const [storm, setStorm] = useState<StormCase | null>(firstStorm);
  const flooding = storm === 'loss';
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
      <CrisisFx
        map={map} id={flooding ? 'lab-storm' : `lab-${run}`} kind={flooding ? 'flood' : kind} spotlight={flooding ? DISTRICT_IDS : spot}
        intensity={flooding ? 3 : intensity} stage={flooding ? 'alert' : stage}
      />
      {storm && <StormFinale key={`${storm}-${run}`} state={stormFixture(storm)} onSkip={() => setStorm(null)} />}
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
          <span className="lchip">Final storm</span>
          {(['win', 'loss'] as const).map((c) => <button key={c} type="button" className={`gel gel-sm ${storm === c ? 'gel-lime' : ''}`} onClick={() => { setStorm(c); setRun((n) => n + 1); }}>{c === 'win' ? 'city holds (62)' : 'city floods (38)'}</button>)}
          <span className="text-13">Click areas to toggle the spotlight: {spot.map((id) => DISTRICTS.find((d) => d.id === id)?.name).join(', ') || 'none'}</span>
        </div>
      </div>
      <CharacterSheet />
    </main>
  );
}
