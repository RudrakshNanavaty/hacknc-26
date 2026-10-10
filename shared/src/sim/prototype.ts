// PROTOTYPE larval transport, for gameplay. Not CFD, not a settlement model, not validated.
// The validated engine (flow solver + settlement rules, checked against Levenstein et al. 2022)
// replaces this behind the same interface: runPrototype(design, params) -> trajectories + metrics.
//
// The simplified flow model, in full:
//   1. Free stream along +x. Oscillating reefs: U(t) = U0 * sin(2 pi t / T). Steady: U(t) = U0.
//      U0 and T come from the reef pack (with their provenance).
//   2. Near-surface slowdown: speed is scaled by tanh(d / delta), where d is the vertical gap from
//      the larva to the nearest surface below or above it (structure or tile floor). So water is
//      slow in grooves, under arches and inside tunnels. delta = boundaryLayerMm (game-defined).
//      There is no wake, no recirculation and no pressure: real flow around shapes needs the
//      flow solver.
//   3. Larvae swim at swimMmS in a random direction they change about once a second
//      (3 mm/s: mean of the 10 species in Levenstein et al. 2022, Table S1).
//   4. Turbulence: a random velocity kick each step, standard deviation turbulenceMmS (game-defined).
//   5. Solids: a larva cannot enter a filled voxel. The blocked component of its motion is dropped
//      (it slides along the surface) and the touch is counted as a contact.
//   6. Boundaries: periodic in x and z (as in Levenstein's simulations), the tile floor at y = 0,
//      a reflecting top at twice the tile height.
//
// Everything is in voxel units internally (VOXEL_MM per voxel) and deterministic for a seed.
import { VOXEL_MM } from '../config';
import type { Design } from '../design';
import type { Flow } from '../reefs';
import { rng } from './rng';

export const PROTOTYPE_MODEL = 'prototype-flow-0.1';

export interface PrototypeParams {
  flow: Flow;
  larvae: number;
  durationS: number;
  dt: number;
  /** Larval swimming speed, mm/s. */
  swimMmS: number;
  /** Standard deviation of the random velocity kick, mm/s. Game-defined. */
  turbulenceMmS: number;
  /** Thickness scale of the slow layer near surfaces, mm. Game-defined. */
  boundaryLayerMm: number;
  seed: number;
  /** Keep a frame for replay every this many steps. */
  frameEvery: number;
}

export function defaultParams(flow: Flow, seed: number): PrototypeParams {
  return {
    flow,
    larvae: 300,
    durationS: flow.kind === 'oscillating' && flow.periodS ? 2 * flow.periodS : 6,
    dt: 0.02,
    swimMmS: 3,
    turbulenceMmS: 1.5,
    boundaryLayerMm: 2,
    seed,
    frameEvery: 3,
  };
}

/** Quantities the prototype measured. None of them is settlement or survival. */
export interface PrototypeMetrics {
  released: number;
  /** Larvae that touched the structure at least once. */
  reachedStructure: number;
  /** Separate touches of the structure (a larva leaving and coming back counts again). */
  structureContacts: number;
  /** Larvae that touched the bare tile floor at least once. */
  reachedFloor: number;
  /** Mean seconds a larva spent next to the structure (within one voxel). */
  meanNearStructureS: number;
  /** Mean seconds a larva spent in slowed water (less than half the free-stream speed). */
  meanShelteredS: number;
  durationS: number;
}

export interface PrototypeRun {
  params: PrototypeParams;
  metrics: PrototypeMetrics;
  /** Replay: frameCount x larvae x 3 positions, in voxel units. */
  frames: Float32Array;
  /** Replay: frameCount x larvae; 1 where the larva is touching the structure. */
  contact: Uint8Array;
  frameCount: number;
  /** Seconds between frames. */
  frameDt: number;
}

/** Runs the prototype on a design. Same design + params = same run, bit for bit. */
export function runPrototype(design: Design, params: PrototypeParams): PrototypeRun {
  const { nx, ny, nz } = design.grid;
  const top = ny * 2;
  const solid = new Uint8Array(nx * ny * nz);
  for (const i of design.solid) solid[i] = 1;
  const at = (x: number, y: number, z: number) => (y < 0 || y >= ny ? 0 : solid[x + nx * (y + ny * z)]!);
  const wrap = (v: number, n: number) => ((v % n) + n) % n;

  const vox = (mmPerS: number) => mmPerS / VOXEL_MM; // mm/s -> voxels/s
  const u0 = vox(params.flow.peakCmS * 10);
  const swim = vox(params.swimMmS);
  const kick = vox(params.turbulenceMmS);
  const delta = params.boundaryLayerMm / VOXEL_MM;
  const r = rng(params.seed);
  const n = params.larvae;
  const steps = Math.round(params.durationS / params.dt);

  // Larvae start anywhere in the water above the lower quarter of the tile height, never inside a solid.
  const px = new Float64Array(n);
  const py = new Float64Array(n);
  const pz = new Float64Array(n);
  const sx = new Float64Array(n);
  const sy = new Float64Array(n);
  const sz = new Float64Array(n);
  const reorient = (k: number) => {
    // A uniform direction on the sphere.
    const zc = 2 * r.next() - 1;
    const a = 2 * Math.PI * r.next();
    const s = Math.sqrt(1 - zc * zc);
    sx[k] = s * Math.cos(a) * swim;
    sy[k] = zc * swim;
    sz[k] = s * Math.sin(a) * swim;
  };
  for (let k = 0; k < n; k++) {
    do {
      px[k] = r.next() * nx;
      py[k] = ny * 0.25 + r.next() * (top - ny * 0.25);
      pz[k] = r.next() * nz;
    } while (at(Math.floor(px[k]!), Math.floor(py[k]!), Math.floor(pz[k]!)));
    reorient(k);
  }

  /** Vertical gap from (x, y, z) to the nearest surface below or above, in voxels. */
  const gap = (x: number, y: number, z: number) => {
    const ix = Math.floor(x);
    const iz = Math.floor(z);
    const iy = Math.floor(y);
    let below = y; // the floor
    for (let j = Math.min(iy - 1, ny - 1); j >= 0; j--) {
      if (at(ix, j, iz)) {
        below = y - (j + 1);
        break;
      }
    }
    let above = Infinity;
    for (let j = Math.max(iy + 1, 0); j < ny; j++) {
      if (at(ix, j, iz)) {
        above = j - y;
        break;
      }
    }
    return Math.max(0, Math.min(below, above));
  };
  const touching = (x: number, y: number, z: number) => {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const iz = Math.floor(z);
    return !!(at(wrap(ix + 1, nx), iy, iz) || at(wrap(ix - 1, nx), iy, iz) || at(ix, iy + 1, iz) || at(ix, iy - 1, iz)
      || at(ix, iy, wrap(iz + 1, nz)) || at(ix, iy, wrap(iz - 1, nz)));
  };

  const frameCount = Math.floor(steps / params.frameEvery) + 1;
  const frames = new Float32Array(frameCount * n * 3);
  const contact = new Uint8Array(frameCount * n);
  const wasTouching = new Uint8Array(n);
  const reached = new Uint8Array(n);
  const onFloor = new Uint8Array(n);
  let contacts = 0;
  let nearTime = 0;
  let shelterTime = 0;

  const record = (f: number) => {
    for (let k = 0; k < n; k++) {
      frames[(f * n + k) * 3] = px[k]!;
      frames[(f * n + k) * 3 + 1] = py[k]!;
      frames[(f * n + k) * 3 + 2] = pz[k]!;
      contact[f * n + k] = wasTouching[k]!;
    }
  };
  record(0);

  for (let s = 1; s <= steps; s++) {
    const t = s * params.dt;
    const u = params.flow.kind === 'oscillating' && params.flow.periodS ? u0 * Math.sin((2 * Math.PI * t) / params.flow.periodS) : u0;
    for (let k = 0; k < n; k++) {
      if (r.next() < params.dt) reorient(k); // about once a second
      const slow = Math.tanh(gap(px[k]!, py[k]!, pz[k]!) / delta);
      const vx = u * slow + sx[k]! + kick * r.normal();
      const vy = sy[k]! + kick * r.normal();
      const vz = sz[k]! + kick * r.normal();
      let dx = vx * params.dt;
      let dy = vy * params.dt;
      let dz = vz * params.dt;
      const sub = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)) / 0.5));
      dx /= sub;
      dy /= sub;
      dz /= sub;
      let blocked = false;
      for (let q = 0; q < sub; q++) {
        // One axis at a time: a blocked axis is dropped, so the larva slides along the surface.
        const tx = wrap(px[k]! + dx, nx);
        if (at(Math.floor(tx), Math.floor(py[k]!), Math.floor(pz[k]!))) blocked = true;
        else px[k] = tx;
        let ty = py[k]! + dy;
        if (ty < 0) {
          ty = 1e-3;
          onFloor[k] = 1;
        } else if (ty > top) ty = 2 * top - ty;
        if (at(Math.floor(px[k]!), Math.floor(ty), Math.floor(pz[k]!))) blocked = true;
        else py[k] = ty;
        const tz = wrap(pz[k]! + dz, nz);
        if (at(Math.floor(px[k]!), Math.floor(py[k]!), Math.floor(tz))) blocked = true;
        else pz[k] = tz;
      }
      const touch = blocked || touching(px[k]!, py[k]!, pz[k]!);
      if (touch && !wasTouching[k]) contacts++;
      if (touch) {
        reached[k] = 1;
        nearTime += params.dt;
      }
      wasTouching[k] = touch ? 1 : 0;
      if (slow < 0.5) shelterTime += params.dt;
    }
    if (s % params.frameEvery === 0) record(s / params.frameEvery);
  }

  const count = (a: Uint8Array) => a.reduce((m, v) => m + v, 0);
  const round = (v: number) => Math.round(v * 1000) / 1000;
  return {
    params,
    metrics: {
      released: n,
      reachedStructure: count(reached),
      structureContacts: contacts,
      reachedFloor: count(onFloor),
      meanNearStructureS: round(nearTime / n),
      meanShelteredS: round(shelterTime / n),
      durationS: params.durationS,
    },
    frames,
    contact,
    frameCount,
    frameDt: params.dt * params.frameEvery,
  };
}
