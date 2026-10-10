// Generated reef life on the real terrain: sea fans (gorgonians), barrel and tube sponges, branching
// coral clumps, seagrass and rocks. Artwork placed by rules that read the measured terrain
// (fans on raised spurs, seagrass on shallow flats ...), never on unmeasured ground. The "What's
// real here" panel lists all of it as generated.
import { useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { rng } from '@shared';
import type { Terrain } from './terrain';
import type { WorldStyle } from './worlds';

type Item = { m: THREE.Matrix4; c: THREE.Color };

/** A swaying material: vertices bend with height (seagrass, fans). */
function swayMaterial(base: THREE.MeshStandardMaterialParameters, amount: number) {
  const m = new THREE.MeshStandardMaterial({ ...base });
  const uniforms = { uTime: { value: 0 } };
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         vec4 ip = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
         float h = max(position.y, 0.0);
         float s = sin(uTime * 1.1 + ip.x * 0.7 + ip.z * 0.5) * ${amount.toFixed(3)} + sin(uTime * 2.3 + ip.z) * ${(amount * 0.25).toFixed(3)};
         transformed.x += s * h * h;
         transformed.z += s * 0.5 * h * h;`,
      );
  };
  m.customProgramCacheKey = () => `sway-${amount}`;
  return { material: m, uniforms };
}

function fanGeometry() {
  // A flat lattice fan: a few branching ribbons in a plane, base at the origin, ~1 unit tall.
  const parts: THREE.BufferGeometry[] = [];
  const r = rng(3);
  const twig = (x0: number, y0: number, a: number, len: number, w: number, depth: number) => {
    const g = new THREE.PlaneGeometry(w, len, 1, 3);
    g.translate(0, len / 2, 0);
    g.rotateZ(a);
    g.translate(x0, y0, 0);
    parts.push(g);
    if (depth === 0) return;
    const x1 = x0 - Math.sin(a) * len, y1 = y0 + Math.cos(a) * len;
    twig(x1, y1, a + 0.35 + r.next() * 0.2, len * 0.72, w * 0.75, depth - 1);
    twig(x1, y1, a - 0.35 - r.next() * 0.2, len * 0.72, w * 0.75, depth - 1);
  };
  twig(0, 0, 0, 0.32, 0.05, 4);
  return mergeGeometries(parts)!;
}

function coralGeometry() {
  // A branching (staghorn-like) clump: tapered cylinders, ~0.5 unit tall.
  const parts: THREE.BufferGeometry[] = [];
  const r = rng(9);
  const up = new THREE.Vector3(0, 1, 0);
  const branch = (base: THREE.Vector3, dir: THREE.Vector3, len: number, rad: number, depth: number) => {
    const g = new THREE.CylinderGeometry(rad * 0.7, rad, len, 6, 1);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, dir));
    const mid = base.clone().addScaledVector(dir, len / 2);
    g.translate(mid.x, mid.y, mid.z);
    parts.push(g);
    if (depth === 0) return;
    const tip = base.clone().addScaledVector(dir, len);
    for (let k = 0; k < 2 + Math.floor(r.next() * 2); k++) {
      const d = dir.clone().add(new THREE.Vector3((r.next() - 0.5) * 1.4, 0.4 + r.next() * 0.3, (r.next() - 0.5) * 1.4)).normalize();
      branch(tip, d, len * 0.7, rad * 0.75, depth - 1);
    }
  };
  for (let k = 0; k < 4; k++) branch(new THREE.Vector3((r.next() - 0.5) * 0.2, 0, (r.next() - 0.5) * 0.2), new THREE.Vector3((r.next() - 0.5) * 0.6, 1, (r.next() - 0.5) * 0.6).normalize(), 0.16, 0.025, 3);
  return mergeGeometries(parts.map((p) => p.toNonIndexed()))!;
}

function spongeGeometry() {
  const g = new THREE.CylinderGeometry(0.16, 0.11, 0.5, 14, 4, true);
  g.translate(0, 0.25, 0);
  // A slight barrel bulge.
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    const k = 1 + Math.sin((y / 0.5) * Math.PI) * 0.18;
    p.setX(i, p.getX(i) * k);
    p.setZ(i, p.getZ(i) * k);
  }
  g.computeVertexNormals();
  return g;
}

function bladeGeometry() {
  const g = new THREE.PlaneGeometry(0.03, 0.5, 1, 5);
  g.translate(0, 0.25, 0);
  return g;
}

export function Life({ terrain, style }: { terrain: Terrain; style: WorldStyle }) {
  const sets = useMemo(() => {
    const r = rng(1234);
    const area = (terrain.sizeX * terrain.sizeZ) / 100;
    const items = { fan: [] as Item[], coral: [] as Item[], sponge: [] as Item[], grass: [] as Item[], rock: [] as Item[] };
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const place = (kind: keyof typeof items, count: number, accept: (x: number, z: number, h: number) => boolean, size: [number, number], palette: string[], tilt = 0) => {
      let tries = 0;
      while (items[kind].length < count && tries++ < count * 30) {
        const x = (r.next() - 0.5) * terrain.sizeX * 0.98;
        const z = (r.next() - 0.5) * terrain.sizeZ * 0.98;
        if (!terrain.measuredAt(x, z)) continue;
        const h = terrain.heightAt(x, z);
        if (h > style.surface - 0.4 || !accept(x, z, h)) continue;
        const s = size[0] + r.next() * (size[1] - size[0]);
        e.set((r.next() - 0.5) * tilt, r.next() * Math.PI * 2, (r.next() - 0.5) * tilt);
        q.setFromEuler(e);
        items[kind].push({ m: new THREE.Matrix4().compose(new THREE.Vector3(x, h - 0.02 * s, z), q.clone(), new THREE.Vector3(s, s, s)), c: new THREE.Color(palette[Math.floor(r.next() * palette.length)]).offsetHSL((r.next() - 0.5) * 0.04, 0, (r.next() - 0.5) * 0.08) });
      }
    };
    // Raised ground (spurs, bommies): higher than its 3 m surroundings.
    const raised = (x: number, z: number, h: number) => h - (terrain.heightAt(x + 1.5, z) + terrain.heightAt(x - 1.5, z) + terrain.heightAt(x, z + 1.5) + terrain.heightAt(x, z - 1.5)) / 4 > 0.08;
    const flat = (x: number, z: number) => terrain.slopeAt(x, z, 0.5) < 8;
    const shallow = (_x: number, _z: number, h: number) => h > style.surface - 6;
    place('fan', Math.round(style.decor.gorgonians * area), raised, [0.6, 1.4], ['#b25bd6', '#d86ab8', '#e9a23b', '#c46ad0']);
    place('coral', Math.round(style.decor.corals * area), (x, z, h) => shallow(x, z, h) && (raised(x, z, h) || r.next() < 0.3), [0.7, 1.6], ['#d9a066', '#c58b5a', '#e0b07a', '#9d7bd8', '#7fc6a4']);
    place('sponge', Math.round(style.decor.sponges * area), () => true, [0.5, 1.4], ['#c75b2a', '#a8452d', '#d9893b', '#7d4aa8']);
    place('grass', Math.round(style.decor.seagrass * area) * 12, (x, z, h) => flat(x, z) && shallow(x, z, h), [0.6, 1.3], ['#4fb05e', '#6fca5a', '#3d9a52']);
    place('rock', Math.round(style.decor.rocks * area), () => true, [0.5, 2.2], ['#8d8a7a', '#7a8a86', '#9b8f7e'], 1.2);
    return items;
  }, [terrain, style]);

  const fan = useMemo(() => swayMaterial({ roughness: 0.7, side: THREE.DoubleSide }, 0.05), []);
  const grass = useMemo(() => swayMaterial({ roughness: 0.7, side: THREE.DoubleSide }, 0.35), []);
  const geoms = useMemo(() => ({ fan: fanGeometry(), coral: coralGeometry(), sponge: spongeGeometry(), grass: bladeGeometry(), rock: new THREE.DodecahedronGeometry(0.3, 1) }), []);
  useFrame(({ clock }) => {
    fan.uniforms.uTime.value = clock.elapsedTime;
    grass.uniforms.uTime.value = clock.elapsedTime;
  });

  const fill = (mesh: THREE.InstancedMesh | null, list: Item[]) => {
    if (!mesh) return;
    list.forEach((it, k) => {
      mesh.setMatrixAt(k, it.m);
      mesh.setColorAt(k, it.c);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  };

  return (
    <group>
      {sets.fan.length > 0 && <instancedMesh ref={(m) => fill(m, sets.fan)} args={[geoms.fan, fan.material, sets.fan.length]} raycast={() => null} />}
      {sets.coral.length > 0 && (
        <instancedMesh ref={(m) => fill(m, sets.coral)} args={[geoms.coral, undefined, sets.coral.length]} raycast={() => null} castShadow>
          <meshStandardMaterial roughness={0.75} />
        </instancedMesh>
      )}
      {sets.sponge.length > 0 && (
        <instancedMesh ref={(m) => fill(m, sets.sponge)} args={[geoms.sponge, undefined, sets.sponge.length]} raycast={() => null}>
          <meshStandardMaterial roughness={0.85} side={THREE.DoubleSide} />
        </instancedMesh>
      )}
      {sets.grass.length > 0 && <instancedMesh ref={(m) => fill(m, sets.grass)} args={[geoms.grass, grass.material, sets.grass.length]} raycast={() => null} />}
      {sets.rock.length > 0 && (
        <instancedMesh ref={(m) => fill(m, sets.rock)} args={[geoms.rock, undefined, sets.rock.length]} raycast={() => null}>
          <meshStandardMaterial roughness={1} flatShading />
        </instancedMesh>
      )}
    </group>
  );
}
