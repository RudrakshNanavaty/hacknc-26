// The underwater world around the build tile, all procedural (no external assets): sandy seabed
// with animated caustics, light shafts, coral clusters, swaying seagrass, schooling fish, bubbles
// and drifting plankton. Decoration only: nothing here touches the simulation.
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { rng } from '@shared';
import { HALF_X, HALF_Z } from './space';

export const WATER = '#0f86b4';
const FOG = '#1597c4';

/** A small canvas texture, made once. */
function canvasTexture(size: number, draw: (c: CanvasRenderingContext2D) => void, repeat = 1) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  draw(canvas.getContext('2d')!);
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function Seabed() {
  const map = useMemo(
    () =>
      canvasTexture(256, (c) => {
        const r = rng(11);
        c.fillStyle = '#e8d6a8';
        c.fillRect(0, 0, 256, 256);
        for (let k = 0; k < 9000; k++) {
          const v = 190 + r.next() * 60;
          c.fillStyle = `rgba(${v},${v * 0.92},${v * 0.72},${0.25 + r.next() * 0.4})`;
          c.fillRect(r.next() * 256, r.next() * 256, 1 + r.next() * 1.6, 1 + r.next() * 1.6);
        }
        // Soft ripples.
        c.strokeStyle = 'rgba(255,255,240,0.18)';
        c.lineWidth = 3;
        for (let y = 0; y < 256; y += 18) {
          c.beginPath();
          for (let x = 0; x <= 256; x += 8) c.lineTo(x, y + Math.sin(x / 20) * 4);
          c.stroke();
        }
      }, 24),
    [],
  );
  return (
    <mesh rotation-x={-Math.PI / 2} position-y={-0.32} receiveShadow>
      <circleGeometry args={[70, 64]} />
      <meshStandardMaterial map={map} roughness={0.95} color="#f4e2b8" />
    </mesh>
  );
}

/** Dancing light on the seabed: a few moving sine fields folded into sharp bright lines. */
function Caustics() {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: { uTime: { value: 0 } },
        vertexShader: /* glsl */ `
          varying vec2 vUv; varying vec3 vPos;
          void main() { vUv = uv; vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: /* glsl */ `
          uniform float uTime; varying vec2 vUv; varying vec3 vPos;
          float field(vec2 p, float t) {
            float v = 0.0;
            v += sin(p.x * 1.7 + t * 0.9 + sin(p.y * 1.3 + t * 0.7));
            v += sin(p.y * 2.1 - t * 0.8 + sin(p.x * 1.1 - t * 0.5));
            v += sin((p.x + p.y) * 1.3 + t * 0.6);
            return v;
          }
          void main() {
            vec2 p = vPos.xy * 0.9;
            float a = abs(field(p, uTime));
            float b = abs(field(p * 1.37 + 3.1, uTime * 1.21));
            float c = pow(max(0.0, 1.0 - a * 0.55), 6.0) + pow(max(0.0, 1.0 - b * 0.6), 7.0) * 0.7;
            float fade = smoothstep(42.0, 6.0, length(vPos.xy));
            gl_FragColor = vec4(vec3(0.75, 0.95, 1.0) * c * 0.55 * fade, 1.0);
          }`,
      }),
    [],
  );
  useFrame((_, dt) => void (material.uniforms.uTime!.value += dt));
  return (
    <mesh rotation-x={-Math.PI / 2} position-y={-0.3} material={material}>
      <circleGeometry args={[45, 64]} />
    </mesh>
  );
}

/** Shafts of sunlight from the surface, slowly breathing. */
function LightRays() {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        uniforms: { uTime: { value: 0 } },
        vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: /* glsl */ `
          uniform float uTime; varying vec2 vUv;
          void main() {
            float edge = smoothstep(0.0, 0.35, vUv.x) * smoothstep(1.0, 0.65, vUv.x);
            float depth = smoothstep(0.0, 0.9, vUv.y);
            float flicker = 0.75 + 0.25 * sin(uTime * 0.8 + vUv.x * 9.0);
            gl_FragColor = vec4(vec3(0.85, 0.97, 1.0), edge * depth * flicker * 0.16);
          }`,
      }),
    [],
  );
  const rays = useMemo(() => {
    const r = rng(23);
    return Array.from({ length: 9 }, () => ({
      x: (r.next() - 0.5) * 30,
      z: -6 - r.next() * 16,
      w: 1.2 + r.next() * 2.2,
      tilt: 0.25 + r.next() * 0.2,
    }));
  }, []);
  useFrame((_, dt) => void (material.uniforms.uTime!.value += dt));
  return (
    <group>
      {rays.map((ray, k) => (
        <mesh key={k} position={[ray.x, 9, ray.z]} rotation={[0, 0, ray.tilt]} material={material}>
          <planeGeometry args={[ray.w, 22]} />
        </mesh>
      ))}
    </group>
  );
}

/** Coral clusters ringing the tile: branching corals (instanced cylinders), boulder corals, rocks. */
function Corals() {
  const { branches, boulders, rocks } = useMemo(() => {
    const r = rng(31);
    const branches: { m: THREE.Matrix4; c: THREE.Color }[] = [];
    const boulders: { m: THREE.Matrix4; c: THREE.Color }[] = [];
    const rocks: { m: THREE.Matrix4; c: THREE.Color }[] = [];
    const palette = ['#ff6f91', '#ff9671', '#ffc75f', '#c780e8', '#f9f871', '#ff8fab', '#7ae0ff'];
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const branch = (base: THREE.Vector3, dir: THREE.Vector3, len: number, rad: number, depth: number, color: THREE.Color) => {
      const mid = base.clone().addScaledVector(dir, len / 2);
      q.setFromUnitVectors(up, dir);
      branches.push({ m: new THREE.Matrix4().compose(mid, q.clone(), new THREE.Vector3(rad, len, rad)), c: color });
      if (depth === 0) return;
      const tip = base.clone().addScaledVector(dir, len);
      const kids = 2 + Math.floor(r.next() * 2);
      for (let k = 0; k < kids; k++) {
        const d = dir.clone().add(new THREE.Vector3((r.next() - 0.5) * 1.3, 0.35 + r.next() * 0.3, (r.next() - 0.5) * 1.3)).normalize();
        branch(tip, d, len * (0.62 + r.next() * 0.2), rad * 0.72, depth - 1, color);
      }
    };
    for (let k = 0; k < 46; k++) {
      // A ring around the tile, leaving the platform and the camera's view of it clear.
      const a = r.next() * Math.PI * 2;
      const dist = 7.5 + r.next() * 20;
      const pos = new THREE.Vector3(Math.cos(a) * dist * 1.1, -0.3, Math.sin(a) * dist * 0.8 - (Math.sin(a) > 0.6 ? 0 : 2));
      if (Math.abs(pos.x) < HALF_X + 2.5 && Math.abs(pos.z) < HALF_Z + 2.5) continue;
      const color = new THREE.Color(palette[Math.floor(r.next() * palette.length)]);
      const kind = r.next();
      if (kind < 0.5) branch(pos, new THREE.Vector3(0, 1, 0), 0.9 + r.next() * 0.9, 0.09 + r.next() * 0.06, 3, color);
      else if (kind < 0.8) {
        const s = 0.7 + r.next() * 1.4;
        boulders.push({ m: new THREE.Matrix4().compose(pos, new THREE.Quaternion(), new THREE.Vector3(s * 1.2, s * 0.7, s)), c: color.clone().lerp(new THREE.Color('#ffe2b8'), 0.35) });
      } else {
        const s = 0.6 + r.next() * 1.6;
        rocks.push({
          m: new THREE.Matrix4().compose(pos, new THREE.Quaternion().setFromEuler(new THREE.Euler(r.next(), r.next() * 6, r.next())), new THREE.Vector3(s, s * 0.6, s * 0.9)),
          c: new THREE.Color('#8a7fa0').lerp(new THREE.Color('#5f8f8a'), r.next()),
        });
      }
    }
    return { branches, boulders, rocks };
  }, []);

  const fill = (mesh: THREE.InstancedMesh | null, items: { m: THREE.Matrix4; c: THREE.Color }[]) => {
    if (!mesh) return;
    items.forEach((it, k) => {
      mesh.setMatrixAt(k, it.m);
      mesh.setColorAt(k, it.c);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  };

  return (
    <group>
      <instancedMesh ref={(m) => fill(m, branches)} args={[undefined, undefined, branches.length]} castShadow>
        <cylinderGeometry args={[0.7, 1, 1, 7]} />
        <meshStandardMaterial roughness={0.6} />
      </instancedMesh>
      <instancedMesh ref={(m) => fill(m, boulders)} args={[undefined, undefined, boulders.length]}>
        <icosahedronGeometry args={[1, 3]} />
        <meshStandardMaterial roughness={0.85} />
      </instancedMesh>
      <instancedMesh ref={(m) => fill(m, rocks)} args={[undefined, undefined, rocks.length]}>
        <dodecahedronGeometry args={[1, 0]} />
        <meshStandardMaterial roughness={1} flatShading />
      </instancedMesh>
    </group>
  );
}

/** Seagrass: instanced blades bending in a gentle surge (vertex shader). */
function Seagrass() {
  const count = 900;
  const material = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ color: '#4fc46a', roughness: 0.7, side: THREE.DoubleSide });
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = { value: 0 };
      m.userData.shader = shader;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
           float h = position.y;
           vec4 wp = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
           float sway = sin(uTime * 1.2 + wp.x * 0.4 + wp.z * 0.3) * 0.35 + sin(uTime * 2.3 + wp.z) * 0.08;
           transformed.x += sway * h * h;
           transformed.z += sway * 0.4 * h * h;`,
        );
    };
    return m;
  }, []);
  const ref = useRef<THREE.InstancedMesh>(null);
  const placed = useRef(false);
  useFrame((_, dt) => {
    const shader = material.userData.shader as { uniforms: { uTime: { value: number } } } | undefined;
    if (shader) shader.uniforms.uTime.value += dt;
    if (placed.current || !ref.current) return;
    placed.current = true;
    const r = rng(41);
    const m = new THREE.Matrix4();
    const color = new THREE.Color();
    let k = 0;
    while (k < count) {
      // Patches of grass, away from the platform.
      const cx = (r.next() - 0.5) * 50;
      const cz = (r.next() - 0.5) * 40 - 4;
      if (Math.abs(cx) < HALF_X + 2 && Math.abs(cz) < HALF_Z + 2) continue;
      for (let j = 0; j < 30 && k < count; j++, k++) {
        const x = cx + (r.next() - 0.5) * 3;
        const z = cz + (r.next() - 0.5) * 3;
        const h = 0.6 + r.next() * 1.4;
        m.compose(new THREE.Vector3(x, -0.3, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, r.next() * Math.PI, 0)), new THREE.Vector3(1, h, 1));
        ref.current.setMatrixAt(k, m);
        ref.current.setColorAt(k, color.set('#3fb860').lerp(new THREE.Color('#a8e86a'), r.next() * 0.6));
      }
    }
    ref.current.instanceMatrix.needsUpdate = true;
    if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true;
  });
  const geometry = useMemo(() => {
    const g = new THREE.PlaneGeometry(0.08, 1, 1, 6);
    g.translate(0, 0.5, 0);
    return g;
  }, []);
  return <instancedMesh ref={ref} args={[geometry, material, count]} />;
}

/** Little fish: three schools circling at different heights. */
function Fish() {
  const schools = useMemo(() => {
    const r = rng(53);
    return [
      { color: '#ffd23f', n: 14, radius: 13, y: 3.2, speed: 0.22, size: 0.22 },
      { color: '#3ec9ff', n: 18, radius: 18, y: 5.5, speed: -0.16, size: 0.18 },
      { color: '#ff7a6b', n: 10, radius: 9.5, y: 6.8, speed: 0.3, size: 0.25 },
    ].map((s) => ({ ...s, offsets: Array.from({ length: s.n }, () => [r.next() * Math.PI * 2 * 0.35, (r.next() - 0.5) * 1.6, (r.next() - 0.5) * 1.8, r.next() * 6] as const) }));
  }, []);
  const geometry = useMemo(() => {
    // A body (squashed sphere) and a tail fin, merged by hand into one geometry.
    const body = new THREE.SphereGeometry(1, 10, 8);
    body.scale(1.6, 0.8, 0.45);
    const tail = new THREE.BufferGeometry();
    tail.setAttribute('position', new THREE.Float32BufferAttribute([-1.4, 0, 0, -2.5, 0.7, 0, -2.5, -0.7, 0], 3));
    tail.computeVertexNormals();
    const merged = new THREE.BufferGeometry();
    const a = body.toNonIndexed().getAttribute('position').array as Float32Array;
    const b = tail.getAttribute('position').array as Float32Array;
    merged.setAttribute('position', new THREE.Float32BufferAttribute([...a, ...b], 3));
    merged.computeVertexNormals();
    return merged;
  }, []);
  const refs = useRef<(THREE.InstancedMesh | null)[]>([]);
  const m = useMemo(() => new THREE.Matrix4(), []);
  const q = useMemo(() => new THREE.Quaternion(), []);
  const e = useMemo(() => new THREE.Euler(), []);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    schools.forEach((s, si) => {
      const mesh = refs.current[si];
      if (!mesh) return;
      s.offsets.forEach(([phase, dy, dr, wob], k) => {
        const a = t * s.speed + phase;
        const rad = s.radius + dr;
        const x = Math.cos(a) * rad;
        const z = Math.sin(a) * rad * 0.7 - 4;
        const y = s.y + dy + Math.sin(t * 1.3 + wob) * 0.15;
        // Face along the path; a little tail wiggle as yaw.
        e.set(0, -a + (s.speed > 0 ? -Math.PI / 2 : Math.PI / 2) + Math.sin(t * 8 + wob) * 0.12, 0);
        q.setFromEuler(e);
        m.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(s.size, s.size, s.size));
        mesh.setMatrixAt(k, m);
      });
      mesh.instanceMatrix.needsUpdate = true;
    });
  });
  return (
    <group>
      {schools.map((s, si) => (
        <instancedMesh key={si} ref={(el) => void (refs.current[si] = el)} args={[geometry, undefined, s.n]}>
          <meshStandardMaterial color={s.color} roughness={0.35} metalness={0.15} side={THREE.DoubleSide} />
        </instancedMesh>
      ))}
    </group>
  );
}

/** Bubble streams from a few vents, rising and wobbling. */
function BubbleStreams() {
  const n = 70;
  const ref = useRef<THREE.InstancedMesh>(null);
  const state = useMemo(() => {
    const r = rng(61);
    const vents = [[-9, -6], [11, -9], [-14, 4], [7, 7]] as const;
    return Array.from({ length: n }, (_, k) => {
      const [vx, vz] = vents[k % vents.length]!;
      return { x: vx + (r.next() - 0.5) * 0.4, z: vz + (r.next() - 0.5) * 0.4, y: r.next() * 14, speed: 0.6 + r.next() * 0.8, size: 0.04 + r.next() * 0.09, wob: r.next() * 6 };
    });
  }, []);
  const m = useMemo(() => new THREE.Matrix4(), []);
  useFrame(({ clock }, dt) => {
    if (!ref.current) return;
    const t = clock.elapsedTime;
    state.forEach((b, k) => {
      b.y += b.speed * dt;
      if (b.y > 14) b.y = 0;
      const s = b.size * (1 + b.y * 0.04);
      m.makeScale(s, s, s).setPosition(b.x + Math.sin(t * 2 + b.wob) * 0.12, b.y - 0.3, b.z + Math.cos(t * 1.7 + b.wob) * 0.1);
      ref.current!.setMatrixAt(k, m);
    });
    ref.current.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, n]}>
      <sphereGeometry args={[1, 12, 10]} />
      <meshPhysicalMaterial color="#e8fbff" transparent opacity={0.45} roughness={0.05} metalness={0} clearcoat={1} />
    </instancedMesh>
  );
}

/** Marine snow: tiny specks drifting through the water. */
function Plankton() {
  const ref = useRef<THREE.Points>(null);
  const geometry = useMemo(() => {
    const r = rng(71);
    const n = 1400;
    const pos = new Float32Array(n * 3);
    for (let k = 0; k < n; k++) {
      pos[k * 3] = (r.next() - 0.5) * 50;
      pos[k * 3 + 1] = r.next() * 14;
      pos[k * 3 + 2] = (r.next() - 0.5) * 44;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    return g;
  }, []);
  useFrame(({ clock }) => {
    if (ref.current) {
      ref.current.position.x = Math.sin(clock.elapsedTime * 0.05) * 1.5;
      ref.current.position.y = Math.sin(clock.elapsedTime * 0.11) * 0.4;
    }
  });
  return (
    <points ref={ref} geometry={geometry}>
      <pointsMaterial color="#dff8ff" size={0.035} transparent opacity={0.55} depthWrite={false} />
    </points>
  );
}

/** The glazed platform the player builds on, with a 2.5 mm grid and a raised rim. */
export function Platform() {
  const grid = useMemo(
    () =>
      canvasTexture(512, (c) => {
        // 96 x 48 voxels on a 2:1 platform: a line every 5 voxels (2.5 mm), bolder every 20 (1 cm).
        c.fillStyle = '#f4fbff';
        c.fillRect(0, 0, 512, 512);
        for (let v = 0; v <= 96; v += 5) {
          const x = (v / 96) * 512;
          c.strokeStyle = v % 20 === 0 ? 'rgba(10,123,184,0.45)' : 'rgba(10,123,184,0.16)';
          c.lineWidth = v % 20 === 0 ? 2 : 1;
          c.beginPath();
          c.moveTo(x, 0);
          c.lineTo(x, 512);
          c.stroke();
        }
        for (let v = 0; v <= 48; v += 5) {
          const y = (v / 48) * 512;
          c.strokeStyle = v % 20 === 0 ? 'rgba(10,123,184,0.45)' : 'rgba(10,123,184,0.16)';
          c.lineWidth = v % 20 === 0 ? 2 : 1;
          c.beginPath();
          c.moveTo(0, y);
          c.lineTo(512, y);
          c.stroke();
        }
      }),
    [],
  );
  return (
    <group>
      <mesh position={[0, -0.16, 0]} receiveShadow>
        <boxGeometry args={[HALF_X * 2 + 0.5, 0.3, HALF_Z * 2 + 0.5]} />
        <meshPhysicalMaterial color="#e9f7ff" roughness={0.25} clearcoat={1} clearcoatRoughness={0.15} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position-y={0.001} receiveShadow>
        <planeGeometry args={[HALF_X * 2, HALF_Z * 2]} />
        <meshPhysicalMaterial map={grid} roughness={0.3} clearcoat={0.8} />
      </mesh>
    </group>
  );
}

/** Lights, fog and every decoration. */
export function Ocean() {
  return (
    <>
      <color attach="background" args={[WATER]} />
      <fogExp2 attach="fog" args={[FOG, 0.03]} />
      <hemisphereLight args={['#c8f2ff', '#0b5470', 1.1]} />
      <directionalLight position={[6, 18, 8]} intensity={1.7} color="#fff8e6" castShadow shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-8} shadow-camera-right={8} shadow-camera-top={8} shadow-camera-bottom={-8} />
      <Seabed />
      <Caustics />
      <LightRays />
      <Corals />
      <Seagrass />
      <Fish />
      <BubbleStreams />
      <Plankton />
    </>
  );
}
