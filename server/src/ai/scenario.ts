// The crisis desk: Gemini writes this match's three crises and the card lines from live conditions
// (NOAA tide gauge, NWS forecast) and the real district facts. It chooses the kind of crisis (from a
// fixed list whose effect is authored), which areas it is about, the words, and which live readings
// to show. Every number must come from the facts; anything else is rejected and the authored
// scenario (with the same live readings) stands in.
import { CARD_IDS, CRISIS_KINDS, DISTRICT_IDS, authoredScenario, checkScenario, liveReadings, makeCrisis, scenarioFacts, type CardId, type CrisisKind, type LiveConditions, type Scenario } from '@shared';
import { GROUNDED, type Gemini } from './gemini';
import { strayNumbers } from './narrator';

const SYSTEM = `You are the scenario desk of "Coastal Clash", a four-player city-planning card game played on the real city of Miami Beach, Florida. Players are the Mayor (pragmatic, budget-wary, dry), the Environmental Activist (habitat and the long term, passionate), the Resort Owner (ambitious, persuasive, a bit opportunistic) and the Resident (affordability, safety, beach access; tired of flooded streets). A Fisherman on the South Pointe pier (not a player) watches the working waterfront.
Write a fresh three-round scenario for THIS match from the live readings and the area facts you are given.
- Each round: pick a crisis kind from the list, 1 or 2 area ids it is about, a short title (max 6 words) and 2-3 sentences of scenario text in an energetic local-news voice. Tie each round to the live readings or to the real facts of its areas (flood exposure, coastal high hazard zone, zoning). Use at least two different kinds. Make round 3 the highest stakes.
- Say "Scenario:" nowhere; do not invent events as real news. Frame it as what could happen this week given the readings.
- readings: for each round, the indexes (0-based) of up to 2 liveReadings that support it.
- quips: one short line (max 14 words, no numbers) for each card id, in its owner's voice, about this week's situation.
${GROUNDED}`;

interface Written {
  rounds: { kind: CrisisKind; spotlight: string[]; title: string; text: string; readings: number[] }[];
  quips: Record<string, string>;
}

const schema = {
  type: 'object',
  properties: {
    rounds: {
      type: 'array', minItems: 3, maxItems: 3,
      items: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: [...CRISIS_KINDS] },
          spotlight: { type: 'array', minItems: 1, maxItems: 2, items: { type: 'string', enum: DISTRICT_IDS } },
          title: { type: 'string' },
          text: { type: 'string' },
          readings: { type: 'array', maxItems: 2, items: { type: 'integer' } },
        },
        required: ['kind', 'spotlight', 'title', 'text', 'readings'],
      },
    },
    quips: { type: 'object', properties: Object.fromEntries(CARD_IDS.map((id) => [id, { type: 'string' }])), required: CARD_IDS },
  },
  required: ['rounds', 'quips'],
};

export type ScenarioWriter = (live: LiveConditions | null) => Promise<Scenario>;

export function geminiScenarioWriter(gemini: Gemini, timeoutMs = 9_000): ScenarioWriter {
  return async (live) => {
    if (!gemini.ready()) return authoredScenario(live);
    const facts = scenarioFacts(live);
    const readings = liveReadings(live);
    const w = await gemini.json<Written>({
      system: SYSTEM,
      prompt: JSON.stringify(facts),
      schema,
      temperature: 1,
      timeoutMs,
      check: (v) => {
        const problem = checkScenario(v);
        if (problem) return problem;
        for (const r of v.rounds) {
          const stray = strayNumbers(`${r.title} ${r.text}`, facts);
          if (stray.length) return `numbers not in the facts: ${stray.join(', ')}`;
        }
        for (const id of CARD_IDS) {
          const q = v.quips?.[id];
          if (typeof q !== 'string' || !q.trim() || q.length > 120 || /\d/.test(q)) return `bad quip for ${id}`;
        }
        return null;
      },
    });
    return {
      source: 'gemini',
      live,
      quips: Object.fromEntries(CARD_IDS.map((id) => [id, w.quips[id]!.trim()])) as Record<CardId, string>,
      crises: w.rounds.map((r, i) =>
        makeCrisis(i + 1, r.kind, r.title.trim(), r.text.trim(), [...new Set(r.spotlight)], r.readings.filter((k) => Number.isInteger(k) && k >= 0 && k < readings.length).map((k) => readings[k]!), 'gemini'),
      ),
    };
  };
}
