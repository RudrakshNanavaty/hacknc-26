// Devices in the world at true scale (a 48 x 24 mm tile of 0.5 mm voxels), each with a glowing
// beacon so it can be found from afar, plus the placement cursor in deploy mode.
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { BUILD_GRID, VOXEL_MM, pieceCells, type Piece } from '@shared';
import { PIECE_COLOR } from '../workshop/space';
import { DEVICE_SIZE_M, type Device, type PlacementCheck } from './devices';

const V = VOXEL_MM / 1000;
const voxel = new THREE.BoxGeometry(V * 0.96, V * 0.96, V * 0.96);

/** A device's voxels and base, in metres, centred on its footprint, floor at y = 0. */
function DeviceModel({ pieces, highlight }: { pieces: Piece[]; highlight: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const cells = useMemo(() => pieces.flatMap((p) => pieceCells(p).map((c) => ({ c, kind: p.kind }))), [pieces]);
  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    const col = new THREE.Color();
    cells.forEach(({ c: [x, y, z], kind }, k) => {
      m.makeTranslation((x + 0.5 - BUILD_GRID.nx / 2) * V, (y + 0.5) * V + 0.002, (z + 0.5 - BUILD_GRID.nz / 2) * V);
      mesh.setMatrixAt(k, m);
      mesh.setColorAt(k, col.set(PIECE_COLOR[kind]));
    });
    mesh.count = cells.length;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [cells]);
  return (
    <group>
      <mesh position={[0, 0.001, 0]} castShadow receiveShadow>
        <boxGeometry args={[DEVICE_SIZE_M.x, 0.002, DEVICE_SIZE_M.z]} />
        <meshPhysicalMaterial color={highlight ? '#fff6c8' : '#e9f7ff'} roughness={0.3} clearcoat={1} />
      </mesh>
      <instancedMesh ref={ref} args={[voxel, undefined, Math.max(1, cells.length)]} castShadow>
        <meshPhysicalMaterial roughness={0.3} clearcoat={0.8} />
      </instancedMesh>
    </group>
  );
}

/** A soft column of light and a ring on the seabed, sized to the world. */
function Beacon({ scale, color, label, selected, onClick }: { scale: number; color: string; label: string; selected: boolean; onClick?: () => void }) {
  const ring = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (!ring.current) return;
    const s = 1 + 0.15 * Math.sin(clock.elapsedTime * 2.2);
    ring.current.scale.set(s, s, s);
  });
  return (
    <group>
      <mesh ref={ring} rotation-x={-Math.PI / 2} position-y={0.004} onClick={(e) => (e.stopPropagation(), onClick?.())}>
        <ringGeometry args={[0.1 * scale, 0.13 * scale, 40]} />
        <meshBasicMaterial color={color} transparent opacity={0.85} depthWrite={false} />
      </mesh>
      <mesh position-y={0.75 * scale} raycast={() => null}>
        <cylinderGeometry args={[0.02 * scale, 0.06 * scale, 1.5 * scale, 16, 1, true]} />
        <meshBasicMaterial color={color} transparent opacity={selected ? 0.35 : 0.18} depthWrite={false} blending={THREE.AdditiveBlending} side={THREE.DoubleSide} />
      </mesh>
      <Html position={[0, 1.6 * scale, 0]} center distanceFactor={undefined} zIndexRange={[10, 0]}>
        <button
          onClick={onClick}
          className={`glass px-2.5 py-0.5 text-[12px] font-extrabold whitespace-nowrap ${selected ? 'outline-2 outline-sun' : ''}`}
          style={{ borderRadius: 999, fontFamily: 'var(--font-display)' }}
        >
          {label}
        </button>
      </Html>
    </group>
  );
}

export function Devices3D({ devices, selected, beaconScale, onSelect }: { devices: Device[]; selected: string | null; beaconScale: number; onSelect: (id: string) => void }) {
  return (
    <group>
      {devices.map((d) => (
        <group key={d.id} position={[d.x, d.y, d.z]} rotation-y={d.yaw}>
          <DeviceModel pieces={d.pieces} highlight={d.id === selected} />
          <Beacon scale={beaconScale} color={d.id === selected ? '#ffe066' : '#8dff6a'} label={d.name} selected={d.id === selected} onClick={() => onSelect(d.id)} />
        </group>
      ))}
    </group>
  );
}

/** The deploy cursor: the device footprint on the ground, green when the checks pass, red when not. */
export function DeployCursor({ at, yaw, check, beaconScale }: { at: THREE.Vector3 | null; yaw: number; check: PlacementCheck | null; beaconScale: number }) {
  if (!at || !check) return null;
  const color = check.ok ? '#8dff6a' : '#ff5a5a';
  return (
    <group position={[at.x, at.y + 0.003, at.z]} rotation-y={yaw}>
      <mesh rotation-x={-Math.PI / 2} raycast={() => null}>
        <planeGeometry args={[DEVICE_SIZE_M.x, DEVICE_SIZE_M.z]} />
        <meshBasicMaterial color={color} transparent opacity={0.65} depthWrite={false} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} raycast={() => null}>
        <ringGeometry args={[0.1 * beaconScale, 0.12 * beaconScale, 40]} />
        <meshBasicMaterial color={color} transparent opacity={0.8} depthWrite={false} />
      </mesh>
      <mesh position-y={0.5 * beaconScale} raycast={() => null}>
        <cylinderGeometry args={[0.01 * beaconScale, 0.01 * beaconScale, beaconScale, 8]} />
        <meshBasicMaterial color={color} transparent opacity={0.6} />
      </mesh>
    </group>
  );
}
