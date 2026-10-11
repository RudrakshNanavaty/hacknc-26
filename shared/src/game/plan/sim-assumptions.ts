// Every number the planning simulator uses, with where it comes from. Three kinds:
//   real     measured or published by a named source (NOAA, FEMA via districts.json, the story's cited facts)
//   derived  calculated from a real number with a stated step
//   assumed  a modelling judgment. These are NOT verified engineering results: change them here and the
//            simulator, its cached file and the Civic Atlas all follow.
// The simulator ranks plans against each other under three defined futures. It does not predict flooding.

export type AssumptionKind = 'real' | 'derived' | 'assumed';
export interface Assumption {
  id: string;
  label: string;
  value: number | string;
  unit?: string;
  kind: AssumptionKind;
  source: string;
}

export type FutureId = 'ordinary' | 'high-tide-rain' | 'extreme';
export interface Future {
  id: FutureId;
  name: string;
  /** Water level at the NOAA Virginia Key gauge, feet above MLLW. */
  tideFt: number;
  /** Heavy-rain depth in inches (illustrative). */
  rainIn: number;
  note: string;
}

/** NOAA CO-OPS station 8723214 (Virginia Key): datums MLLW 10.13, MHHW 12.38 and flood levels minor 14.07 and major 16.27 on the station datum, fetched 2026-10-11. */
export const NOAA_STATION = '8723214';
export const FUTURES: readonly Future[] = [
  { id: 'ordinary', name: 'Ordinary coastal conditions', tideFt: 2.25, rainIn: 0, note: 'A typical high tide: mean higher high water, 12.38 − 10.13 = 2.25 ft MLLW. No heavy rain.' },
  { id: 'high-tide-rain', name: 'High tide + heavy rain', tideFt: 3.94, rainIn: 3, note: "NOAA's minor flood level, 14.07 − 10.13 = 3.94 ft MLLW, with a heavy rain event (3 in, illustrative)." },
  { id: 'extreme', name: 'Extreme coastal flooding', tideFt: 6.14, rainIn: 6, note: "NOAA's major flood level, 16.27 − 10.13 = 6.14 ft MLLW, with extreme rain (6 in, illustrative)." },
];
export const futureById = (id: FutureId): Future => FUTURES.find((f) => f.id === id)!;

/** Where a street first floods with no project, in feet MLLW, and the baseline drainage. Per area. */
export const AREA_BASELINE: Record<string, { marginFt: number; drainage: number; why: string; kind: AssumptionKind }> = {
  'west-avenue': { marginFt: 3.0, drainage: 0.2, why: 'West Avenue street level: assumed. The story gives the raise (up to about two feet), not the starting grade.', kind: 'assumed' },
  'south-pointe': { marginFt: 4.8, drainage: 0.2, why: 'South Pointe street level: assumed. The Alton Road story is a land-use trade, so this decision moves public access and cost far more than flood exposure.', kind: 'assumed' },
  'collins-mid-beach': { marginFt: 3.8, drainage: 0.2, why: 'Mid-Beach beach-and-street level: assumed. Sand, dunes and groins act on the shoreline through an assumed height buffer (in feet).', kind: 'assumed' },
};

export const MODEL = {
  /** Feet of water over a street's margin that counts as fully flooded by tide. */
  tideRangeFt: 4,
  /** Inches of unhandled runoff that count as fully flooded by rain. */
  rainRangeIn: 6,
  /** Weight of tide and rain in the exposure proxy (they sum to 1). */
  weightTide: 0.6,
  weightRain: 0.4,
  /** Extra exposure per unit of the area's FEMA VE share in the extreme future (wave action). */
  veBoost: 0.5,
  /** How much a fully elevated building cuts its own exposure. */
  elevateRelief: 0.5,
  /** Community access index: 60 at the baseline, 6 points per unit of access effect. */
  accessBase: 60,
  accessPerUnit: 6,
  /** The storm scene holds if the plan's extreme-future exposure is at most this. */
  stormHeldMax: 48,
  /** A plan "holds" in the cost-saving alternative if its high-tide exposure is at most this. */
  holdExposure: 30,
} as const;

export const ASSUMPTIONS: Assumption[] = [
  { id: 'tide.ordinary', label: 'Ordinary high tide', value: 2.25, unit: 'ft MLLW', kind: 'real', source: 'NOAA CO-OPS 8723214 datums: MHHW 12.38 − MLLW 10.13' },
  { id: 'tide.minor', label: 'High tide (NOAA minor flood level)', value: 3.94, unit: 'ft MLLW', kind: 'real', source: 'NOAA CO-OPS 8723214 flood levels: nos_minor 14.07 − MLLW 10.13' },
  { id: 'tide.major', label: 'Extreme tide (NOAA major flood level)', value: 6.14, unit: 'ft MLLW', kind: 'real', source: 'NOAA CO-OPS 8723214 flood levels: nos_major 16.27 − MLLW 10.13' },
  { id: 'rain.heavy', label: 'Heavy-rain event', value: 3, unit: 'in', kind: 'assumed', source: 'Illustrative rain depth for the high-tide future' },
  { id: 'rain.extreme', label: 'Extreme-rain event', value: 6, unit: 'in', kind: 'assumed', source: 'Illustrative rain depth for the extreme future' },
  { id: 'area.sfha', label: "Share of each area in FEMA's 1% flood zone", value: 'per area', kind: 'real', source: 'FEMA flood zones via shared/src/data/districts.json (sfhaShare)' },
  { id: 'area.ve', label: 'Share of the 100 m band in FEMA VE (coastal high hazard)', value: 'per area', kind: 'real', source: 'FEMA via districts.json (veBandShare); scales the extreme-future exposure' },
  ...Object.entries(AREA_BASELINE).map(([id, b]) => ({ id: `margin.${id}`, label: `Street margin, ${id}`, value: b.marginFt, unit: 'ft MLLW', kind: b.kind, source: b.why })),
  { id: 'model.tide', label: 'Tide range that counts as fully flooded', value: MODEL.tideRangeFt, unit: 'ft', kind: 'assumed', source: 'Modelling judgment' },
  { id: 'model.rain', label: 'Runoff that counts as fully flooded', value: MODEL.rainRangeIn, unit: 'in', kind: 'assumed', source: 'Modelling judgment' },
  { id: 'model.weights', label: 'Tide 60%, rain 40% of exposure', value: '0.6 / 0.4', kind: 'assumed', source: 'Modelling judgment' },
  { id: 'model.elevate', label: 'Relief from elevated buildings', value: MODEL.elevateRelief, kind: 'assumed', source: 'Modelling judgment' },
  { id: 'option.effects', label: 'What each project raises, drains and does to access', value: 'per option', kind: 'assumed', source: 'shared/src/game/plan/scenarios.ts (the story gives the project, not its engineering effect)' },
  { id: 'option.cost', label: 'Project and amendment costs', value: 'game units', kind: 'assumed', source: 'Illustrative units; the real budgets are quoted only as story facts' },
];

export const SIM_DISCLAIMER =
  'Modelled with illustrative effect sizes on real tide levels and FEMA flood-zone shares. A ranking of plans under three defined futures, not a flood forecast and not an engineering result.';
