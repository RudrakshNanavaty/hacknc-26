// Free swimming: look by dragging (mouse or a finger on the right of the screen), move with
// WASD / arrows, rise with Space or E, sink with Shift or Q; on touch, a joystick on the left.
// The camera never goes through the seabed, above the surface, or outside the surveyed area.
import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { Terrain } from './terrain';

export interface SwimTarget {
  /** Fly the camera to look at a point from a distance; resolves when it arrives. */
  position: THREE.Vector3;
  lookAt: THREE.Vector3;
}

export interface SwimControls {
  /** Joystick input from the HUD, -1..1 each. */
  stick: { x: number; y: number };
  /** Vertical input from HUD buttons, -1..1. */
  lift: number;
  /** A flight in progress (approach a device, the arrival descent). */
  flight: { from: THREE.Vector3; to: THREE.Vector3; look: THREE.Vector3; t: number; duration: number; done?: () => void } | null;
  yaw: number;
  pitch: number;
  enabled: boolean;
}

export function useSwimControls() {
  return useRef<SwimControls>({ stick: { x: 0, y: 0 }, lift: 0, flight: null, yaw: 0, pitch: -0.25, enabled: true });
}

export function flyTo(c: SwimControls, camera: THREE.Camera, to: THREE.Vector3, look: THREE.Vector3, duration = 1.6, done?: () => void) {
  c.flight = { from: camera.position.clone(), to, look, t: 0, duration, done };
}

export function Swim({ terrain, controls, speed, clearance, surface }: {
  terrain: Terrain;
  controls: React.MutableRefObject<SwimControls>;
  speed: number;
  clearance: number;
  surface: number;
}) {
  const { camera, gl } = useThree();
  const keys = useRef(new Set<string>());
  const velocity = useRef(new THREE.Vector3());
  const boost = useRef(1);

  useEffect(() => {
    const el = gl.domElement;
    const down = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input, textarea, select')) return;
      keys.current.add(e.key.toLowerCase());
      if ([' ', 'arrowup', 'arrowdown'].includes(e.key.toLowerCase())) e.preventDefault();
    };
    const up = (e: KeyboardEvent) => keys.current.delete(e.key.toLowerCase());
    let drag: { id: number; x: number; y: number } | null = null;
    const pd = (e: PointerEvent) => {
      // Touch: the left third of the screen belongs to the HUD joystick.
      if (e.pointerType === 'touch' && e.clientX < window.innerWidth / 3) return;
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
    };
    const pm = (e: PointerEvent) => {
      if (!drag || drag.id !== e.pointerId || !controls.current.enabled) return;
      const c = controls.current;
      c.yaw -= (e.clientX - drag.x) * 0.0042;
      c.pitch = Math.max(-1.45, Math.min(1.2, c.pitch - (e.clientY - drag.y) * 0.0042));
      drag.x = e.clientX;
      drag.y = e.clientY;
    };
    const pu = (e: PointerEvent) => {
      if (drag?.id === e.pointerId) drag = null;
    };
    const wheel = (e: WheelEvent) => {
      boost.current = Math.max(0.25, Math.min(4, boost.current * (e.deltaY > 0 ? 0.9 : 1.1)));
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    el.addEventListener('pointerdown', pd);
    window.addEventListener('pointermove', pm);
    window.addEventListener('pointerup', pu);
    el.addEventListener('wheel', wheel, { passive: true });
    const blur = () => keys.current.clear();
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      el.removeEventListener('pointerdown', pd);
      window.removeEventListener('pointermove', pm);
      window.removeEventListener('pointerup', pu);
      el.removeEventListener('wheel', wheel);
      window.removeEventListener('blur', blur);
    };
  }, [gl, controls]);

  const forward = useRef(new THREE.Vector3());
  const right = useRef(new THREE.Vector3());
  const look = useRef(new THREE.Vector3());

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const c = controls.current;

    if (c.flight) {
      const f = c.flight;
      f.t = Math.min(1, f.t + dt / f.duration);
      const e = f.t < 0.5 ? 4 * f.t ** 3 : 1 - (-2 * f.t + 2) ** 3 / 2;
      camera.position.lerpVectors(f.from, f.to, e);
      camera.lookAt(f.look);
      // Keep yaw/pitch in sync so swimming continues smoothly from here.
      const d = f.look.clone().sub(camera.position).normalize();
      c.yaw = Math.atan2(-d.x, -d.z);
      c.pitch = Math.asin(Math.max(-1, Math.min(1, d.y)));
      if (f.t >= 1) {
        c.flight = null;
        f.done?.();
      }
      return;
    }

    const k = keys.current;
    const ix = (k.has('d') || k.has('arrowright') ? 1 : 0) - (k.has('a') || k.has('arrowleft') ? 1 : 0) + c.stick.x;
    const iz = (k.has('w') || k.has('arrowup') ? 1 : 0) - (k.has('s') || k.has('arrowdown') ? 1 : 0) + c.stick.y;
    const iy = (k.has(' ') || k.has('e') ? 1 : 0) - (k.has('shift') || k.has('q') ? 1 : 0) + c.lift;
    forward.current.set(-Math.sin(c.yaw) * Math.cos(c.pitch), Math.sin(c.pitch), -Math.cos(c.yaw) * Math.cos(c.pitch));
    right.current.set(Math.cos(c.yaw), 0, -Math.sin(c.yaw));
    const want = new THREE.Vector3()
      .addScaledVector(forward.current, iz)
      .addScaledVector(right.current, ix)
      .addScaledVector(new THREE.Vector3(0, 1, 0), iy);
    if (want.lengthSq() > 1) want.normalize();
    want.multiplyScalar(speed * boost.current);
    // Water is thick: ease towards the wanted velocity.
    velocity.current.lerp(want, 1 - Math.exp(-dt * 4));
    const p = camera.position.addScaledVector(velocity.current, dt);

    // Collision: stay over the survey, above the seabed, below the surface.
    const margin = Math.min(terrain.sizeX, terrain.sizeZ) * 0.02;
    p.x = Math.max(-terrain.sizeX / 2 + margin, Math.min(terrain.sizeX / 2 - margin, p.x));
    p.z = Math.max(-terrain.sizeZ / 2 + margin, Math.min(terrain.sizeZ / 2 - margin, p.z));
    const floor = terrain.heightAt(p.x, p.z) + clearance;
    if (p.y < floor) {
      p.y = floor;
      if (velocity.current.y < 0) velocity.current.y = 0;
    }
    p.y = Math.min(p.y, surface - clearance * 0.5);

    look.current.copy(p).add(forward.current);
    camera.lookAt(look.current);
  });
  return null;
}
