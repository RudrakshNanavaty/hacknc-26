import type { GridConfig, Profile } from "../contracts";
import { profileToHeights } from "./profile";

/** Solid surface height (cells) per column. */
export function surfaceHeights(profile: Profile, nx: number): Int32Array {
  const h = profileToHeights(profile, nx);
  for (let x = 0; x < nx; x++) h[x] = profile.baseHeight + h[x]!;
  return h;
}

/** Solid mask, row-major from the bottom row (y = 0). 1 = solid, 0 = fluid. */
export function profileToMask(profile: Profile, grid: GridConfig): Uint8Array {
  const { nx, ny } = grid;
  const top = surfaceHeights(profile, nx);
  const mask = new Uint8Array(nx * ny);
  for (let x = 0; x < nx; x++) {
    const t = Math.min(ny, top[x]!);
    for (let y = 0; y < t; y++) mask[y * nx + x] = 1;
  }
  return mask;
}

/** Fluid-exposed surface length in mm: top faces plus vertical walls (periodic in x). */
export function exposedLengthMm(profile: Profile, grid: GridConfig): number {
  const s = surfaceHeights(profile, grid.nx);
  let cells = grid.nx;
  for (let x = 0; x < grid.nx; x++) cells += Math.abs(s[x]! - s[(x + grid.nx - 1) % grid.nx]!);
  return cells * grid.cellSizeMm;
}
