/**
 * Decorative underwater backdrop: caustics, light rays, bubbles and coral silhouettes.
 * Pure decoration — it never reads or writes simulation state.
 */
import { Canvas, useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { AdditiveBlending, InstancedMesh, Object3D, ShaderMaterial } from "three";
import { tokenColor } from "./cssColor";

const causticsShader = {
  uniforms: { uTime: { value: 0 }, uTop: { value: tokenColor("--c-water-top") }, uDeep: { value: tokenColor("--c-water-deep") } },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform float uTime; uniform vec3 uTop; uniform vec3 uDeep; varying vec2 vUv;
    float c(vec2 p) {
      float v = 0.0;
      for (int i = 0; i < 3; i++) {
        p = p * 1.7 + vec2(sin(p.y * 1.3 + uTime * 0.35), cos(p.x * 1.1 - uTime * 0.3));
        v += abs(sin(p.x) * sin(p.y));
      }
      return v / 3.0;
    }
    void main() {
      vec3 base = mix(uDeep, uTop, pow(vUv.y, 0.8));
      float k = pow(1.0 - c(vUv * vec2(6.0, 3.0)), 6.0) * 0.35 * vUv.y;
      gl_FragColor = vec4(base + k, 1.0);
    }
  `,
};

function Caustics({ animate }: { animate: boolean }) {
  const mat = useRef<ShaderMaterial>(null);
  useFrame((_, dt) => {
    if (animate && mat.current) mat.current.uniforms.uTime!.value += dt;
  });
  return (
    <mesh frustumCulled={false} renderOrder={-1}>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial ref={mat} args={[causticsShader]} depthWrite={false} depthTest={false} />
    </mesh>
  );
}

function LightRays() {
  const color = useMemo(() => tokenColor("--c-white"), []);
  return (
    <group position={[0, 3, -6]}>
      {[-4, -1.5, 1, 3.5].map((x, i) => (
        <mesh key={x} position={[x, 0, 0]} rotation={[0, 0, 0.25 - i * 0.05]}>
          <planeGeometry args={[0.9 + (i % 2) * 0.5, 14]} />
          <meshBasicMaterial color={color} transparent opacity={0.07} blending={AdditiveBlending} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

const BUBBLES = 40;

function Bubbles({ animate }: { animate: boolean }) {
  const ref = useRef<InstancedMesh>(null);
  const color = useMemo(() => tokenColor("--c-white"), []);
  // Decorative positions use a fixed pattern (the scene needs no randomness).
  const seeds = useMemo(
    () => Array.from({ length: BUBBLES }, (_, i) => ({ x: ((i * 37) % 100) / 100, y: ((i * 61) % 100) / 100, s: 0.03 + ((i * 13) % 7) * 0.012, v: 0.2 + ((i * 17) % 10) / 25 })),
    [],
  );
  const dummy = useMemo(() => new Object3D(), []);
  useFrame(({ clock, viewport }) => {
    const m = ref.current;
    if (!m) return;
    const t = animate ? clock.elapsedTime : 0;
    seeds.forEach((b, i) => {
      const y = ((b.y * viewport.height + t * b.v) % (viewport.height + 1)) - viewport.height / 2 - 0.5;
      dummy.position.set((b.x - 0.5) * viewport.width + Math.sin(t + i) * 0.08, y, -2);
      dummy.scale.setScalar(b.s * 4);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, BUBBLES]}>
      <sphereGeometry args={[0.1, 12, 12]} />
      <meshBasicMaterial color={color} transparent opacity={0.35} />
    </instancedMesh>
  );
}

function Corals() {
  const colors = useMemo(() => [tokenColor("--c-coral-500"), tokenColor("--c-sun-300"), tokenColor("--c-coral-200"), tokenColor("--c-leaf-500")], []);
  return (
    <group position={[0, -3.4, -3]}>
      {[-6, -4.6, -3.2, 3.4, 4.8, 6.2].map((x, i) => (
        <group key={x} position={[x, 0, 0]}>
          {[0, 1, 2].map((b) => (
            <mesh key={b} position={[(b - 1) * 0.35, 0.5 + (b % 2) * 0.4, 0]} rotation={[0, 0, (b - 1) * 0.35]}>
              <capsuleGeometry args={[0.12, 1.1 + ((i + b) % 3) * 0.3, 4, 8]} />
              <meshBasicMaterial color={colors[(i + b) % colors.length]} transparent opacity={0.55} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

export function ReefBackdrop({ animate }: { animate: boolean }) {
  return (
    <Canvas
      frameloop={animate ? "always" : "demand"}
      dpr={[1, 1.5]}
      gl={{ antialias: false, powerPreference: "low-power" }}
      camera={{ position: [0, 0, 6], fov: 60 }}
      aria-hidden="true"
    >
      <Caustics animate={animate} />
      <LightRays />
      <Corals />
      <Bubbles animate={animate} />
    </Canvas>
  );
}
