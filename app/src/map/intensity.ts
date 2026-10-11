// How strong a crisis looks on the map, from the live readings the scenario was written from.
// Presentation only: the rules engine never reads this, so outcomes do not depend on it (rule 1).
import type { CrisisKind, LiveConditions } from '@shared';

export type Intensity = 1 | 2 | 3;

/** 1 calm, 2 the default (and the answer whenever a reading is missing), 3 severe. */
export function crisisIntensity(kind: CrisisKind, live: LiveConditions | null): Intensity {
  if (kind === 'flood') {
    const tide = live?.tide;
    const ft = tide?.weekHigh?.ft;
    if (ft == null || tide?.minorFloodFt == null) return 2;
    if (tide.moderateFloodFt != null && ft >= tide.moderateFloodFt) return 3;
    // Within a quarter foot of NOAA's minor flood level counts: that is when West Avenue's drains back up.
    return ft >= tide.minorFloodFt - 0.25 ? 2 : 1;
  }
  if (kind === 'storm') {
    const rain = live?.weather?.periods.find((p) => p.rainPct != null)?.rainPct;
    if (rain == null) return 2;
    return rain >= 70 ? 3 : rain >= 35 ? 2 : 1;
  }
  return 2;
}
