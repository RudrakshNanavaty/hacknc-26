import type { Profile } from "./geometry";
import type { SimConfig } from "./sim";

export interface Diagnostics {
  massDriftPct: number;  // fluid mass drift over the flow run
  maxVelocity: number;   // lattice units; must stay well below 0.3
  diverged: boolean;
}

/** Physical-scale mapping derived from the config (docs/SCIENCE.md). */
export interface PhysicalMapping {
  dxMm: number;
  dtS: number;
  periodS: number;
  peakVelocityCmS: number;
  refLengthMm: number;   // reference feature height used for Re
  reynolds: number;      // U * refLength / nu (seawater nu = 1e-6 m^2/s equivalent)
}

export interface ExperimentRecord {
  recordVersion: number;
  createdAt: string;               // ISO timestamp
  profile: Profile;
  config: SimConfig;
  physical: PhysicalMapping;
  assumptions: string[];           // shown in UI and fed to Gemini
  results: {
    released: number;
    settled: number;
    settlementPct: number;         // settled / released * 100
    normalizedScore?: number;      // settlementPct per exposed length, relative to flat
    exposedLength: number;         // mm of fluid-exposed surface
    settledX: number[];            // x (cells) of each settler, for the settlement map
  };
  baselines?: { flat: number; ridge: number; recess: number }; // settlementPct
  diagnostics: Diagnostics;
}
