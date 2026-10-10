// Voxel design -> mesh. Only faces between a filled voxel and empty space are emitted, so the
// result is the design's closed outer surface (watertight, ready for slicing or a flow solver).
// Units: millimetres, x along the flow, z up (the usual CAD / 3D-print convention).
import { VOXEL_MM } from './config';
import type { Design } from './design';

/** [dx, dy, dz] of the neighbour, and the face's 4 corners (unit cube, counter-clockwise from outside). */
const FACES: [[number, number, number], [number, number, number][]][] = [
  [[1, 0, 0], [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]]],
  [[-1, 0, 0], [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]]],
  [[0, 1, 0], [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]]],
  [[0, -1, 0], [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]]],
  [[0, 0, 1], [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]]],
  [[0, 0, -1], [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]]],
];

/** Triangles of the outer surface: each is 9 numbers (3 corners), in mm, grid y mapped to z-up. */
export function surfaceTriangles(design: Design): Float32Array {
  const { nx, ny, nz } = design.grid;
  const filled = new Uint8Array(nx * ny * nz);
  for (const i of design.solid) filled[i] = 1;
  const at = (x: number, y: number, z: number) =>
    x >= 0 && y >= 0 && z >= 0 && x < nx && y < ny && z < nz && filled[x + nx * (y + ny * z)] === 1;
  const out: number[] = [];
  for (const i of design.solid) {
    const x = i % nx;
    const y = ((i - x) / nx) % ny;
    const z = (i - x - nx * y) / (nx * ny);
    for (const [[dx, dy, dz], corners] of FACES) {
      if (at(x + dx, y + dy, z + dz)) continue;
      // Grid (x, y up, z) -> CAD (x, -z, y up), which keeps the winding outward.
      const p = corners.map(([cx, cy, cz]) => [(x + cx) * VOXEL_MM, -(z + cz) * VOXEL_MM, (y + cy) * VOXEL_MM]);
      out.push(...p[0]!, ...p[1]!, ...p[2]!, ...p[0]!, ...p[2]!, ...p[3]!);
    }
  }
  return Float32Array.from(out);
}

/** Binary STL of the design's surface. */
export function designToStl(design: Design, name = 'ReefForge design'): ArrayBuffer {
  const tris = surfaceTriangles(design);
  const count = tris.length / 9;
  const buf = new ArrayBuffer(84 + count * 50);
  const view = new DataView(buf);
  const header = `${name} (ReefForge, mm)`.slice(0, 80);
  for (let k = 0; k < header.length; k++) view.setUint8(k, header.charCodeAt(k) & 0x7f);
  view.setUint32(80, count, true);
  let o = 84;
  for (let t = 0; t < count; t++) {
    const v = tris.subarray(t * 9, t * 9 + 9);
    // Normal from the winding.
    const ux = v[3]! - v[0]!, uy = v[4]! - v[1]!, uz = v[5]! - v[2]!;
    const wx = v[6]! - v[0]!, wy = v[7]! - v[1]!, wz = v[8]! - v[2]!;
    let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len; ny /= len; nz /= len;
    for (const value of [nx, ny, nz, ...v]) {
      view.setFloat32(o, value, true);
      o += 4;
    }
    view.setUint16(o, 0, true);
    o += 2;
  }
  return buf;
}
