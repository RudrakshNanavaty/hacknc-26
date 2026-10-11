// The casting agent: for each reviewed civic story, Gemini proposes how the game's characters fit
// the real story (which real person or group each one stands in for, what they want, their opening
// script), which 4 of each persona's 6 cards the story deals, and story names and lines for those
// cards. validateCast (shared/src/game/story.ts) checks every field; a rejected cast gets one retry
// with the reasons, and a story that still fails is left uncast (the game will not use it).
//
//   npx tsx --env-file=.env pipeline/cast-stories.ts            # cast every approved story without a cast
//   npx tsx --env-file=.env pipeline/cast-stories.ts --all      # recast everything
//
// Then reload Snowflake: npx tsx --env-file=.env pipeline/snowflake-load.ts
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CARDS, CRISIS_KINDS, CRISIS_KIND_INFO, DISTRICTS, HAND_SIZE, PERSONAS, PERSONA_INFO, REACTIONS, ROLES, SCENARIO_ROLES,
  districtFacts, handOf, projectEligibility, storyFacts, validateCast, type CivicStory,
} from '../shared/src/index';
import { GROUNDED, gemini } from '../server/src/ai/gemini';

const HERE = dirname(fileURLToPath(import.meta.url));
const FILE = join(HERE, 'research', 'miami-beach-civic-corpus.json');
const corpus = JSON.parse(readFileSync(FILE, 'utf8')) as { items: (CivicStory & { review_status: string; verification: { status: string } })[] };
const all = process.argv.includes('--all');

// Approved in Snowflake: everything checked or resolved (the 3 conflicts stay out).
const approved = (s: (typeof corpus.items)[number]) => s.verification.status !== 'conflict' && s.scope !== 'new-area';

const SYSTEM = `You are the casting agent of "consensusclub", a four-player city-planning card game set in the real city of Miami Beach. You map a REAL civic story onto the game's fixed cast so a round of play re-enacts its real tensions.
The cast: Mayor (pragmatic, budget-wary, politically cautious, dry humor), Environmental Activist (habitat and the long term, passionate but willing to deal), Resort Owner (ambitious, persuasive, a bit opportunistic), Resident (affordability, safety, getting to the beach; tired of flooded streets), and the Fisherman (not a player: working waterfront, clean water, direct and witty).
For each character:
- counterpart: the real person or group from the story's "sides" they stand in for, copied from "who", or "none" if no side fits. Never invent real people.
- stance: what they want in THIS story, 8-30 words, true to the real positions in "sides".
- line: their opening speech bubble, 5-16 words, in character, warm and witty, general-audience safe.
- reaction: one of the given reactions.
Choose "kind" (the crisis kind that best fits the story) and, only for citywide stories, the "district" id where it plays best.
Deal each persona exactly ${HAND_SIZE} of their own cards (ids given), most fitting the story first; include at least one project card the real zoning allows in the district whenever the persona has one (see allowedIn).
For EVERY card in every deck (all of them, dealt or not) write a skin: "name" (1-4 words, a story-specific name for the same action, e.g. "Refuse the Harmonization Deal" for a petition) and "line" (5-16 words the owner says when playing it, about this story).
- Do not change what a card does; only name it for the story.
- Players are all ages: never use words like kill, dead, die, hate or stupid (say "fish die-off" as "fish loss", for example).
- Do not decide outcomes or invent events beyond the story.
${GROUNDED}`;

function prompt(s: CivicStory, problems?: string[]) {
  const districts = DISTRICTS.map((d) => ({ id: d.id, name: d.name, facts: districtFacts(d) }));
  const decks = Object.fromEntries(
    PERSONAS.map((p) => [p, handOf(p).map((id) => {
      const c = CARDS[id];
      const where = c.project ? Object.fromEntries(DISTRICTS.map((d) => [d.id, projectEligibility(c.project!, d).ok])) : null;
      return { id, name: c.name, category: c.category, does: c.text, allowedIn: where };
    })]),
  );
  return JSON.stringify({
    story: { ...storyFacts(s), area: s.area, scope: s.scope, tensions: s.tensions, concerns: s.concerns, cardIdeas: s.card_ideas },
    cast: { ...Object.fromEntries(PERSONAS.map((p) => [p, { goal: PERSONA_INFO[p].goal }])), fisherman: { goal: SCENARIO_ROLES.fisherman.goal } },
    kinds: Object.fromEntries(CRISIS_KINDS.map((k) => [k, CRISIS_KIND_INFO[k].label])),
    reactions: REACTIONS,
    districts,
    decks,
    ...(problems ? { yourLastAnswerWasRejectedFor: problems } : {}),
  });
}

const roleSchema = {
  type: 'object',
  properties: { counterpart: { type: 'string' }, stance: { type: 'string' }, line: { type: 'string' }, reaction: { type: 'string', enum: [...REACTIONS] } },
  required: ['counterpart', 'stance', 'line', 'reaction'],
};
const schema = {
  type: 'object',
  properties: {
    kind: { type: 'string', enum: [...CRISIS_KINDS] },
    district: { type: 'string', enum: DISTRICTS.map((d) => d.id) },
    roles: { type: 'object', properties: Object.fromEntries(ROLES.map((r) => [r, roleSchema])), required: [...ROLES] },
    hands: {
      type: 'object',
      properties: Object.fromEntries(PERSONAS.map((p) => [p, { type: 'array', minItems: HAND_SIZE, maxItems: HAND_SIZE, items: { type: 'string', enum: handOf(p) } }])),
      required: [...PERSONAS],
    },
    skins: {
      type: 'object',
      properties: Object.fromEntries(Object.keys(CARDS).map((id) => [id, { type: 'object', properties: { name: { type: 'string' }, line: { type: 'string' } }, required: ['name', 'line'] }])),
      required: Object.keys(CARDS),
    },
  },
  required: ['kind', 'district', 'roles', 'hands', 'skins'],
};

async function cast(s: CivicStory) {
  let problems: string[] | undefined;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const raw = await gemini.json<unknown>({ system: SYSTEM, prompt: prompt(s, problems), schema, temperature: 0.7, timeoutMs: 45_000 });
      const v = validateCast(raw, s);
      if (v.ok) return { ...v.value, castBy: 'gemini' as const, castAt: new Date().toISOString() };
      problems = v.reasons.slice(0, 12);
    } catch (err) {
      problems = [(err as Error).message];
    }
  }
  console.warn(`  ✗ ${s.id}: ${problems?.join(' | ')}`);
  return null;
}

if (!gemini.ready()) {
  console.error('GEMINI_API_KEY is not set.');
  process.exit(1);
}
const todo = corpus.items.filter((s) => approved(s) && (all || !s.cast));
console.log(`casting ${todo.length} stories…`);
const queue = [...todo];
let ok = 0;
await Promise.all(
  Array.from({ length: 5 }, async () => {
    for (let s = queue.shift(); s; s = queue.shift()) {
      const c = await cast(s);
      if (c) {
        s.cast = c;
        ok += 1;
        console.log(`  ✓ ${s.id}: ${c.kind} in ${c.district}; mayor ~ ${c.roles.mayor.counterpart ?? 'none'}, resort ~ ${c.roles.resort.counterpart ?? 'none'}`);
      }
    }
  }),
);
writeFileSync(FILE, JSON.stringify(corpus, null, 2) + '\n');
console.log(`cast ${ok} of ${todo.length}; wrote ${FILE}`);
