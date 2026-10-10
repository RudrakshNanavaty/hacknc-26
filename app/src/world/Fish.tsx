// Reef fish: procedural species models (no third-party assets) animated in the vertex shader with
// a travelling body wave, and schools steered by simple boids (cohesion, alignment, separation,
// a wandering goal, terrain avoidance). Artwork, not observations of what lives at the site.
import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { rng } from '@shared';
import type { Terrain } from './terrain';

interface Species {
  name: string;
  length: number; // metres
  height: number; // body depth / length
  width: number; // body width / length
  speed: number; // m/s cruising
  schoolSize: [number, number];
  /** Height band above the seabed (m). */
  band: [number, number];
  /** Body colour at (t along body 0 = tail .. 1 = head, v -1 belly .. 1 back). */
  paint: (t: number, v: number) => [number, number, number];
  fin: [number, number, number];
}

const hex = (h: string): [number, number, number] => {
  const c = new THREE.Color(h);
  return [c.r, c.g, c.b];
};
const mix = (a: [number, number, number], b: [number, number, number], k: number): [number, number, number] => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
const band = (t: number, at: number, w: number) => Math.abs(t - at) < w;

const SPECIES: Species[] = [
  {
    name: 'blue tang',
    length: 0.22, height: 0.5, width: 0.12, speed: 0.45, schoolSize: [5, 9], band: [0.4, 2.2],
    paint: (t, v) => (t < 0.12 ? hex('#ffd21f') : v > 0.25 && t > 0.2 && t < 0.85 && v < 0.75 ? hex('#101c3a') : mix(hex('#1f5bd8'), hex('#58a6ff'), Math.max(0, v))),
    fin: hex('#ffd21f'),
  },
  {
    name: 'yellow tang',
    length: 0.16, height: 0.55, width: 0.12, speed: 0.4, schoolSize: [6, 12], band: [0.3, 1.6],
    paint: (t, v) => mix(hex('#ffd60a'), hex('#fff27a'), Math.max(0, v) * 0.5 + (band(t, 0.2, 0.02) ? 0.5 : 0)),
    fin: hex('#ffcc00'),
  },
  {
    name: 'clownfish-like damsel',
    length: 0.09, height: 0.42, width: 0.16, speed: 0.25, schoolSize: [3, 6], band: [0.15, 0.7],
    paint: (t) => (band(t, 0.78, 0.05) || band(t, 0.5, 0.05) || band(t, 0.18, 0.035) ? hex('#ffffff') : band(t, 0.78, 0.07) || band(t, 0.5, 0.07) || band(t, 0.18, 0.05) ? hex('#111111') : hex('#ff7a1a')),
    fin: hex('#ff8c2a'),
  },
  {
    name: 'parrotfish',
    length: 0.42, height: 0.36, width: 0.16, speed: 0.55, schoolSize: [2, 4], band: [0.3, 1.8],
    paint: (t, v) => mix(hex('#18b8a0'), hex('#5fe08a'), 0.5 + 0.5 * Math.sin(t * 22) * 0.4 + Math.max(0, v) * 0.3),
    fin: hex('#ff7fb0'),
  },
  {
    name: 'blue-green chromis',
    length: 0.08, height: 0.4, width: 0.13, speed: 0.5, schoolSize: [18, 34], band: [0.8, 3.5],
    paint: (_t, v) => mix(hex('#3fd0c4'), hex('#9cf5ff'), Math.max(0, v)),
    fin: hex('#9cf5ff'),
  },
  {
    name: 'yellowtail snapper',
    length: 0.34, height: 0.32, width: 0.12, speed: 0.75, schoolSize: [8, 16], band: [0.8, 3],
    paint: (t, v) => (Math.abs(v) < 0.12 && t > 0.15 ? hex('#ffd23f') : v > 0 ? mix(hex('#8aa4c0'), hex('#c9d6e6'), t) : hex('#e9eef4')),
    fin: hex('#ffcf2a'),
  },
];

/** One fish mesh: an elliptical body from tail (t = 0) to head (t = 1), forked tail, fins. +x is forward. */
function fishGeometry(s: Species) {
  const rings = 16, seg = 10;
  const pos: number[] = [], col: number[] = [], idx: number[] = [];
  const profile = (t: number) => Math.pow(Math.sin(Math.PI * Math.min(1, 0.05 + t * 0.97)), 0.7) * (t < 0.15 ? 0.35 + t * 4.3 : 1);
  for (let r = 0; r <= rings; r++) {
    const t = r / rings;
    const p = Math.max(0.04, profile(t));
    for (let k = 0; k <= seg; k++) {
      const a = (k / seg) * Math.PI * 2;
      const v = Math.cos(a); // +1 back, -1 belly
      pos.push((t - 0.5) * s.length, v * p * s.height * s.length * 0.5, Math.sin(a) * p * s.width * s.length * 0.5);
      col.push(...s.paint(t, v));
    }
  }
  for (let r = 0; r < rings; r++) for (let k = 0; k < seg; k++) {
    const a = r * (seg + 1) + k, b = a + seg + 1;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const fin = (verts: number[][]) => {
    const base = pos.length / 3;
    for (const v of verts) {
      pos.push(v[0]! * s.length, v[1]! * s.length, v[2]! * s.length);
      col.push(...s.fin);
    }
    for (let k = 1; k < verts.length - 1; k++) idx.push(base, base + k, base + k + 1, base, base + k + 1, base + k);
  };
  const h = s.height;
  fin([[-0.47, 0, 0], [-0.62, h * 0.55, 0], [-0.56, 0, 0], [-0.62, -h * 0.55, 0]]); // forked tail
  fin([[0.2, h * 0.45, 0], [-0.05, h * 0.75, 0], [-0.3, h * 0.42, 0], [-0.32, h * 0.25, 0]]); // dorsal
  fin([[0.05, -h * 0.4, 0], [-0.15, -h * 0.62, 0], [-0.3, -h * 0.25, 0]]); // anal
  fin([[0.18, -h * 0.05, s.width * 0.45], [0.02, -h * 0.25, s.width * 0.9], [0.08, -h * 0.02, s.width * 0.5]]); // pectoral
  fin([[0.18, -h * 0.05, -s.width * 0.45], [0.02, -h * 0.25, -s.width * 0.9], [0.08, -h * 0.02, -s.width * 0.5]]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Swimming: a lateral wave travelling head to tail, growing toward the tail. */
function swimMaterial(length: number) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.08, side: THREE.DoubleSide });
  const uniforms = { uTime: { value: 0 } };
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nuniform float uTime;\nattribute vec2 aSwim;`)
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         float along = clamp(0.5 - position.x / ${length.toFixed(4)}, 0.0, 1.2); // 0 head .. 1 tail
         float wave = sin(position.x / ${length.toFixed(4)} * 7.0 - uTime * aSwim.y + aSwim.x);
         transformed.z += wave * along * along * ${(length * 0.12).toFixed(4)};`,
      );
  };
  m.customProgramCacheKey = () => `fish-${length}`;
  return { material: m, uniforms };
}

interface School {
  species: Species;
  mesh: THREE.InstancedMesh | null;
  n: number;
  pos: Float32Array;
  vel: Float32Array;
  goal: THREE.Vector3;
  goalTimer: number;
  scale: Float32Array;
}

export function Fish({ terrain, schools: count, scale, maxDistance }: { terrain: Terrain; schools: number; scale: number; maxDistance: number }) {
  const { camera } = useThree();
  const kinds = useMemo(() => SPECIES.map((s) => ({ s: { ...s, length: s.length * scale, speed: s.speed * scale }, geom: null as THREE.BufferGeometry | null, mat: null as ReturnType<typeof swimMaterial> | null })), [scale]);
  for (const k of kinds) {
    k.geom ??= fishGeometry(k.s);
    k.mat ??= swimMaterial(k.s.length);
  }
  const schools = useMemo<School[]>(() => {
    const r = rng(97);
    const out: School[] = [];
    for (let i = 0; i < count; i++) {
      const kind = kinds[i % kinds.length]!;
      const [lo, hi] = kind.s.schoolSize;
      const n = lo + Math.floor(r.next() * (hi - lo + 1));
      const cx = (r.next() - 0.5) * terrain.sizeX * 0.8;
      const cz = (r.next() - 0.5) * terrain.sizeZ * 0.8;
      const cy = terrain.heightAt(cx, cz) + (kind.s.band[0] + kind.s.band[1]) / 2 * scale;
      const pos = new Float32Array(n * 3), vel = new Float32Array(n * 3), sc = new Float32Array(n);
      const swim = new Float32Array(n * 2);
      for (let k = 0; k < n; k++) {
        pos.set([cx + (r.next() - 0.5) * 2 * scale, cy + (r.next() - 0.5) * scale, cz + (r.next() - 0.5) * 2 * scale], k * 3);
        vel.set([(r.next() - 0.5) * 0.2, 0, (r.next() - 0.5) * 0.2], k * 3);
        sc[k] = 0.8 + r.next() * 0.45;
        swim.set([r.next() * 6.28, (6 + r.next() * 4) * (1 / Math.sqrt(kind.s.length / 0.2))], k * 2);
      }
      kind.geom!.setAttribute('aSwim', new THREE.InstancedBufferAttribute(new Float32Array(64 * 2).map((_, j) => (j % 2 ? 8 : (j * 1.7) % 6.28)), 2));
      out.push({ species: kind.s, mesh: null, n, pos, vel, goal: new THREE.Vector3(cx, cy, cz), goalTimer: 0, scale: sc });
    }
    return out;
  }, [count, kinds, terrain, scale]);

  const m4 = useMemo(() => new THREE.Matrix4(), []);
  const q = useMemo(() => new THREE.Quaternion(), []);
  const fwd = useMemo(() => new THREE.Vector3(1, 0, 0), []);
  const v3 = useMemo(() => new THREE.Vector3(), []);
  const s3 = useMemo(() => new THREE.Vector3(), []);
  const r = useMemo(() => rng(5), []);

  useFrame(({ clock }, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    for (const k of kinds) k.mat!.uniforms.uTime.value = clock.elapsedTime;
    for (const sc of schools) {
      const mesh = sc.mesh;
      if (!mesh) continue;
      const s = sc.species;
      // Centre of the school; far schools are hidden and updated less.
      let cx = 0, cy = 0, cz = 0, ax = 0, ay = 0, az = 0;
      for (let i = 0; i < sc.n; i++) {
        cx += sc.pos[i * 3]!; cy += sc.pos[i * 3 + 1]!; cz += sc.pos[i * 3 + 2]!;
        ax += sc.vel[i * 3]!; ay += sc.vel[i * 3 + 1]!; az += sc.vel[i * 3 + 2]!;
      }
      cx /= sc.n; cy /= sc.n; cz /= sc.n; ax /= sc.n; ay /= sc.n; az /= sc.n;
      const far = camera.position.distanceTo(v3.set(cx, cy, cz)) > maxDistance;
      mesh.visible = !far;
      sc.goalTimer -= dt;
      if (sc.goalTimer <= 0 || sc.goal.distanceTo(v3.set(cx, cy, cz)) < 0.8 * scale) {
        // A new wander goal inside the survey, at the species' preferred height.
        sc.goalTimer = 6 + r.next() * 10;
        const gx = Math.max(-0.45, Math.min(0.45, cx / terrain.sizeX + (r.next() - 0.5) * 0.35)) * terrain.sizeX;
        const gz = Math.max(-0.45, Math.min(0.45, cz / terrain.sizeZ + (r.next() - 0.5) * 0.35)) * terrain.sizeZ;
        sc.goal.set(gx, terrain.heightAt(gx, gz) + (s.band[0] + r.next() * (s.band[1] - s.band[0])) * scale, gz);
      }
      const step = far ? dt * 0.5 : dt;
      for (let i = 0; i < sc.n; i++) {
        const o = i * 3;
        const px = sc.pos[o]!, py = sc.pos[o + 1]!, pz = sc.pos[o + 2]!;
        let fx = (sc.goal.x - px) * 0.08 + (cx - px) * 0.25 + (ax - sc.vel[o]!) * 0.6;
        let fy = (sc.goal.y - py) * 0.12 + (cy - py) * 0.25 + (ay - sc.vel[o + 1]!) * 0.6;
        let fz = (sc.goal.z - pz) * 0.08 + (cz - pz) * 0.25 + (az - sc.vel[o + 2]!) * 0.6;
        if (!far) {
          const sep = s.length * 1.6;
          for (let j = 0; j < sc.n; j++) {
            if (j === i) continue;
            const dx = px - sc.pos[j * 3]!, dy = py - sc.pos[j * 3 + 1]!, dz = pz - sc.pos[j * 3 + 2]!;
            const d2 = dx * dx + dy * dy + dz * dz;
            if (d2 < sep * sep && d2 > 1e-6) {
              const f = (sep * sep - d2) / (sep * sep) * 2.5;
              fx += dx * f / Math.sqrt(d2); fy += dy * f / Math.sqrt(d2); fz += dz * f / Math.sqrt(d2);
            }
          }
        }
        // Stay off the seabed.
        const floor = terrain.heightAt(px, pz) + s.band[0] * scale * 0.6;
        if (py < floor) fy += (floor - py) * 6;
        let vx = sc.vel[o]! + fx * step, vy = sc.vel[o + 1]! + fy * step, vz = sc.vel[o + 2]! + fz * step;
        const sp = Math.hypot(vx, vy, vz);
        const max = s.speed * (0.9 + 0.2 * Math.sin(clock.elapsedTime * 0.7 + i));
        if (sp > max) { vx *= max / sp; vy *= max / sp; vz *= max / sp; }
        vy *= 0.92; // fish mostly swim level
        sc.vel[o] = vx; sc.vel[o + 1] = vy; sc.vel[o + 2] = vz;
        sc.pos[o] = px + vx * step; sc.pos[o + 1] = py + vy * step; sc.pos[o + 2] = pz + vz * step;
        if (far) continue;
        v3.set(vx, vy * 0.6, vz).normalize();
        q.setFromUnitVectors(fwd, v3);
        s3.setScalar(sc.scale[i]!);
        m4.compose(new THREE.Vector3(sc.pos[o], sc.pos[o + 1], sc.pos[o + 2]), q, s3);
        mesh.setMatrixAt(i, m4);
      }
      if (!far) mesh.instanceMatrix.needsUpdate = true;
    }
  });

  return (
    <group>
      {schools.map((sc, i) => {
        const kind = kinds.find((k) => k.s.name === sc.species.name)!;
        return (
          <instancedMesh
            key={i}
            ref={(m) => void (sc.mesh = m)}
            args={[kind.geom!, kind.mat!.material, sc.n]}
            frustumCulled={false}
            raycast={() => null}
            castShadow
          />
        );
      })}
    </group>
  );
}
