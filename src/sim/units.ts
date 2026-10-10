import type { GridConfig, PhysicalMapping, SimParams } from "../contracts";

/** Kinematic viscosity of seawater at ~25 °C, m^2/s. */
export const SEAWATER_NU = 1.0e-6;
/** Reference feature height for Re: the 2.5 mm ridges of Levenstein et al. 2022. */
export const REF_LENGTH_MM = 2.5;

/**
 * Map lattice units to physical units. dx is fixed by the grid; dt follows from
 * matching the lattice peak velocity to the physical one. The lattice viscosity
 * then fixes the Reynolds number actually simulated.
 */
export function physicalMapping(grid: GridConfig, params: SimParams): PhysicalMapping {
  const dxM = grid.cellSizeMm / 1000;
  const uM = params.peakVelocityCmS / 100;
  const dtS = (dxM * params.peakVelocity) / uM;
  const nuLattice = (params.tau - 0.5) / 3;
  const refCells = REF_LENGTH_MM / grid.cellSizeMm;
  return {
    dxMm: grid.cellSizeMm,
    dtS,
    periodS: params.periodSteps * dtS,
    peakVelocityCmS: params.peakVelocityCmS,
    refLengthMm: REF_LENGTH_MM,
    reynolds: (params.peakVelocity * refCells) / nuLattice,
  };
}

/** Lattice velocity → mm/s. */
export const latticeToMmS = (m: PhysicalMapping) => m.dxMm / m.dtS;
