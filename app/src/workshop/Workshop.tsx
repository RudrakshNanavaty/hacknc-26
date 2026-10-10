// The Underwater Workshop: build a settlement tile on a real reef, release glowing larvae, watch,
// change the design and try again. Used solo (/dive/:reef) and in rooms (building phase).
//
// Science boundary: the larvae run is the PROTOTYPE flow (shared/src/sim/prototype.ts). The HUD
// shows only what it measured (reach, contacts, time near the structure, time in slow water) and
// keeps settlement as "Scientific engine pending".
import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import {
  MATERIAL_BUDGET, PIECE_KINDS, REFERENCE_TILES, defaultParams, designOf, runPrototype,
  type Design, type Piece, type PieceKind, type PrototypeMetrics, type PrototypeRun, type Reef,
} from '@shared';
import { BuildPlane, CurrentArrow, Preview, Voxels } from './Build3D';
import { exportJson, exportStl, importJson, saveDesign, savedDesigns } from './files';
import { Icon, PIECE_ICON } from './Icons';
import { Larvae, type Playback } from './Larvae';
import { SceneBoundary } from '../ui/SceneBoundary';
import { Ocean, Platform } from './Ocean';
import { candidateOf, materialOfPieces, useBuild, type Tool } from './store';

const PIECE_NAME: Record<PieceKind, string> = { block: 'Block', ridge: 'Ridge', arch: 'Arch', tunnel: 'Tunnel' };
const PROBLEM: Record<string, string> = {
  outside: 'That would stick out past the tile.',
  overlap: 'Something is already there.',
  floating: 'Pieces need to rest on the tile or on another piece.',
  budget: 'Over the material budget.',
};

/** The camera sinks from the surface down to the tile, once. */
function DescendingCamera() {
  const { camera } = useThree();
  const t = useRef(window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 1 : 0);
  const from = useMemo(() => new THREE.Vector3(0, 17, 21), []);
  const to = useMemo(() => new THREE.Vector3(0, 6.2, 10.5), []);
  useFrame((_, dt) => {
    if (t.current >= 1) return;
    t.current = Math.min(1, t.current + dt / 2.6);
    const e = 1 - Math.pow(1 - t.current, 3);
    camera.position.lerpVectors(from, to, e);
    camera.lookAt(0, 0.6, 0);
  });
  return null;
}

export interface WorkshopProps {
  reef: Reef;
  /** Fixed seed (rooms: everyone gets the same larvae). Solo picks a new one per test. */
  seed?: number;
  /** Top-left slot: back button, room info, timer. */
  corner?: ReactNode;
  /** The main action (rooms: lock in). Solo has none: testing is the loop. */
  primary?: { label: string; onClick: (design: Design) => void; disabled?: boolean };
  /** Solo: each test is also stored by the server. */
  onTest?: (design: Design, run: PrototypeRun) => void;
  /** Read-only: nothing can be built (a locked-in design). Larvae can still be released. */
  readOnly?: boolean;
  /** Show these pieces instead of the player's own build (watching another design; read-only). */
  viewPieces?: Piece[];
}

interface TestRecord {
  n: number;
  material: number;
  metrics: PrototypeMetrics;
}

export function Workshop({ reef, seed, corner, primary, onTest, readOnly: locked = false, viewPieces }: WorkshopProps) {
  const ownPieces = useBuild((s) => s.pieces);
  const pieces = viewPieces ?? ownPieces;
  const readOnly = locked || !!viewPieces;
  const piecesRef = useRef(pieces);
  piecesRef.current = pieces;
  const tool = useBuild((s) => s.tool);
  const rot = useBuild((s) => s.rot);
  const fine = useBuild((s) => s.fine);
  const selected = useBuild((s) => s.selected);
  const moving = useBuild((s) => s.moving);
  const canUndo = useBuild((s) => s.past.length > 0);
  const canRedo = useBuild((s) => s.future.length > 0);
  const problem = useBuild((s) => candidateOf(s)?.problem ?? null);
  const material = useMemo(() => materialOfPieces(pieces), [pieces]);

  const [run, setRun] = useState<PrototypeRun | null>(null);
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [tests, setTests] = useState<TestRecord[]>([]);
  const [menu, setMenu] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const playback = useRef<Playback>({ frame: 0, playing: false, speed: 1 });
  const file = useRef<HTMLInputElement>(null);
  const building = !run && !readOnly;

  const say = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast((t) => (t === msg ? null : t)), 2600);
  }, []);

  const test = useCallback(() => {
    if (!reef.flow) return say('This reef’s water is not derived yet.');
    const design = designOf(piecesRef.current);
    const s = seed ?? Math.floor(Math.random() * 2 ** 31);
    const r = runPrototype(design, defaultParams(reef.flow, s));
    playback.current = { frame: 0, playing: true, speed: playback.current.speed };
    setRun(r);
    setFrame(0);
    setPlaying(true);
    setTests((t) => [{ n: (t[0]?.n ?? 0) + 1, material: design.solid.length, metrics: r.metrics }, ...t].slice(0, 6));
    onTest?.(design, r);
  }, [reef.flow, seed, onTest, say]);

  const backToBuilding = () => {
    setRun(null);
    setPlaying(false);
  };

  // Keyboard: 1-4 pieces, V select, R rotate, F fine snap, Del delete, M move, Ctrl/Cmd+Z undo,
  // Shift+Ctrl/Cmd+Z or Ctrl+Y redo, Space test or pause, Esc cancel.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input, textarea, select')) return;
      const s = useBuild.getState();
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (!building) return;
        if (e.shiftKey) s.redo();
        else s.undo();
        return;
      }
      if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        if (building) s.redo();
        return;
      }
      if (mod) return;
      if (e.key === ' ') {
        e.preventDefault();
        if (run) {
          const pb = playback.current;
          if (pb.frame >= run.frameCount - 1) pb.frame = 0;
          pb.playing = !pb.playing;
          setPlaying(pb.playing);
        } else test();
        return;
      }
      if (!building) {
        if (e.key === 'Escape' && run) backToBuilding();
        return;
      }
      const k = e.key.toLowerCase();
      const idx = ['1', '2', '3', '4'].indexOf(k);
      if (idx >= 0) s.setTool(PIECE_KINDS[idx]!);
      else if (k === 'v') s.setTool('select');
      else if (k === 'r') s.rotate();
      else if (k === 'f') s.toggleFine();
      else if (k === 'm') s.startMove();
      else if (k === 'delete' || k === 'backspace') s.removeSelected();
      else if (k === 'escape') s.cancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [building, run, readOnly, test]);

  const t = run ? frame * run.frameDt : 0;
  const direction = reef.flow?.kind === 'oscillating' && reef.flow.periodS ? Math.sin((2 * Math.PI * t) / reef.flow.periodS) : 1;
  const loadPieces = (p: Piece[], label: string) => {
    useBuild.getState().load(p);
    backToBuilding();
    setMenu(false);
    say(`${label} loaded`);
  };

  return (
    <div className="fixed inset-0 overflow-hidden bg-abyss select-none">
      <SceneBoundary>
      <Canvas shadows camera={{ position: [0, 17, 21], fov: 45, near: 0.1, far: 200 }} dpr={[1, 2]} gl={{ antialias: true }}>
        <Suspense fallback={null}>
          <Ocean />
          <Platform />
          <Voxels pieces={pieces} selected={selected} interactive={building} />
          {building && <BuildPlane />}
          {building && <Preview />}
          {run && <Larvae run={run} playback={playback} onFrame={(f) => {
            setFrame(f);
            if (!playback.current.playing) setPlaying(false);
          }} />}
          {run && <CurrentArrow direction={direction} />}
          <DescendingCamera />
          <OrbitControls makeDefault target={[0, 0.6, 0]} minDistance={3.5} maxDistance={26} maxPolarAngle={Math.PI * 0.47} enableDamping dampingFactor={0.08} />
        </Suspense>
      </Canvas>
      </SceneBoundary>

      {/* Top bar */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-wrap items-start justify-between gap-2 p-2 sm:p-4">
        <div className="pointer-events-auto flex flex-wrap items-center gap-2">{corner}</div>
        <div className="glass-deep pointer-events-auto px-4 py-2 text-center">
          <p className="font-display text-18 leading-tight font-black">{reef.name}</p>
          <p className="text-13 text-white/85">
            {reef.flow ? `Water: ${reef.flow.kind === 'oscillating' ? 'back and forth' : 'steady'}, ${reef.flow.peakCmS} cm/s` : 'Water not derived yet'}
            {' · '}tile 48 × 24 mm, shown ×200
          </p>
        </div>
        <div className="glass-deep pointer-events-auto w-56 px-4 py-2">
          <div className="flex justify-between text-13 font-bold"><span>Material</span><span className="tabular">{material.toLocaleString()} / {MATERIAL_BUDGET.toLocaleString()}</span></div>
          <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-white/20">
            <div className="h-full rounded-full transition-[width]" style={{ width: `${Math.min(100, (material / MATERIAL_BUDGET) * 100)}%`, background: material > MATERIAL_BUDGET * 0.9 ? 'linear-gradient(90deg,#ffb36b,#ff6b5a)' : 'linear-gradient(90deg,#9be85a,#36c1ef)' }} />
          </div>
          <p className="mt-1 text-[11px] text-white/75">{pieces.length} piece{pieces.length === 1 ? '' : 's'} · 1 voxel = 0.5 mm</p>
        </div>
      </div>

      {/* Tools: a column on wide screens, a scrolling row on phones */}
      {building && (
        <div className="glass-deep absolute bottom-24 left-2 flex max-w-[calc(100%-1rem)] gap-1.5 overflow-x-auto p-2 sm:top-1/2 sm:bottom-auto sm:left-4 sm:-translate-y-1/2 sm:flex-col sm:overflow-visible" role="toolbar" aria-label="Building tools">
          {toolButton('select', 'Select (V)', Icon.select)}
          {PIECE_KINDS.map((k, i) => toolButton(k, `${PIECE_NAME[k]} (${i + 1})`, PIECE_ICON[k]))}
          <span className="mx-1 my-0.5 w-px shrink-0 bg-white/30 sm:mx-0.5 sm:h-px sm:w-auto" />
          <HudButton label={`Rotate (R) · ${rot * 90}°`} onClick={() => useBuild.getState().rotate()}>{Icon.rotate}</HudButton>
          <HudButton label={fine ? 'Fine snap on (F): 0.5 mm' : 'Coarse snap (F): 2.5 mm'} pressed={fine} onClick={() => useBuild.getState().toggleFine()}>{Icon.grid}</HudButton>
          <HudButton label="Undo (Ctrl/Cmd+Z)" disabled={!canUndo} onClick={() => useBuild.getState().undo()}>{Icon.undo}</HudButton>
          <HudButton label="Redo (Shift+Ctrl/Cmd+Z)" disabled={!canRedo} onClick={() => useBuild.getState().redo()}>{Icon.redo}</HudButton>
          {selected && (
            <>
              <HudButton label="Move (M)" pressed={moving} onClick={() => useBuild.getState().startMove()}>{Icon.move}</HudButton>
              <HudButton label="Delete (Del)" onClick={() => useBuild.getState().removeSelected()}>{Icon.trash}</HudButton>
            </>
          )}
        </div>
      )}

      {/* Design menu */}
      <div className="absolute top-24 right-2 flex flex-col items-end gap-2 sm:right-4">
        <button className="btn" aria-expanded={menu} onClick={() => setMenu((m) => !m)}>{Icon.save}<span>Designs</span></button>
        {menu && (
          <div className="glass-deep w-64 max-w-[calc(100vw-1rem)] p-3 text-15">
            <p className="font-display font-black">Start from</p>
            <ul className="mt-1 space-y-1">
              <li><button className="text-left underline decoration-aqua/60" disabled={readOnly} onClick={() => loadPieces([], 'Empty tile')}>Empty tile</button></li>
              {REFERENCE_TILES.filter((r) => r.id !== 'flat').map((r) => (
                <li key={r.id}>
                  <button className="text-left underline decoration-aqua/60" disabled={readOnly} onClick={() => loadPieces(r.design.pieces ?? [], r.name)}>{r.name}</button>
                  <span className={`chip ml-1 ${r.kind === 'published' ? 'chip-published' : 'chip-game'}`}>{r.kind === 'published' ? 'Published' : 'Game-made'}</span>
                </li>
              ))}
            </ul>
            {savedDesigns().length > 0 && (
              <>
                <p className="mt-2 font-display font-black">Saved here</p>
                <ul className="mt-1 max-h-32 space-y-1 overflow-y-auto">
                  {savedDesigns().map((s) => (
                    <li key={s.name}><button className="text-left underline decoration-aqua/60" disabled={readOnly} onClick={() => loadPieces(s.pieces, s.name)}>{s.name}</button></li>
                  ))}
                </ul>
              </>
            )}
            <div className="mt-3 flex flex-wrap gap-1.5">
              <button className="btn" disabled={readOnly || !pieces.length} onClick={() => {
                const name = `Design ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
                say(saveDesign(name, pieces) ? `Saved as “${name}”` : 'Could not save in this browser');
              }}>Save</button>
              <button className="btn" onClick={() => exportJson(pieces)}>JSON</button>
              <button className="btn" disabled={!pieces.length} onClick={() => exportStl(designOf(pieces))}>STL</button>
              <button className="btn" disabled={readOnly} onClick={() => file.current?.click()}>Import</button>
              <input ref={file} type="file" accept="application/json,.json" className="hidden" onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (!f) return;
                const res = await importJson(f);
                if ('error' in res) say(res.error);
                else loadPieces(res.pieces, f.name);
              }} />
            </div>
          </div>
        )}
      </div>

      {/* Results of the latest run */}
      {run && <RunPanel run={run} tests={tests} material={designOf(pieces).solid.length} />}

      {/* Hint / toast */}
      {(toast || (building && problem)) && (
        <p className="glass-deep pointer-events-none absolute bottom-40 left-1/2 -translate-x-1/2 px-4 py-2 text-15 font-bold sm:bottom-28" role="status">
          {toast ?? PROBLEM[problem!]}
        </p>
      )}
      {building && !pieces.length && !toast && !problem && (
        <p className="glass-deep pointer-events-none absolute top-36 left-1/2 hidden -translate-x-1/2 px-4 py-2 text-center text-15 sm:block">
          Pick a piece, then click the tile to place it. Drag to look around, scroll to zoom.
        </p>
      )}

      {/* Bottom: release, or the replay bar */}
      <div className="absolute inset-x-0 bottom-0 flex flex-wrap items-center justify-center gap-2 p-3 sm:p-4">
        {!run ? (
          <>
            <button className="btn btn-primary btn-lg" onClick={test}>Release larvae</button>
            {primary && <button className="btn btn-lg" disabled={primary.disabled} onClick={() => primary.onClick(designOf(useBuild.getState().pieces))}>{primary.label}</button>}
          </>
        ) : (
          <div className="glass-deep flex w-full max-w-2xl flex-wrap items-center gap-3 px-3 py-2">
            <button className="btn btn-icon" aria-label={playing ? 'Pause' : 'Play'} onClick={() => {
              const pb = playback.current;
              if (pb.frame >= run.frameCount - 1) pb.frame = 0;
              pb.playing = !pb.playing;
              setPlaying(pb.playing);
            }}>{playing ? Icon.pause : Icon.play}</button>
            <input
              type="range"
              className="range min-w-24 flex-1"
              min={0}
              max={run.frameCount - 1}
              step={0.01}
              value={frame}
              aria-label="Replay time"
              onChange={(e) => {
                playback.current.frame = Number(e.target.value);
                setFrame(Number(e.target.value));
              }}
            />
            <span className="tabular w-14 text-13">{t.toFixed(1)} s</span>
            <select className="field min-h-9 px-2 text-13" aria-label="Replay speed" defaultValue="1" onChange={(e) => (playback.current.speed = Number(e.target.value))}>
              <option value="0.5">0.5×</option>
              <option value="1">1×</option>
              <option value="2">2×</option>
            </select>
            <button className="btn" onClick={backToBuilding}>{readOnly ? 'Stop replay' : 'Keep building'}</button>
            {primary && <button className="btn" disabled={primary.disabled} onClick={() => primary.onClick(designOf(useBuild.getState().pieces))}>{primary.label}</button>}
          </div>
        )}
      </div>
      <div aria-hidden className="pointer-events-none absolute inset-0 shadow-[inset_0_0_120px_rgba(0,30,60,0.55)]" />
    </div>
  );

  function toolButton(t: Tool, label: string, icon: ReactNode) {
    return <HudButton key={t} label={label} pressed={tool === t} onClick={() => useBuild.getState().setTool(t)}>{icon}</HudButton>;
  }
}

function HudButton({ label, onClick, pressed, disabled, children }: { label: string; onClick: () => void; pressed?: boolean; disabled?: boolean; children: ReactNode }) {
  return (
    <button className="btn btn-icon shrink-0" title={label} aria-label={label} aria-pressed={pressed} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  );
}

/** What the run measured, plus the last few tests for comparison. */
function RunPanel({ run, tests, material }: { run: PrototypeRun; tests: TestRecord[]; material: number }) {
  const m = run.metrics;
  const pct = (v: number) => `${Math.round((v / m.released) * 100)}%`;
  return (
    <section className="glass-deep absolute top-40 right-2 w-72 max-w-[calc(100vw-1rem)] p-4 text-15 sm:top-24 sm:right-4" aria-label="Test results">
      <h2 className="font-display text-24 font-black">Test results</h2>
      <p className="text-13 text-white/80">Prototype flow · seed {run.params.seed} · {m.durationS} s</p>
      <dl className="mt-2 grid grid-cols-[1fr_auto] gap-x-3 gap-y-1">
        <dt>Larvae released</dt><dd className="tabular font-bold">{m.released}</dd>
        <dt>Reached your structure</dt><dd className="tabular font-bold">{m.reachedStructure} ({pct(m.reachedStructure)})</dd>
        <dt>Touches</dt><dd className="tabular font-bold">{m.structureContacts}</dd>
        <dt>Time near structure</dt><dd className="tabular font-bold">{m.meanNearStructureS.toFixed(2)} s</dd>
        <dt>Time in slow water</dt><dd className="tabular font-bold">{m.meanShelteredS.toFixed(2)} s</dd>
        <dt>Material</dt><dd className="tabular font-bold">{material.toLocaleString()}</dd>
        <dt>Settlement</dt><dd className="font-bold text-coral">Scientific engine pending</dd>
      </dl>
      {tests.length > 1 && (
        <>
          <p className="mt-3 font-display font-black">Your tests</p>
          <table className="mt-1 w-full text-13">
            <thead><tr className="text-left text-white/80"><th>#</th><th>Reached</th><th>Touches</th><th>Material</th></tr></thead>
            <tbody>
              {tests.map((t) => (
                <tr key={t.n}><td>{t.n}</td><td className="tabular">{t.metrics.reachedStructure}</td><td className="tabular">{t.metrics.structureContacts}</td><td className="tabular">{t.material}</td></tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      <p className="mt-3 text-[12px] leading-snug text-white/80">
        Simplified flow for play: water slows near surfaces, larvae swim and drift, no wakes or eddies. Not a settlement prediction.
      </p>
    </section>
  );
}

