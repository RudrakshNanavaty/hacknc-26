import type { ExperimentRecord, GridConfig, Profile } from "../contracts";
import { surfaceHeights } from "../geometry/mask";

export interface SettlementZones {
  /** Settlers on top of a raised feature. */
  onRaisedFeature: number;
  /** Settlers inside a recess (below the base level). */
  insideRecess: number;
  /** Settlers on the base level within 1 mm of a feature edge. */
  nearFeatureBase: number;
  /** Settlers on open base level, more than 1 mm from any feature. */
  openFlat: number;
}

/** Where larvae settled, classified by the surface under each settler's column. */
export function settlementZones(profile: Profile, grid: GridConfig, settledX: number[]): SettlementZones {
  const s = surfaceHeights(profile, grid.nx);
  const base = profile.baseHeight;
  const near = Math.round(1 / grid.cellSizeMm);
  const z: SettlementZones = { onRaisedFeature: 0, insideRecess: 0, nearFeatureBase: 0, openFlat: 0 };
  for (const x of settledX) {
    const c = Math.min(grid.nx - 1, Math.max(0, Math.floor(x)));
    if (s[c]! > base) z.onRaisedFeature++;
    else if (s[c]! < base) z.insideRecess++;
    else {
      let isNear = false;
      for (let d = -near; d <= near && !isNear; d++) isNear = s[(c + d + grid.nx) % grid.nx] !== base;
      if (isNear) z.nearFeatureBase++;
      else z.openFlat++;
    }
  }
  return z;
}

/** Plain-language feature inventory of a profile, in mm. */
export function describeProfile(profile: Profile, grid: GridConfig) {
  const mm = (cells: number) => Math.round(cells * grid.cellSizeMm * 100) / 100;
  return profile.segments
    .filter((seg) => seg.kind !== "flat")
    .map((seg) => ({ kind: seg.kind, xMm: mm(seg.x), widthMm: mm(seg.width), heightMm: mm(seg.height) }));
}

export function recordFacts(record: ExperimentRecord) {
  const { grid, params, seed } = record.config;
  const zones = settlementZones(record.profile, grid, record.results.settledX);
  return {
    profile: { name: record.profile.name, features: describeProfile(record.profile, grid) },
    tile: { widthMm: grid.nx * grid.cellSizeMm, heightMm: grid.ny * grid.cellSizeMm, periodicInX: true },
    flow: {
      kind: "oscillating wave-driven boundary layer",
      peakVelocityCmS: record.physical.peakVelocityCmS,
      periodS: Math.round(record.physical.periodS * 100) / 100,
      reynoldsOnFeatureHeight: Math.round(record.physical.reynolds),
    },
    larvae: {
      released: record.results.released,
      swimSpeedMmS: params.swimSpeedMmS,
      attachProbabilityPerEncounter: params.cueAttachProb,
      attachOnlyBelowFlowSpeedMmS: params.attachMaxSpeedMmS,
      trackedForS: Math.round(params.larvaPeriods * record.physical.periodS * 10) / 10,
    },
    results: {
      settled: record.results.settled,
      settlementPct: Math.round(record.results.settlementPct * 10) / 10,
      exposedSurfaceMm: record.results.exposedLength,
      perSurfaceScore: record.results.normalizedScore !== undefined ? Math.round(record.results.normalizedScore * 10) / 10 : null,
      settlementZones: zones,
    },
    seed,
    simVersion: record.config.simVersion,
    assumptions: record.assumptions,
  };
}
