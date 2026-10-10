// The prototype run, replayed: glowing larvae (gold while touching the structure) with fading
// trails. Everything drawn here comes from the run's recorded frames, so the picture is the run.
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { PrototypeRun } from '@shared';
import { NX, NZ, S } from './space';

const TRAIL = 10;

/** Shared playback clock: the HUD reads and writes it; the scene advances it every frame. */
export interface Playback {
  frame: number;
  playing: boolean;
  speed: number;
}

/** A soft round glow, drawn once. */
function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.85)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

const GLOW = new THREE.Color('#9ff6ff');
const TOUCH = new THREE.Color('#ffd84d');

export function Larvae({ run, playback, onFrame }: { run: PrototypeRun; playback: React.MutableRefObject<Playback>; onFrame?: (f: number) => void }) {
  const n = run.params.larvae;
  const { points, trails } = useMemo(() => {
    const p = new THREE.BufferGeometry();
    p.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    p.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    const t = new THREE.BufferGeometry();
    t.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * TRAIL * 2 * 3), 3));
    t.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * TRAIL * 2 * 4), 4));
    return { points: p, trails: t };
  }, [n]);
  const texture = useMemo(glowTexture, []);
  const lastReported = useRef(-1);

  /** Larva k at frame f, in world units. */
  const at = (f: number, k: number, out: number[]) => {
    const i = (f * n + k) * 3;
    out[0] = (run.frames[i]! - NX / 2) * S;
    out[1] = run.frames[i + 1]! * S;
    out[2] = (run.frames[i + 2]! - NZ / 2) * S;
  };

  useFrame((_, dt) => {
    const pb = playback.current;
    if (pb.playing) {
      pb.frame += (dt / run.frameDt) * pb.speed;
      if (pb.frame >= run.frameCount - 1) {
        pb.frame = run.frameCount - 1;
        pb.playing = false;
      }
    }
    const f0 = Math.floor(pb.frame);
    const f1 = Math.min(run.frameCount - 1, f0 + 1);
    const w = pb.frame - f0;
    const pos = points.getAttribute('position') as THREE.BufferAttribute;
    const col = points.getAttribute('color') as THREE.BufferAttribute;
    const a: number[] = [0, 0, 0];
    const b: number[] = [0, 0, 0];
    for (let k = 0; k < n; k++) {
      at(f0, k, a);
      at(f1, k, b);
      // Interpolate between recorded frames, but never across a periodic wrap (a jump of half the tile).
      const jump = Math.abs(a[0]! - b[0]!) > (NX * S) / 2 || Math.abs(a[2]! - b[2]!) > (NZ * S) / 2;
      const t = jump ? 0 : w;
      pos.setXYZ(k, a[0]! + (b[0]! - a[0]!) * t, a[1]! + (b[1]! - a[1]!) * t, a[2]! + (b[2]! - a[2]!) * t);
      const c = run.contact[f0 * n + k] ? TOUCH : GLOW;
      col.setXYZ(k, c.r, c.g, c.b);
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;

    // Trails: the last TRAIL recorded steps, fading out; segments across a wrap are hidden.
    const tp = trails.getAttribute('position') as THREE.BufferAttribute;
    const tc = trails.getAttribute('color') as THREE.BufferAttribute;
    let v = 0;
    for (let k = 0; k < n; k++) {
      for (let s = 0; s < TRAIL; s++) {
        const fa = Math.max(0, f0 - s - 1);
        const fb = Math.max(0, f0 - s);
        at(fa, k, a);
        at(fb, k, b);
        const wrap = Math.abs(a[0]! - b[0]!) > (NX * S) / 2 || Math.abs(a[2]! - b[2]!) > (NZ * S) / 2;
        const alpha = wrap || fa === fb ? 0 : (1 - s / TRAIL) * 0.55;
        const touched = run.contact[fb * n + k];
        const c = touched ? TOUCH : GLOW;
        tp.setXYZ(v, b[0]!, b[1]!, b[2]!);
        tc.setXYZW(v++, c.r, c.g, c.b, alpha);
        tp.setXYZ(v, a[0]!, a[1]!, a[2]!);
        tc.setXYZW(v++, c.r, c.g, c.b, alpha * 0.6);
      }
    }
    tp.needsUpdate = true;
    tc.needsUpdate = true;

    if (onFrame && Math.floor(pb.frame) !== lastReported.current) {
      lastReported.current = Math.floor(pb.frame);
      onFrame(pb.frame);
    }
  });

  return (
    <group>
      <lineSegments geometry={trails} raycast={() => null}>
        <lineBasicMaterial vertexColors transparent depthWrite={false} blending={THREE.AdditiveBlending} />
      </lineSegments>
      <points geometry={points} raycast={() => null}>
        <pointsMaterial size={0.16} map={texture} vertexColors transparent depthWrite={false} blending={THREE.AdditiveBlending} sizeAttenuation />
      </points>
    </group>
  );
}
