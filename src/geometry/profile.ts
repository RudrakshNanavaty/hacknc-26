import type { Profile, Segment, SegmentKind } from "../contracts";

/** Raised features this wide or narrower are called ridges; wider ones are steps. */
const RIDGE_MAX_WIDTH = 8;
export const MIN_SEGMENT_WIDTH = 2;

export interface ProfileLimits {
  nx: number;
  ny: number;
  /** Rows at the top kept clear for larval release. */
  headroom: number;
}

/** Relief height (cells, relative to baseHeight) for every column. */
export function profileToHeights(profile: Profile, nx: number): Int32Array {
  const h = new Int32Array(nx);
  for (const s of profile.segments) {
    for (let x = s.x; x < s.x + s.width && x < nx; x++) h[x] = s.height;
  }
  return h;
}

function kindFor(height: number, width: number): SegmentKind {
  if (height === 0) return "flat";
  if (height < 0) return "recess";
  return width <= RIDGE_MAX_WIDTH ? "ridge" : "step";
}

/** Run-length encode column heights back into sorted, contiguous segments. */
export function heightsToProfile(heights: ArrayLike<number>, base: Omit<Profile, "segments">): Profile {
  const segments: Segment[] = [];
  let start = 0;
  for (let x = 1; x <= heights.length; x++) {
    if (x === heights.length || heights[x] !== heights[start]) {
      const height = heights[start] ?? 0;
      const width = x - start;
      segments.push({ id: `s${segments.length + 1}`, kind: kindFor(height, width), x: start, width, height });
      start = x;
    }
  }
  return { ...base, segments };
}

export function heightLimits(profile: Pick<Profile, "baseHeight">, limits: ProfileLimits) {
  return {
    min: 1 - profile.baseHeight,
    max: limits.ny - limits.headroom - profile.baseHeight - 2,
  };
}

/** Returns a list of problems; empty means valid. */
export function validateProfile(profile: Profile, limits: ProfileLimits): string[] {
  const errors: string[] = [];
  const { min, max } = heightLimits(profile, limits);
  let cursor = 0;
  for (const s of profile.segments) {
    if (s.x !== cursor) errors.push(`segment ${s.id} starts at ${s.x}, expected ${cursor}`);
    if (s.width < MIN_SEGMENT_WIDTH) errors.push(`segment ${s.id} is narrower than ${MIN_SEGMENT_WIDTH} cells`);
    if (s.height < min) errors.push(`segment ${s.id} cuts through the floor`);
    if (s.height > max) errors.push(`segment ${s.id} intrudes into the larval release band`);
    cursor = s.x + s.width;
  }
  if (cursor !== limits.nx) errors.push(`segments cover ${cursor} of ${limits.nx} columns`);
  return errors;
}

export type Tool = "flat" | "ridge" | "recess" | "step";

export const TOOL_DEFAULTS: Record<Tool, { width: number; height: number }> = {
  ridge: { width: 4, height: 10 },
  recess: { width: 10, height: -10 },
  step: { width: 34, height: 6 },
  flat: { width: 10, height: 0 },
};

/**
 * Stamp a feature centred on column `cx`. Heights are clamped to the valid range,
 * and slivers narrower than MIN_SEGMENT_WIDTH are absorbed into a neighbour.
 */
export function applyTool(
  profile: Profile,
  limits: ProfileLimits,
  tool: Tool,
  cx: number,
  opts: { width?: number; height?: number } = {},
): Profile {
  const heights = Array.from(profileToHeights(profile, limits.nx));
  const width = Math.min(limits.nx, Math.max(MIN_SEGMENT_WIDTH, Math.round(opts.width ?? TOOL_DEFAULTS[tool].width)));
  const { min, max } = heightLimits(profile, limits);
  const height = tool === "flat" ? 0 : Math.min(max, Math.max(min, Math.round(opts.height ?? TOOL_DEFAULTS[tool].height)));
  const x0 = Math.max(0, Math.min(limits.nx - width, Math.round(cx - width / 2)));
  for (let x = x0; x < x0 + width; x++) heights[x] = height;
  absorbSlivers(heights);
  return heightsToProfile(heights, { id: profile.id, name: profile.name, baseHeight: profile.baseHeight, source: "player" });
}

function absorbSlivers(heights: number[]) {
  for (;;) {
    let start = 0;
    let fixed = false;
    for (let x = 1; x <= heights.length; x++) {
      if (x === heights.length || heights[x] !== heights[start]) {
        if (x - start < MIN_SEGMENT_WIDTH) {
          const fill = start > 0 ? heights[start - 1]! : (heights[x] ?? 0);
          for (let i = start; i < x; i++) heights[i] = fill;
          fixed = true;
          break;
        }
        start = x;
      }
    }
    if (!fixed) return;
  }
}
