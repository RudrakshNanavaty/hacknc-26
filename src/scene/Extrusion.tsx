/**
 * Decorative 3D extrusion of the 2D profile. It is NOT what was simulated:
 * the simulation is the 2D cross-section only. The UI labels it accordingly.
 */
import { Canvas, useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { ExtrudeGeometry, Group, Shape } from "three";
import type { Profile } from "../contracts";
import { surfaceHeights } from "../geometry/mask";
import { tokenColor } from "./cssColor";

function Slab({ profile, nx, animate }: { profile: Profile; nx: number; animate: boolean }) {
  const group = useRef<Group>(null);
  const geometry = useMemo(() => {
    const s = surfaceHeights(profile, nx);
    const shape = new Shape();
    shape.moveTo(0, 0);
    for (let x = 0; x < nx; x++) {
      shape.lineTo(x, s[x]!);
      shape.lineTo(x + 1, s[x]!);
    }
    shape.lineTo(nx, 0);
    shape.closePath();
    const g = new ExtrudeGeometry(shape, { depth: 60, bevelEnabled: false });
    g.center();
    return g;
  }, [profile, nx]);
  const sand = useMemo(() => tokenColor("--c-sand-300"), []);
  useFrame((_, dt) => {
    if (animate && group.current) group.current.rotation.y += dt * 0.25;
  });
  return (
    <group ref={group} rotation={[0.45, -0.6, 0]} scale={0.045}>
      <mesh geometry={geometry}>
        <meshStandardMaterial color={sand} roughness={0.85} />
      </mesh>
    </group>
  );
}

export function Extrusion({ profile, nx, animate }: { profile: Profile; nx: number; animate: boolean }) {
  return (
    <Canvas frameloop={animate ? "always" : "demand"} dpr={[1, 1.5]} camera={{ position: [0, 2.2, 6], fov: 40 }} gl={{ powerPreference: "low-power" }}>
      <ambientLight intensity={0.7} />
      <directionalLight position={[3, 6, 4]} intensity={1.4} />
      <Slab profile={profile} nx={nx} animate={animate} />
    </Canvas>
  );
}
