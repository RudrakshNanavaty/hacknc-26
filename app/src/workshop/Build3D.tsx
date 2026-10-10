// The design in 3D, and building on it. Voxels are one instanced mesh (a glazed tile per voxel);
// the placement preview is a ghost of the candidate piece, green when it fits and red when not.
// Pointer: hover aims, a click (not a camera drag) places, moves or selects.
import { useEffect, useMemo, useRef } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { useShallow } from 'zustand/react/shallow';
import { MATERIAL_BUDGET, pieceCells, type Piece } from '@shared';
import { candidateOf, useBuild } from './store';
import { HALF_X, HALF_Z, NX, NY, NZ, PIECE_COLOR, S, inTile, toCell, toWorld } from './space';

/** A click is a click only if the pointer barely moved (otherwise the camera was being dragged). */
const CLICK_PX = 6;
const box = new THREE.BoxGeometry(S * 0.94, S * 0.94, S * 0.94);

/** Voxel cells of a piece list, with the owning piece of each instance. */
function cellsOf(pieces: readonly Piece[]) {
  const cells: { x: number; y: number; z: number; piece: Piece }[] = [];
  for (const piece of pieces) for (const [x, y, z] of pieceCells(piece)) cells.push({ x, y, z, piece });
  return cells;
}

export function Voxels({ pieces, selected = null, interactive = false }: { pieces: readonly Piece[]; selected?: string | null; interactive?: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  // Imported designs are budget-checked, so the budget is the most voxels a design can have.
  const cells = useMemo(() => cellsOf(pieces).slice(0, MATERIAL_BUDGET), [pieces]);

  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    const c = new THREE.Color();
    const shade = new THREE.Color('#ffffff');
    cells.forEach((cell, k) => {
      const [x, y, z] = toWorld(cell.x + 0.5, cell.y + 0.5, cell.z + 0.5);
      m.makeTranslation(x, y, z);
      mesh.setMatrixAt(k, m);
      // Lighter towards the top, a little per-voxel variation, the selection glows gold.
      c.set(PIECE_COLOR[cell.piece.kind]).lerp(shade, 0.12 + (cell.y / NY) * 0.18 + (((cell.x * 7 + cell.z * 13 + cell.y * 5) % 9) / 9) * 0.06);
      if (cell.piece.id === selected) c.lerp(new THREE.Color('#ffe066'), 0.65);
      mesh.setColorAt(k, c);
    });
    mesh.count = cells.length;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [cells, selected]);

  const onMove = (e: ThreeEvent<PointerEvent>) => {
    if (!interactive || e.instanceId === undefined) return;
    e.stopPropagation();
    const cell = cells[e.instanceId];
    const n = e.face?.normal;
    if (!cell || !n) return;
    // Aim at the empty cell next to the face under the pointer.
    const target: [number, number, number] = [cell.x + Math.round(n.x), cell.y + Math.round(n.y), cell.z + Math.round(n.z)];
    useBuild.getState().setHover(inTile(...target) ? target : null);
  };
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (!interactive || e.delta > CLICK_PX || e.instanceId === undefined) return;
    e.stopPropagation();
    const s = useBuild.getState();
    const cell = cells[e.instanceId];
    if (s.tool === 'select' && !s.moving) s.select(cell?.piece.id ?? null);
    else s.commit();
  };

  return (
    <instancedMesh
      ref={ref}
      args={[box, undefined, MATERIAL_BUDGET]}
      castShadow
      receiveShadow
      onPointerMove={onMove}
      onClick={onClick}
    >
      <meshPhysicalMaterial roughness={0.28} clearcoat={0.9} clearcoatRoughness={0.2} />
    </instancedMesh>
  );
}

/** The invisible build plane over the tile floor: aiming at y = 0. */
export function BuildPlane() {
  const onMove = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    const [x, , z] = toCell(e.point.x, 0, e.point.z);
    useBuild.getState().setHover(x >= 0 && z >= 0 && x < NX && z < NZ ? [x, 0, z] : null);
  };
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > CLICK_PX) return;
    e.stopPropagation();
    const s = useBuild.getState();
    if (s.tool === 'select' && !s.moving) s.select(null);
    else s.commit();
  };
  return (
    <mesh rotation-x={-Math.PI / 2} position-y={0.002} onPointerMove={onMove} onClick={onClick} onPointerOut={() => useBuild.getState().setHover(null)}>
      <planeGeometry args={[HALF_X * 2, HALF_Z * 2]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
    </mesh>
  );
}

/** The ghost of the piece the next click would place. */
export function Preview() {
  // Subscribe to the raw inputs (stable references) and derive the candidate here: a selector that
  // returns a fresh object every call makes zustand re-render forever.
  const inputs = useBuild(useShallow((s) => ({ pieces: s.pieces, tool: s.tool, rot: s.rot, fine: s.fine, selected: s.selected, moving: s.moving, hover: s.hover })));
  const candidate = useMemo(() => candidateOf(inputs), [inputs]);
  const ref = useRef<THREE.InstancedMesh>(null);
  const cells = useMemo(() => (candidate ? pieceCells(candidate.piece) : []), [candidate]);
  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    cells.forEach(([x, y, z], k) => {
      m.makeTranslation(...toWorld(x + 0.5, y + 0.5, z + 0.5));
      mesh.setMatrixAt(k, m);
    });
    mesh.count = cells.length;
    mesh.instanceMatrix.needsUpdate = true;
  }, [cells]);
  if (!candidate) return null;
  const ok = !candidate.problem;
  return (
    <instancedMesh ref={ref} args={[box, undefined, 2400]} raycast={() => null} renderOrder={2}>
      <meshBasicMaterial color={ok ? '#8dff6a' : '#ff5a5a'} transparent opacity={ok ? 0.45 : 0.5} depthWrite={false} />
    </instancedMesh>
  );
}

/** A glowing arrow above the tile showing which way the water is pushing right now. */
export function CurrentArrow({ direction }: { direction: number }) {
  const ref = useRef<THREE.Group>(null);
  useEffect(() => {
    if (!ref.current) return;
    ref.current.scale.set(Math.sign(direction) || 1, 1, 1);
    ref.current.visible = Math.abs(direction) > 0.05;
    const mat = (ref.current.children[0] as THREE.Mesh).material as THREE.MeshBasicMaterial;
    mat.opacity = 0.25 + Math.min(1, Math.abs(direction)) * 0.45;
  }, [direction]);
  return (
    <group ref={ref} position={[0, NY * S * 2 + 0.4, -HALF_Z - 0.2]}>
      <mesh rotation-z={-Math.PI / 2} position-x={HALF_X * 0.9}>
        <coneGeometry args={[0.35, 0.8, 18]} />
        <meshBasicMaterial color="#e8fbff" transparent opacity={0.6} />
      </mesh>
      <mesh rotation-z={-Math.PI / 2}>
        <cylinderGeometry args={[0.1, 0.1, HALF_X * 1.6, 12]} />
        <meshBasicMaterial color="#e8fbff" transparent opacity={0.45} />
      </mesh>
    </group>
  );
}
