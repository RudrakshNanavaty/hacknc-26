// The crisis desk: Gemini writes this match's three crises and the card lines from live conditions
// (NOAA tide gauge, NWS forecast) and the real district facts. It chooses the kind of crisis (from a
// fixed list whose effect is authored), which areas it is about, the words, and which live readings
// to show. Every number must come from the facts; anything else is rejected and the authored
// scenario (with the same live readings) stands in.
import {
  CARD_IDS, CRISIS_KINDS, DISTRICT_IDS, authoredScenario, checkScenario, liveReadings, makeCrisis, pickStories, scenarioFacts, storyCrisis, storyFacts,
  type CardId, type CivicStory, type CrisisKind, type LiveConditions, type Scenario,
} from '@shared';
import { GROUNDED, type Gemini } from './gemini';
import { strayNumbers } from './narrator';

const SYSTEM = `You are the scenario desk of "consensusclub", a four-player city-planning card game played on the real city of Miami Beach, Florida. Players are the Mayor (pragmatic, budget-wary, dry), the Environmental Activist (habitat and the long term, passionate), the Resort Owner (ambitious, persuasive, a bit opportunistic) and the Resident (affordability, safety, beach access; tired of flooded streets). A Fisherman on the South Pointe pier (not a player) watches the working waterfront.
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

/** `picked` is the match's three stories when the caller already chose them (so it could start work on them early). */
export type ScenarioWriter = (live: LiveConditions | null, picked?: CivicStory[]) => Promise<Scenario>;

/** The match's three stories, chosen on their own so everything that depends on them can start at once. */
export const pickMatchStories = async (stories: () => Promise<CivicStory[]>): Promise<CivicStory[]> =>
  pickStories(await stories().catch(() => []), Math.floor(Math.random() * 2 ** 31));

// ---------- Real civic stories ----------

const STORY_SYSTEM = `You are the news desk of "consensusclub", a four-player city-planning card game set in the real city of Miami Beach. Each round of this match re-enacts a REAL civic story from the reviewed research corpus.
For each round you are given the story (its facts, the real sides, its years) and today's live readings. Write:
- title: a punchy headline for the round, at most 7 words.
- text: 2-3 sentences in an energetic local-news voice that set up the real story as this round's dilemma. Say when it happened (its years) if it is not current, and tie it to a live reading when one fits. Present only what the facts say; do not invent events, votes or outcomes.
${GROUNDED}`;

interface StoryWritten {
  rounds: { title: string; text: string }[];
}

/**
 * Each match plays three real stories (picked to differ in place and kind). Gemini writes each
 * round's headline and setup from the story's own facts and the live readings; if it fails or
 * cheats, the story's own title and summary stand in. With too few stories, `fallback` writes the
 * match from the live readings alone.
 */
export function storyScenarioWriter(gemini: Gemini, stories: () => Promise<CivicStory[]>, fallback: ScenarioWriter, timeoutMs = 9_000): ScenarioWriter {
  return async (live, chosen) => {
    const picked = chosen?.length ? chosen : await pickMatchStories(stories);
    if (picked.length < 3) return fallback(live);
    const readings = liveReadings(live);
    const facts = { liveReadings: readings, rounds: picked.map((s, i) => ({ round: i + 1, ...storyFacts(s), area: s.cast!.district })) };
    let written: StoryWritten | null = null;
    if (gemini.ready()) {
      written = await gemini
        .json<StoryWritten>({
          system: STORY_SYSTEM,
          prompt: JSON.stringify(facts),
          schema: {
            type: 'object',
            properties: { rounds: { type: 'array', minItems: 3, maxItems: 3, items: { type: 'object', properties: { title: { type: 'string' }, text: { type: 'string' } }, required: ['title', 'text'] } } },
            required: ['rounds'],
          },
          temperature: 0.9,
          timeoutMs,
          check: (v) => {
            if (!Array.isArray(v.rounds) || v.rounds.length !== 3) return 'needs three rounds';
            for (const r of v.rounds) {
              if (typeof r.title !== 'string' || r.title.length < 4 || r.title.length > 70) return 'bad title';
              if (typeof r.text !== 'string' || r.text.length < 40 || r.text.length > 480) return 'bad text';
              const stray = strayNumbers(`${r.title} ${r.text}`, facts);
              if (stray.length) return `numbers not in the facts: ${stray.join(', ')}`;
            }
            return null;
          },
        })
        .catch(() => null);
    }
    // Up to two live readings per round, each shown once.
    const chips = (i: number) => readings.slice(i, i + 1).concat(i === 0 ? readings.slice(3, 4) : []);
    return {
      source: written ? 'gemini' : 'authored',
      live,
      quips: {},
      stories: picked.map((s) => s.id),
      crises: picked.map((s, i) => storyCrisis(i + 1, s, chips(i), written ? { title: written.rounds[i]!.title.trim(), text: written.rounds[i]!.text.trim() } : undefined)),
    };
  };
}

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
