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
  MATERIAL_BUDGET, PIECE_KINDS, defaultParams, designOf, runPrototype,
  type Design, type Piece, type PieceKind, type PrototypeRun, type Reef,
} from '@shared';
import { BuildPlane, CurrentArrow, Preview, Voxels } from './Build3D';
import { Icon, PIECE_ICON } from './Icons';
import { Larvae, type Playback } from './Larvae';
import { SceneBoundary } from '../ui/SceneBoundary';
import { Ocean, Platform } from './Ocean';
import { Materialize } from '../ui/Materialize';
import { DesignsMenu } from './DesignsMenu';
import { ResultsDock, type TestRecord } from './ResultsDock';
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

  // A toast or the reason a piece cannot go there. The last text stays while the pill fades out.
  const message = toast ?? (building && problem ? PROBLEM[problem] : null) ?? null;
  const lastMessage = useRef('');
  if (message) lastMessage.current = message;

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

      {/* Top: corner slot, where we are, material and designs. Wraps to two rows on phones. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-wrap items-start justify-between gap-2 p-2 sm:p-4">
        <div className="pointer-events-auto order-1 flex flex-wrap items-center gap-2">{corner}</div>
        <div className="glass-deep pointer-events-auto order-3 basis-full px-4 py-2 text-center sm:order-2 sm:basis-auto">
          <p className="font-display text-18 leading-tight font-semibold">{reef.name}</p>
          <p className="text-13 text-white/85">
            {reef.flow ? `${reef.flow.kind === 'oscillating' ? 'Back and forth' : 'Steady'}, ${reef.flow.peakCmS} cm/s.` : 'Water not derived yet.'} Tile 48 × 24 mm, shown ×200.
          </p>
        </div>
        <div className="pointer-events-auto relative order-2 w-60 max-w-[calc(100vw-1rem)] sm:order-3">
          <div className="glass-deep p-3">
            <div className="flex justify-between text-13 font-semibold"><span>Material</span><span className="tabular">{material.toLocaleString()} / {MATERIAL_BUDGET.toLocaleString()}</span></div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/20">
              <div className="h-full rounded-full transition-[width]" style={{ width: `${Math.min(100, (material / MATERIAL_BUDGET) * 100)}%`, background: material > MATERIAL_BUDGET * 0.9 ? 'linear-gradient(90deg,#ffb36b,#ff6b5a)' : 'linear-gradient(90deg,#9be85a,#36c1ef)' }} />
            </div>
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="text-13 text-white/80">{pieces.length} piece{pieces.length === 1 ? '' : 's'}, 0.5 mm voxels</span>
              <button className="btn min-h-10 px-3" aria-expanded={menu} aria-haspopup="dialog" onClick={() => setMenu((m) => !m)}>{Icon.save}<span>Designs</span></button>
            </div>
          </div>
          <DesignsMenu open={menu} pieces={pieces} readOnly={readOnly} onLoad={loadPieces} say={say} />
        </div>
      </div>

      {/* Bottom: a message, the tools, then release or the results dock, in one stack. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center gap-2 p-2 sm:p-4 [&>*]:pointer-events-auto">
        <Materialize show={message !== null} id="message" origin="bottom center" role="status" className="glass-deep glass-flat px-4 py-2 text-15 font-semibold">
          {message ?? lastMessage.current}
        </Materialize>
        {building && !pieces.length && !toast && !problem && (
          <p className="glass-deep glass-flat px-4 py-2 text-center text-15">
            <span className="sm:hidden">Pick a piece, then tap the tile to place it.</span>
            <span className="hidden sm:inline">Pick a piece, then click the tile to place it. Drag to look around, scroll to zoom.</span>
          </p>
        )}

        {building && (
          <>
            <p className="glass-deep glass-flat px-3 py-1 text-13 font-semibold" aria-live="polite">
              {tool === 'select' ? 'Select' : `${PIECE_NAME[tool]}, rotated ${rot * 90}°`}, {fine ? 'fine snap 0.5 mm' : 'coarse snap 2.5 mm'}
            </p>
            {/* Tools: a scrolling row on phones, a column at the left edge on wide screens */}
            <div className="glass-deep flex max-w-full gap-1.5 overflow-x-auto p-1.5 [scrollbar-width:none] sm:fixed sm:top-1/2 sm:left-4 sm:-translate-y-1/2 sm:flex-col sm:overflow-visible" role="toolbar" aria-label="Building tools">
              {toolButton('select', 'Select (V)', Icon.select)}
              {PIECE_KINDS.map((k, i) => toolButton(k, `${PIECE_NAME[k]} (${i + 1})`, PIECE_ICON[k]))}
              <span className="mx-1 my-0.5 w-px shrink-0 bg-white/30 sm:mx-0.5 sm:h-px sm:w-auto" />
              <HudButton label={`Rotate (R), now ${rot * 90}°`} onClick={() => useBuild.getState().rotate()}>{Icon.rotate}</HudButton>
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
          </>
        )}

        {!run ? (
          <div className="glass-deep flex items-center gap-1.5 rounded-full p-1.5">
            <button className="btn btn-primary btn-lg" onClick={test}>Release larvae</button>
            {primary && <button className="btn btn-lg" disabled={primary.disabled} onClick={() => primary.onClick(designOf(useBuild.getState().pieces))}>{primary.label}</button>}
          </div>
        ) : (
          <ResultsDock run={run} tests={tests} material={designOf(pieces).solid.length}>
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
            <span className="tabular w-12 text-13">{t.toFixed(1)} s</span>
            <select className="field min-h-10 px-2 text-13" aria-label="Replay speed" defaultValue="1" onChange={(e) => (playback.current.speed = Number(e.target.value))}>
              <option value="0.5">0.5×</option>
              <option value="1">1×</option>
              <option value="2">2×</option>
            </select>
            <button className="btn" onClick={backToBuilding}>{readOnly ? 'Stop replay' : 'Keep building'}</button>
            {primary && <button className="btn" disabled={primary.disabled} onClick={() => primary.onClick(designOf(useBuild.getState().pieces))}>{primary.label}</button>}
          </ResultsDock>
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
