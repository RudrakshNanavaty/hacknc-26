export const CONTRACT_VERSION = 2;

/** Authoritative geometry. Units: cells of the simulation grid. */
export type SegmentKind = "flat" | "ridge" | "recess" | "step";

export interface Segment {
  id: string;
  kind: SegmentKind;
  x: number;        // left edge, in cells
  width: number;    // cells, >= 2
  height: number;   // cells; positive = up (ridge/step), negative = down (recess)
}

export interface Profile {
  id: string;
  name: string;
  baseHeight: number;   // seabed height in cells
  segments: Segment[];  // non-overlapping, sorted by x
  source: "preset" | "player";
}
