// The playable Miami Beach areas, measured from real GIS layers by pipeline/miami-beach.ts
// (districts.json), and the geographic rules that decide where each card may be played.
import data from '../data/districts.json';
import { CARDS, type CardId, type ProjectKind } from './content';

export interface DistrictSources {
  zoningIds: number[];
  floodZoneIds: number[];
  veZoneIdsNearby: number[];
}

export interface District {
  id: string;
  name: string;
  blurb: string;
  shore: 'ocean' | 'bay';
  planningDistrict: string;
  center: [number, number];
  bbox: [number, number, number, number];
  areaKm2: number;
  samplePoints: number;
  zoning: Record<string, number>;
  flood: Record<string, number>;
  sfhaShare: number;
  veBandShare: number;
  medianBaseFloodElevFt: number | null;
  hotelZoningShare: number;
  residentialZoningShare: number;
  publicZoningShare: number;
  sources: DistrictSources;
}

export interface DataSource {
  id: string;
  name: string;
  layer: string;
  query: string;
  fetchedAt: string;
}

export const CITY = data.city;
export const DATA_SOURCES = data.sources as DataSource[];
export const DATA_VERSION = `miami-beach-gis/${data.builtAt}`;
export const DATA_METHOD = data.method;
export const DISTRICTS = data.districts as unknown as District[];
export const DISTRICT_IDS = DISTRICTS.map((d) => d.id);
export const isDistrictId = (v: unknown): v is string => typeof v === 'string' && DISTRICT_IDS.includes(v);
export const districtById = (id: string): District => {
  const d = DISTRICTS.find((x) => x.id === id);
  if (!d) throw new Error(`unknown district ${id}`);
  return d;
};

/** Game thresholds on the real measurements. */
export const GEO_RULES = {
  /** R1: FEMA VE within the 100 m band around the district. */
  coastalHighHazardBand: 0.15,
  hotelZoning: 0.25,
  residentialZoning: 0.2,
  sfhaForFloodProjects: 0.5,
} as const;

export const coastalHighHazard = (d: District) => d.veBandShare >= GEO_RULES.coastalHighHazardBand;

const pctText = (x: number) => `${Math.round(x * 100)}%`;

export interface Eligibility {
  ok: boolean;
  /** Why, quoting the measured value. */
  reason: string;
}

/** Can this project kind be proposed in this district? Decided by the real zoning and flood layers. */
export function projectEligibility(kind: ProjectKind, d: District): Eligibility {
  switch (kind) {
    case 'hotel': {
      const ok = d.hotelZoningShare >= GEO_RULES.hotelZoning;
      return { ok, reason: `${pctText(d.hotelZoningShare)} of ${d.name} is zoned for hotel or commercial use (needs ${pctText(GEO_RULES.hotelZoning)}).` };
    }
    case 'elevate': {
      const res = d.residentialZoningShare >= GEO_RULES.residentialZoning;
      const sfha = d.sfhaShare >= GEO_RULES.sfhaForFloodProjects;
      return {
        ok: res && sfha,
        reason: `${pctText(d.residentialZoningShare)} zoned residential (needs ${pctText(GEO_RULES.residentialZoning)}), ${pctText(d.sfhaShare)} in FEMA's 1% flood area (needs ${pctText(GEO_RULES.sfhaForFloodProjects)}).`,
      };
    }
    case 'drainage': {
      const ok = d.sfhaShare >= GEO_RULES.sfhaForFloodProjects;
      return { ok, reason: `${pctText(d.sfhaShare)} of ${d.name} is in FEMA's 1% annual chance flood area (needs ${pctText(GEO_RULES.sfhaForFloodProjects)}).` };
    }
    case 'shoreline':
      return { ok: true, reason: `${d.name} faces the ${d.shore === 'ocean' ? 'Atlantic' : 'Biscayne Bay'}.` };
  }
}

/** Can this card target this district? Support and opposition cards can go anywhere (they act on what is proposed there). */
export function cardEligibility(card: CardId, districtId: string): Eligibility {
  if (!isDistrictId(districtId)) return { ok: false, reason: 'That place is not one of the playable areas.' };
  const c = CARDS[card];
  if (c.project) return projectEligibility(c.project, districtById(districtId));
  return { ok: true, reason: `${c.name} acts on whatever is proposed in ${districtById(districtId).name}.` };
}

/** One-line description of the district's real context, for the UI and the narrator. */
export function districtFacts(d: District): string[] {
  const out = [
    `${pctText(d.sfhaShare)} in FEMA's 1% annual chance flood area${d.medianBaseFloodElevFt ? ` (base flood elevation ${d.medianBaseFloodElevFt} ft)` : ''}`,
    `${pctText(d.hotelZoningShare)} zoned hotel/commercial, ${pctText(d.residentialZoningShare)} residential, ${pctText(d.publicZoningShare)} government use`,
  ];
  if (coastalHighHazard(d)) out.push(`Borders a FEMA VE coastal high hazard zone (${pctText(d.veBandShare)} of the 100 m band)`);
  return out;
}

/** Starting resilience meter of a district (0-100): illustrative, from its flood exposure. */
export function startResilience(d: District): number {
  return Math.round(70 - 35 * d.sfhaShare - (coastalHighHazard(d) ? 10 : 0));
}
