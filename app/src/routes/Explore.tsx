// Explore a real reef: descend onto the measured seabed, swim, choose a deployment site, place a
// device, open it in the microscope (the voxel workshop), and come back to see it in the world.
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { create } from 'zustand';
import { reefById, type ReefId } from '@shared';
import { Link, navigate } from '../router';
import { Bubbles } from '../ui/Bubbles';
import { SceneBoundary } from '../ui/SceneBoundary';
import { ProvenanceTag } from '../ui/ReefCard';
import { Icon } from '../workshop/Icons';
import { useBuild } from '../workshop/store';
import { Workshop } from '../workshop/Workshop';
import { disposeAmbient, startAmbient, stopAmbient } from '../world/ambient';
import { Devices3D, DeployCursor } from '../world/Devices3D';
import { checkPlacement, useDevices, type PlacementCheck } from '../world/devices';
import { Fish } from '../world/Fish';
import { Life } from '../world/Life';
import { Swim, flyTo, useSwimControls, type SwimControls } from '../world/Swim';
import { loadTerrain, type Terrain } from '../world/terrain';
import { TerrainMesh } from '../world/TerrainMesh';
import { WaterFx } from '../world/WaterFx';
import { WORLDS, type WorldStyle } from '../world/worlds';

/** Deploy-mode cursor, outside React state so pointer moves do not re-render the page. */
const useCursor = create<{ at: THREE.Vector3 | null; check: PlacementCheck | null; set: (at: THREE.Vector3 | null, check: PlacementCheck | null) => void }>((set) => ({
  at: null,
  check: null,
  set: (at, check) => set({ at, check }),
}));

/** Live position readout (camera depth, seabed below, projected coordinates), ~5 Hz. */
const useReadout = create<{ depth: number; seabed: number; easting: number; northing: number }>(() => ({ depth: 0, seabed: 0, easting: 0, northing: 0 }));

const ONBOARDED = 'reefforge.onboarded.explore';
const mobile = () => window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 700;

function Readout({ terrain, surface }: { terrain: Terrain; surface: number }) {
  const { camera } = useThree();
  const last = useRef(0);
  useFrame(({ clock }) => {
    if (clock.elapsedTime - last.current < 0.2) return;
    last.current = clock.elapsedTime;
    const [e, n] = terrain.toProjected(camera.position.x, camera.position.z);
    useReadout.setState({ depth: surface - camera.position.y, seabed: terrain.heightAt(camera.position.x, camera.position.z), easting: e, northing: n });
  });
  return null;
}

/** Arrival: sink from just under the surface to the start point. */
function Arrival({ controls, start, terrain, clearance, surface, onStart }: { controls: React.MutableRefObject<SwimControls>; start: [number, number, number]; terrain: Terrain; clearance: number; surface: number; onStart: () => void }) {
  const { camera } = useThree();
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    onStart();
    const [x, , z] = start;
    const ground = terrain.heightAt(x, z);
    const target = new THREE.Vector3(x, Math.max(ground + clearance * 4, Math.min(start[1], surface - 1)), z);
    camera.position.set(x, surface - 0.2, z + Math.max(2, terrain.sizeZ * 0.03));
    const look = new THREE.Vector3(x, ground, z - Math.max(4, terrain.sizeZ * 0.05));
    flyTo(controls.current, camera, target, look, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0.01 : 3.2);
  }, [camera, controls, start, terrain, clearance, surface, onStart]);
  return null;
}

/** Hands the camera to the page, and on a return from the microscope puts it back where it was. */
function CameraGrab({ cameraRef, restore }: { cameraRef: React.MutableRefObject<THREE.Camera | null>; restore: () => void }) {
  const { camera } = useThree();
  useEffect(() => {
    cameraRef.current = camera;
    restore();
    // Once per mount of the scene.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera]);
  return null;
}

function World({ reef: _reef, style, terrain, controls, mode, yaw, onPlace, onSelect, beaconScale }: {
  reef: ReefId;
  style: WorldStyle;
  terrain: Terrain;
  controls: React.MutableRefObject<SwimControls>;
  mode: 'swim' | 'deploy';
  yaw: number;
  onPlace: (p: THREE.Vector3) => void;
  onSelect: (id: string) => void;
  beaconScale: number;
}) {
  const devices = useDevices((s) => s.devices);
  const selected = useDevices((s) => s.selected);
  const cursor = useCursor();
  const texture = terrain.meta.texture ? `/terrain/${style.site}/${terrain.meta.texture.file}` : null;
  const fadeBelow = style.site === 'heron-island' ? -14 : undefined;
  return (
    <>
      <color attach="background" args={[style.water]} />
      <fogExp2 attach="fog" args={[style.fog, style.fogDensity]} />
      <hemisphereLight args={['#d6f6ff', '#2a5a6a', 1.25]} />
      <directionalLight position={[20, 60, 30]} intensity={1.6} color="#fff6e0" />
      <TerrainMesh
        terrain={terrain}
        textureUrl={texture}
        causticScale={style.causticScale}
        surface={style.surface}
        fadeBelow={fadeBelow}
        onPointer={(p) => {
          if (mode !== 'deploy' || !p) return useCursor.getState().set(null, null);
          useCursor.getState().set(p, checkPlacement(terrain, p.x, p.z, useDevices.getState().devices));
        }}
        onClick={(p, delta) => mode === 'deploy' && delta < 6 && onPlace(p)}
      />
      <Life terrain={terrain} style={style} />
      <Fish terrain={terrain} schools={style.fish.schools} scale={style.fish.scale} maxDistance={style.site === 'heron-island' ? 90 : 30} />
      <WaterFx surface={style.surface} scale={style.site === 'heron-island' ? 4 : 1} />
      <Devices3D devices={devices} selected={selected} beaconScale={beaconScale} onSelect={onSelect} />
      {mode === 'deploy' && <DeployCursor at={cursor.at} yaw={yaw} check={cursor.check} beaconScale={beaconScale} />}
      <Swim terrain={terrain} controls={controls} speed={style.swimSpeed} clearance={style.clearance} surface={style.surface} />
      <Readout terrain={terrain} surface={style.surface} />
    </>
  );
}

/** Touch joystick (left) and up/down buttons; feeds the swim controls. */
function TouchControls({ controls }: { controls: React.MutableRefObject<SwimControls> }) {
  const base = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const move = (e: React.PointerEvent) => {
    const r = base.current!.getBoundingClientRect();
    const dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
    const dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
    const len = Math.min(1, Math.hypot(dx, dy));
    const a = Math.atan2(dy, dx);
    const x = Math.cos(a) * len, y = Math.sin(a) * len;
    setKnob({ x, y });
    controls.current.stick = { x, y: -y };
  };
  const end = () => {
    setKnob({ x: 0, y: 0 });
    controls.current.stick = { x: 0, y: 0 };
  };
  const lift = (v: number) => () => void (controls.current.lift = v);
  return (
    <>
      <div ref={base} className="glass-sea absolute bottom-24 left-4 h-28 w-28 touch-none rounded-full" onPointerDown={(e) => (e.currentTarget.setPointerCapture(e.pointerId), move(e))} onPointerMove={(e) => e.buttons && move(e)} onPointerUp={end} onPointerCancel={end} aria-label="Swim joystick">
        <span className="orb absolute h-11 w-11" style={{ left: `calc(50% - 22px + ${knob.x * 34}px)`, top: `calc(50% - 22px + ${knob.y * 34}px)` }} />
      </div>
      <div className="absolute bottom-24 left-36 flex flex-col gap-2">
        <button className="aero-btn aero-btn-icon touch-none" aria-label="Rise" onPointerDown={lift(1)} onPointerUp={lift(0)} onPointerLeave={lift(0)}>▲</button>
        <button className="aero-btn aero-btn-icon touch-none" aria-label="Sink" onPointerDown={lift(-1)} onPointerUp={lift(0)} onPointerLeave={lift(0)}>▼</button>
      </div>
    </>
  );
}

export function Explore({ reef: id }: { reef: ReefId }) {
  const reef = reefById(id);
  const style = WORLDS[id];
  const [terrain, setTerrain] = useState<Terrain | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<'world' | 'zooming' | 'microscope'>('world');
  const [mode, setMode] = useState<'swim' | 'deploy'>('swim');
  const [yaw, setYaw] = useState(0);
  const [panel, setPanel] = useState<'real' | 'help' | null>(() => {
    try {
      return localStorage.getItem(ONBOARDED) ? null : 'help';
    } catch {
      return 'help';
    }
  });
  const [sound, setSound] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const controls = useSwimControls();
  const cameraPose = useRef<{ p: THREE.Vector3; yaw: number; pitch: number } | null>(null);
  /** The arrival descent plays once per visit, not after every return from the microscope. */
  const arrived = useRef(false);
  const cameraRef = useRef<THREE.Camera | null>(null);
  const devices = useDevices((s) => s.devices);
  const selected = useDevices((s) => s.selected);
  const check = useCursor((s) => s.check);
  const readout = useReadout();
  const touch = useMemo(mobile, []);
  const beaconScale = id === 'heron-island' ? 6 : 1;

  useEffect(() => {
    useDevices.getState().open(id);
    if (!style) return;
    let live = true;
    loadTerrain(style.site, (fine) => live && setTerrain(fine), touch ? 513 : 1025)
      .then((t) => live && setTerrain(t))
      .catch((e) => live && setError(String(e)));
    return () => {
      live = false;
      useCursor.getState().set(null, null);
    };
  }, [id, style, touch]);

  useEffect(() => () => disposeAmbient(), []);
  const say = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast((t) => (t === msg ? null : t)), 2800);
  };

  // Keys: F deploy, R rotate the device to place, Esc back to swimming.
  useEffect(() => {
    if (phase !== 'world') return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input, textarea, select')) return;
      const k = e.key.toLowerCase();
      if (k === 'f') setMode((m) => (m === 'deploy' ? 'swim' : 'deploy'));
      else if (k === 'r' && mode === 'deploy') setYaw((y) => y + Math.PI / 2);
      else if (k === 'escape') {
        setMode('swim');
        useDevices.getState().select(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, mode]);

  const place = useCallback(
    (p: THREE.Vector3) => {
      if (!terrain) return;
      const c = checkPlacement(terrain, p.x, p.z, useDevices.getState().devices);
      if (!c.ok) return say(c.reasons[0] ?? 'Cannot place here');
      const [easting, northing] = terrain.toProjected(p.x, p.z);
      const d = useDevices.getState().add({ reef: id, x: p.x, y: terrain.heightAt(p.x, p.z), z: p.z, easting, northing, crs: terrain.meta.crs, yaw, slopeDeg: c.slopeDeg, pieces: [] });
      setMode('swim');
      say(`${d.name} placed at ${terrain.meta.crs} ${easting.toFixed(2)} E, ${northing.toFixed(2)} N`);
      approach(d.id);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [terrain, id, yaw],
  );

  /** Swim up close to a device. */
  function approach(deviceId: string) {
    const d = useDevices.getState().devices.find((x) => x.id === deviceId);
    const camera = cameraRef.current;
    if (!d || !camera) return;
    const dist = 0.16;
    const to = new THREE.Vector3(d.x + Math.sin(d.yaw + 0.6) * dist, d.y + 0.09, d.z + Math.cos(d.yaw + 0.6) * dist);
    flyTo(controls.current, camera, to, new THREE.Vector3(d.x, d.y + 0.004, d.z), 1.8);
  }

  /** Back from the microscope: the camera returns to where it was, beside the device. */
  const restorePose = () => {
    const camera = cameraRef.current;
    if (!camera || !cameraPose.current) return;
    camera.position.copy(cameraPose.current.p);
    controls.current.yaw = cameraPose.current.yaw;
    controls.current.pitch = cameraPose.current.pitch;
    cameraPose.current = null;
  };

  const openMicroscope = (deviceId: string) => {
    const d = useDevices.getState().devices.find((x) => x.id === deviceId);
    const cam = cameraRef.current;
    if (!d) return;
    if (cam) cameraPose.current = { p: cam.position.clone(), yaw: controls.current.yaw, pitch: controls.current.pitch };
    useBuild.getState().load(d.pieces);
    setPhase('zooming');
    setTimeout(() => setPhase('microscope'), window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 1100);
  };
  const closeMicroscope = () => {
    const d = selected ? useDevices.getState().devices.find((x) => x.id === selected) : null;
    if (d) useDevices.getState().update(d.id, { pieces: useBuild.getState().pieces });
    setPhase('world');
  };

  if (!style || !reef.world) {
    return (
      <main className="flex h-full items-center justify-center p-6">
        <p className="glass p-6 text-18">{reef.name} has no explorable world yet. <Link to="/" className="font-bold underline">Back to the ocean</Link></p>
      </main>
    );
  }

  if (phase === 'microscope') {
    const d = devices.find((x) => x.id === selected);
    return (
      <Workshop
        reef={reef}
        corner={
          <>
            <button className="aero-btn aero-btn-aqua" onClick={closeMicroscope}>{Icon.back}<span>Back to the reef</span></button>
            <span className="glass-sea px-3 py-2 text-13">{d?.name} · {terrain?.meta.crs} {d?.easting.toFixed(2)} E, {d?.northing.toFixed(2)} N · seabed {d?.y.toFixed(2)} m</span>
          </>
        }
      />
    );
  }

  const sel = devices.find((d) => d.id === selected) ?? null;
  return (
    <div className="fixed inset-0 overflow-hidden bg-abyss select-none">
      {terrain && (
        <SceneBoundary>
          <Canvas camera={{ fov: 60, near: 0.005, far: 4000 }} dpr={[1, touch ? 1.25 : 1.75]} gl={{ antialias: true, logarithmicDepthBuffer: true }}
            onPointerMissed={() => mode === 'swim' && useDevices.getState().select(null)}>
            <Suspense fallback={null}>
              <World reef={id} style={style} terrain={terrain} controls={controls} mode={mode} yaw={yaw} onPlace={place} beaconScale={beaconScale}
                onSelect={(deviceId) => useDevices.getState().select(deviceId)} />
              {!arrived.current && <Arrival controls={controls} start={style.start} terrain={terrain} clearance={style.clearance} surface={style.surface} onStart={() => (arrived.current = true)} />}
              <CameraGrab cameraRef={cameraRef} restore={restorePose} />
            </Suspense>
          </Canvas>
        </SceneBoundary>
      )}

      {!terrain && (
        <div className="dive-veil absolute inset-0 flex flex-col items-center justify-center gap-3">
          <Bubbles count={36} seed={8} />
          <p className="font-display text-32 font-black text-white drop-shadow">{error ? 'The reef did not load' : `Descending to ${reef.name}…`}</p>
          <p className="text-15 text-white/85">{error ?? 'Loading the measured seabed'}</p>
          {error && <Link to="/" className="aero-btn">Back to the ocean</Link>}
        </div>
      )}

      {/* Top bar */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-wrap items-start justify-between gap-2 p-2 sm:p-4">
        <div className="pointer-events-auto flex flex-wrap items-center gap-2">
          <button className="aero-btn" onClick={() => navigate('/')}>{Icon.back}<span>Surface</span></button>
          <div className="glass-sea px-4 py-2">
            <p className="font-display text-18 leading-tight font-black">{reef.name}</p>
            <p className="tabular text-[12px] text-white/85">
              depth {Math.max(0, readout.depth).toFixed(1)} m · seabed {readout.seabed.toFixed(2)} m · {readout.easting.toFixed(1)} E {readout.northing.toFixed(1)} N
            </p>
          </div>
        </div>
        <div className="pointer-events-auto flex flex-wrap gap-2">
          <button className="aero-btn" aria-pressed={panel === 'real'} onClick={() => setPanel((p) => (p === 'real' ? null : 'real'))}>What’s real here</button>
          <button className="aero-btn" aria-pressed={sound} onClick={() => {
            if (sound) stopAmbient();
            else startAmbient(0.5);
            setSound(!sound);
          }}>{sound ? 'Sound on' : 'Sound off'}</button>
          <button className="aero-btn aero-btn-icon" aria-label="How to play" aria-pressed={panel === 'help'} onClick={() => setPanel((p) => (p === 'help' ? null : 'help'))}>?</button>
        </div>
      </div>

      {panel === 'real' && terrain && (
        <section className="glass absolute top-24 right-2 max-h-[70vh] w-80 max-w-[calc(100vw-1rem)] overflow-y-auto p-4 text-15 sm:right-4" aria-label="What is real here">
          <h2 className="font-display text-24 font-black">What’s real here</h2>
          <p className="mt-1 text-13 text-ink/75">{style.resolution}</p>
          <p className="mt-2 font-bold">Measured <ProvenanceTag p="measured" /></p>
          <ul className="mt-1 list-disc space-y-1 pl-5">{style.real.map((t) => <li key={t}>{t}</li>)}</ul>
          <p className="mt-2 font-bold">Generated (artwork)</p>
          <ul className="mt-1 list-disc space-y-1 pl-5">{style.generated.map((t) => <li key={t}>{t}</li>)}</ul>
          <p className="mt-2 text-13">
            Survey window: {terrain.meta.crs}, {terrain.meta.size_m.x} × {terrain.meta.size_m.y} m, elevation {terrain.meta.elevation_min_m} to {terrain.meta.elevation_max_m} m ({terrain.meta.vertical_datum}). {(terrain.meta.measured_fraction * 100).toFixed(1)}% measured.
          </p>
          <ul className="mt-2 space-y-1 text-13">
            {terrain.meta.sources.map((s) => (
              <li key={s.label}><a className="underline" href={s.doi ?? s.url} target="_blank" rel="noreferrer">{s.label}</a> · {s.license} · {s.attribution}</li>
            ))}
          </ul>
        </section>
      )}

      {panel === 'help' && (
        <section className="glass absolute top-1/2 left-1/2 w-[min(28rem,calc(100vw-1rem))] -translate-x-1/2 -translate-y-1/2 p-5 text-15" aria-label="How to play">
          <h2 className="font-display text-24 font-black">Welcome to {reef.name}</h2>
          <p className="mt-1">This seabed was measured by real surveys. Find a good spot, deploy a device, then shape it in the microscope.</p>
          <ol className="mt-3 list-decimal space-y-1 pl-5">
            <li><b>Swim:</b> {touch ? 'joystick to move, drag to look, ▲▼ to rise and sink' : 'W A S D to move, drag to look, Space / Shift to rise and sink, scroll for speed'}</li>
            <li><b>Deploy:</b> press <b>Deploy a device</b>{touch ? '' : ' (F)'}, aim at the seabed; green means the spot passes the checks{touch ? '' : '; R rotates'}</li>
            <li><b>Build:</b> select your device and open the <b>Microscope</b> to build its millimetre-scale structure</li>
            <li><b>Return</b> to the reef and see your invention in place</li>
          </ol>
          <button className="aero-btn aero-btn-go mt-4" onClick={() => {
            setPanel(null);
            try {
              localStorage.setItem(ONBOARDED, '1');
            } catch {
              // fine
            }
          }}>Let’s dive</button>
        </section>
      )}

      {/* Deploy status */}
      {mode === 'deploy' && (
        <section className="glass absolute top-24 left-2 w-72 max-w-[calc(100vw-1rem)] p-4 text-15 sm:left-4" aria-label="Placement checks">
          <h2 className="font-display text-18 font-black">Choose a deployment site</h2>
          <p className="text-13 text-ink/75">Engineering checks on the measured terrain, not a habitat prediction.</p>
          {check ? (
            <ul className="mt-2 space-y-0.5">
              <li>{check.measured ? '✅' : '❌'} Measured ground</li>
              <li>{check.slopeDeg <= 25 ? '✅' : '❌'} Slope {check.slopeDeg.toFixed(0)}° (max 25°)</li>
              {!check.coarse && <li>{check.relief <= 0.03 ? '✅' : '❌'} Unevenness {(check.relief * 100).toFixed(1)} cm (max 3 cm)</li>}
              <li>{check.nearest === null || check.nearest >= 0.3 ? '✅' : '❌'} Spacing {check.nearest === null ? 'clear' : `${(check.nearest * 100).toFixed(0)} cm`}</li>
              {check.coarse && <li className="text-13">Terrain grid is coarser than the device: checks are approximate.</li>}
            </ul>
          ) : (
            <p className="mt-2">Aim at the seabed.</p>
          )}
          <p className="mt-2 text-13">{touch ? 'Tap to place.' : 'Click to place · R rotate · Esc cancel'}</p>
        </section>
      )}

      {/* Devices */}
      {devices.length > 0 && (
        <section className="glass-sea absolute right-2 bottom-24 w-64 max-w-[calc(100vw-1rem)] p-3 sm:right-4" aria-label="Your devices">
          <p className="font-display font-black">Your devices</p>
          <ul className="mt-1 max-h-32 space-y-1 overflow-y-auto">
            {devices.map((d) => (
              <li key={d.id}>
                <button className={`w-full rounded-lg px-2 py-1 text-left text-13 ${d.id === selected ? 'bg-white/30 font-bold' : 'hover:bg-white/15'}`}
                  onClick={() => {
                    useDevices.getState().select(d.id);
                    approach(d.id);
                  }}>
                  {d.name} · {d.pieces.length} pieces · {d.y.toFixed(1)} m
                </button>
              </li>
            ))}
          </ul>
          {sel && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              <button className="aero-btn aero-btn-go" onClick={() => openMicroscope(sel.id)}>Microscope</button>
              <button className="aero-btn" onClick={() => approach(sel.id)}>Approach</button>
              <button className="aero-btn" onClick={() => useDevices.getState().remove(sel.id)}>Remove</button>
            </div>
          )}
        </section>
      )}

      {toast && <p className="glass pointer-events-none absolute bottom-40 left-1/2 max-w-[calc(100vw-2rem)] -translate-x-1/2 px-4 py-2 text-center text-15 font-bold" role="status">{toast}</p>}

      {touch && terrain && phase === 'world' && <TouchControls controls={controls} />}

      {/* Bottom: modes */}
      <div className="absolute inset-x-0 bottom-0 flex flex-wrap items-center justify-center gap-2 p-3 sm:p-4">
        <button className="aero-btn" aria-pressed={mode === 'swim'} onClick={() => setMode('swim')}>Swim</button>
        <button className="aero-btn aero-btn-go aero-btn-lg" aria-pressed={mode === 'deploy'} onClick={() => setMode((m) => (m === 'deploy' ? 'swim' : 'deploy'))}>
          {mode === 'deploy' ? 'Cancel deploying' : 'Deploy a device'}
        </button>
        {mode === 'deploy' && <button className="aero-btn" onClick={() => setYaw((y) => y + Math.PI / 2)}>Rotate</button>}
      </div>

      {phase === 'zooming' && (
        <div className="dive-veil fixed inset-0 z-50 flex items-center justify-center">
          <Bubbles count={30} seed={4} />
          <p className="font-display text-32 font-black text-white drop-shadow">Zooming into {sel?.name} · ×200</p>
        </div>
      )}
      <div aria-hidden className="pointer-events-none absolute inset-0 shadow-[inset_0_0_140px_rgba(0,30,60,0.55)]" />
    </div>
  );
}
