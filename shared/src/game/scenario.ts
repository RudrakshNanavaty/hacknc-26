// A match's scenario: three crises, written fresh for each match from live conditions (NOAA tide
// gauge, NWS forecast) and the real district facts. Gemini may choose the kind of crisis, which
// areas it is about and the words; what each kind DOES is authored here (rule K1), so the rules stay
// deterministic. Without Gemini, the authored scenario below carries the same live readings.
import { CARDS, type CardId, type Delta } from './content';
import { DISTRICTS, DISTRICT_IDS, coastalHighHazard, districtById } from './districts';

export interface LiveConditions {
  fetchedAt: string;
  tide: {
    station: string;
    name: string;
    latest: { at: string; ft: number } | null;
    /** Predicted high tides for the coming week (ft above MLLW). */
    highs: { at: string; ft: number }[];
    weekHigh: { at: string; ft: number } | null;
    /** NOAA flood thresholds at the station, converted to ft above MLLW. */
    minorFloodFt: number | null;
    moderateFloodFt: number | null;
  } | null;
  weather: { periods: { name: string; tempF: number; wind: string; forecast: string; rainPct: number | null }[] } | null;
  sources: { name: string; url: string }[];
}

export type CrisisKind = 'flood' | 'development' | 'storm' | 'erosion' | 'budget';
export const CRISIS_KINDS: readonly CrisisKind[] = ['flood', 'development', 'storm', 'erosion', 'budget'];

/** What each kind of crisis does: approved projects in a spotlight area add this (rule K1). */
export const CRISIS_KIND_INFO: Record<CrisisKind, { label: string; icon: string; bonus: Delta }> = {
  flood: { label: 'Flooding', icon: '🌊', bonus: { flood: 2 } },
  development: { label: 'Development pressure', icon: '🏗️', bonus: { economy: 2 } },
  storm: { label: 'Storm', icon: '⛈️', bonus: { environment: 2 } },
  erosion: { label: 'Beach erosion', icon: '🏖️', bonus: { access: 2 } },
  budget: { label: 'Budget crunch', icon: '💸', bonus: { budget: 3 } },
};

export interface Crisis {
  id: string;
  round: number;
  kind: CrisisKind;
  title: string;
  text: string;
  /** Districts the crisis is about (highlighted on the map). */
  spotlight: string[];
  /** Approved projects in a spotlight district add this (rule K1); set by the kind. */
  bonus: Delta;
  /** Live readings shown with the crisis, as written chips. */
  readings: string[];
  refs: string[];
  source: 'gemini' | 'authored';
}

export interface Scenario {
  crises: Crisis[];
  /** One line per card, in its persona's voice, for this match. */
  quips: Partial<Record<CardId, string>>;
  live: LiveConditions | null;
  source: 'gemini' | 'authored';
}

const MB_PROJECTS = 'https://www.miamibeachfl.gov/projects/';
const FEMA = 'https://gisweb.miamidade.gov/ArcGIS/rest/services/EnerGov/MD_LandMgtViewer/MapServer/63';
const ZONING = 'https://gis.miamibeachfl.gov/public/rest/services/gc/gc_Zoning/MapServer/0';

const clock = (t: string) => {
  const m = /(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})/.exec(t);
  if (!m) return t;
  const h = Number(m[4]);
  return `${((h + 11) % 12) + 1}:${m[5]} ${h < 12 ? 'AM' : 'PM'}`;
};
const day = (t: string) => {
  const m = /(\d{4})-(\d{2})-(\d{2})/.exec(t);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }) : t;
};

/** Live readings as short chips, every number taken from the feeds. */
export function liveReadings(live: LiveConditions | null): string[] {
  const out: string[] = [];
  const t = live?.tide;
  if (t?.latest) out.push(`🌊 ${t.name} tide now ${t.latest.ft.toFixed(2)} ft (MLLW)`);
  if (t?.weekHigh) out.push(`📈 Highest tide this week ${t.weekHigh.ft.toFixed(2)} ft, ${day(t.weekHigh.at)} ${clock(t.weekHigh.at)}`);
  if (t?.minorFloodFt != null) out.push(`⚠️ NOAA minor flood level ${t.minorFloodFt.toFixed(2)} ft`);
  const w = live?.weather?.periods[0];
  if (w) out.push(`⛅ ${w.name}: ${w.forecast}, ${w.tempF}°F${w.rainPct != null ? `, rain ${w.rainPct}%` : ''}`);
  return out;
}

/** Everything the scenario writer may use, as facts (every number it states must be in here). */
export function scenarioFacts(live: LiveConditions | null) {
  return {
    city: 'Miami Beach, Florida',
    liveReadings: liveReadings(live),
    tide: live?.tide
      ? {
          station: `${live.tide.name} (NOAA ${live.tide.station})`,
          nowFt: live.tide.latest?.ft ?? null,
          weekHighFt: live.tide.weekHigh?.ft ?? null,
          weekHighWhen: live.tide.weekHigh ? `${day(live.tide.weekHigh.at)} ${clock(live.tide.weekHigh.at)}` : null,
          minorFloodFt: live.tide.minorFloodFt,
          feetBelowMinorFlood: live.tide.weekHigh && live.tide.minorFloodFt != null ? Math.round((live.tide.minorFloodFt - live.tide.weekHigh.ft) * 100) / 100 : null,
        }
      : null,
    forecast: live?.weather?.periods ?? null,
    areas: DISTRICTS.map((d) => ({
      id: d.id,
      name: d.name,
      blurb: d.blurb,
      faces: d.shore === 'ocean' ? 'Atlantic Ocean' : 'Biscayne Bay',
      percentInFemaFloodArea: Math.round(d.sfhaShare * 100),
      bordersCoastalHighHazardZone: coastalHighHazard(d),
      percentZonedHotelCommercial: Math.round(d.hotelZoningShare * 100),
      percentZonedResidential: Math.round(d.residentialZoningShare * 100),
      percentGovernmentUse: Math.round(d.publicZoningShare * 100),
    })),
    crisisKinds: Object.fromEntries(CRISIS_KINDS.map((k) => [k, CRISIS_KIND_INFO[k].label])),
    cards: Object.fromEntries(Object.values(CARDS).map((c) => [c.id, `${c.name} (${c.persona}): ${c.text}`])),
  };
}

const STORM_LINE = 'When this round ends, a storm tests the city’s flood resilience.';

export function makeCrisis(round: number, kind: CrisisKind, title: string, text: string, spotlight: string[], readings: string[], source: Crisis['source']): Crisis {
  const body = round === 3 && !/storm tests/i.test(text) ? `${text} ${STORM_LINE}` : text;
  return {
    id: `r${round}-${kind}`, round, kind, title, text: body, spotlight, bonus: CRISIS_KIND_INFO[kind].bonus, readings, source,
    refs: kind === 'development' ? [ZONING, MB_PROJECTS] : [FEMA, MB_PROJECTS],
  };
}

/** The authored scenario, carrying whatever live readings arrived. */
export function authoredScenario(live: LiveConditions | null): Scenario {
  const readings = liveReadings(live);
  const tide = live?.tide;
  const tideLine = tide?.weekHigh && tide.minorFloodFt != null
    ? ` The ${tide.name} gauge predicts a ${tide.weekHigh.ft.toFixed(2)} ft high tide this week; NOAA's minor flood level there is ${tide.minorFloodFt.toFixed(2)} ft.`
    : '';
  const w = live?.weather?.periods[0];
  const sp = (id: string) => districtById(id).id;
  return {
    source: 'authored',
    live,
    quips: {},
    crises: [
      makeCrisis(1, 'flood', 'King tide warning', `Seasonal king tides push water up through the storm drains of low bayfront blocks like West Avenue.${tideLine}`, [sp('west-avenue'), sp('south-pointe')], readings.slice(0, 3), 'authored'),
      makeCrisis(2, 'development', 'Oceanfront hotel boom', 'Tourism is surging and developers are circling the oceanfront along Collins Avenue and South Pointe. Jobs are on the table, and so are the dunes.', [sp('collins-mid-beach'), sp('south-pointe')], readings.slice(0, 1), 'authored'),
      makeCrisis(3, 'storm', 'Storm season', `${w ? `Forecast for ${w.name.toLowerCase()}: ${w.forecast.toLowerCase()}. ` : ''}Oceanfront parks and dunes in North Beach and South Pointe are the first line.`, [sp('north-beach-oceanside'), sp('south-pointe')], readings.slice(-1), 'authored'),
    ],
  };
}

/** Check a written scenario; returns the problem or null. */
export function checkScenario(raw: unknown): string | null {
  const s = raw as { rounds?: { kind?: unknown; spotlight?: unknown; title?: unknown; text?: unknown }[] };
  if (!Array.isArray(s?.rounds) || s.rounds.length !== 3) return 'needs exactly three rounds';
  for (const r of s.rounds) {
    if (!CRISIS_KINDS.includes(r.kind as CrisisKind)) return `unknown kind ${String(r.kind)}`;
    if (!Array.isArray(r.spotlight) || r.spotlight.length < 1 || r.spotlight.length > 2 || !r.spotlight.every((d) => DISTRICT_IDS.includes(d as string))) return 'spotlight must be 1-2 area ids';
    if (typeof r.title !== 'string' || r.title.length < 4 || r.title.length > 60) return 'bad title';
    if (typeof r.text !== 'string' || r.text.length < 40 || r.text.length > 420) return 'bad text';
  }
  if (new Set(s.rounds.map((r) => r.kind)).size < 2) return 'needs variety';
  return null;
}
