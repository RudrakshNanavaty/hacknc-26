// Water around the camera (artwork): the surface seen from below, shafts of sunlight and drifting
// marine snow. Everything follows the camera, so it works at any world scale.
import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { rng } from '@shared';

export function WaterFx({ surface, scale }: { surface: number; scale: number }) {
  const { camera } = useThree();
  const surfaceMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        uniforms: { uTime: { value: 0 } },
        vertexShader: /* glsl */ `varying vec3 vP; void main() { vP = (modelMatrix * vec4(position, 1.0)).xyz; gl_Position = projectionMatrix * viewMatrix * vec4(vP, 1.0); }`,
        fragmentShader: /* glsl */ `
          uniform float uTime; varying vec3 vP;
          void main() {
            vec2 p = vP.xz * 0.35;
            float w = sin(p.x * 2.1 + uTime * 0.8) * sin(p.y * 1.7 - uTime * 0.6) + sin((p.x - p.y) * 3.3 + uTime * 1.3) * 0.5;
            float glint = pow(max(0.0, w), 3.0);
            gl_FragColor = vec4(mix(vec3(0.55, 0.88, 1.0), vec3(1.0), glint), 0.38 + glint * 0.4);
          }`,
      }),
    [],
  );
  const rayMat = useMemo(
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
            float edge = smoothstep(0.0, 0.4, vUv.x) * smoothstep(1.0, 0.6, vUv.x);
            float fade = smoothstep(0.0, 1.0, vUv.y);
            float flicker = 0.7 + 0.3 * sin(uTime * 0.7 + vUv.x * 7.0);
            gl_FragColor = vec4(vec3(0.85, 0.97, 1.0), edge * fade * flicker * 0.11);
          }`,
      }),
    [],
  );
  const rays = useMemo(() => {
    const r = rng(17);
    return Array.from({ length: 10 }, () => ({ x: (r.next() - 0.5) * 30, z: (r.next() - 0.5) * 30, w: 1 + r.next() * 2.5, tilt: 0.15 + r.next() * 0.2, len: 10 + r.next() * 8 }));
  }, []);
  const snow = useMemo(() => {
    const r = rng(29);
    const n = 1200;
    const pos = new Float32Array(n * 3);
    for (let k = 0; k < n; k++) pos.set([(r.next() - 0.5) * 16, (r.next() - 0.5) * 10, (r.next() - 0.5) * 16], k * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    return g;
  }, []);
  const surfaceRef = useRef<THREE.Mesh>(null);
  const raysRef = useRef<THREE.Group>(null);
  const snowRef = useRef<THREE.Points>(null);

  useFrame((_, dt) => {
    surfaceMat.uniforms.uTime!.value += dt;
    rayMat.uniforms.uTime!.value += dt;
    const c = camera.position;
    if (surfaceRef.current) surfaceRef.current.position.set(c.x, surface, c.z);
    if (raysRef.current) raysRef.current.position.set(c.x, surface, c.z);
    if (snowRef.current) {
      // Snow wraps around the camera in a box, drifting slowly.
      const cell = 16 * scale;
      snowRef.current.position.set(Math.floor(c.x / cell) * cell, c.y + Math.sin(performance.now() / 9000) * 0.3 * scale, Math.floor(c.z / cell) * cell);
    }
  });

  return (
    <group>
      <mesh ref={surfaceRef} rotation-x={Math.PI / 2} material={surfaceMat} renderOrder={-1}>
        <planeGeometry args={[400 * scale, 400 * scale]} />
      </mesh>
      <group ref={raysRef} scale={[scale, scale, scale]}>
        {rays.map((r, k) => (
          <mesh key={k} position={[r.x, -r.len / 2, r.z]} rotation={[0, k, r.tilt]} material={rayMat}>
            <planeGeometry args={[r.w, r.len]} />
          </mesh>
        ))}
      </group>
      <points ref={snowRef} geometry={snow} scale={[scale, scale, scale]} raycast={() => null}>
        <pointsMaterial color="#e6fbff" size={0.02 * scale} transparent opacity={0.6} depthWrite={false} sizeAttenuation />
      </points>
    </group>
  );
}
