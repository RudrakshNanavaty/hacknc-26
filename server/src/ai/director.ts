// The Gemini Game Director. It PROPOSES; shared/src/game/director.ts VALIDATES; rooms.ts APPLIES.
//
//   publicState(room, null) -> directorFacts() -> Gemini structured JSON -> validate* -> deterministic transition -> record
//
// The model only ever sees public game state (never hidden card picks, never player names), so a hint
// cannot hand one player information the others lack. Every call has a timeout; a missing key, a slow
// answer or malformed JSON throws AIError and the template already on screen stays.
import {
  DIRECTOR_EVENTS, DISTRICTS, EVENT_RULES, EVENT_TYPES, PERSONA_INFO, PROJECTS, REACTIONS, ROLES, COMBOS, checkSpoken, districtById, districtFacts,
  type ComboInReach, type EventType, type Explanation, type RoleId, type RoomState, type TableHint,
} from '@shared';
import { GROUNDED, type Gemini } from './gemini';

/** The facts every Director prompt is given: public state only. */
export function directorFacts(state: RoomState) {
  const last = state.history.at(-1);
  return {
    city: 'Miami Beach, Florida',
    note: 'A city-planning game on real Miami Beach zoning and FEMA flood data. Effects are illustrative game values.',
    round: state.round,
    phase: state.phase,
    crisis: state.crisis ? { title: state.crisis.title, text: state.crisis.text, spotlight: state.crisis.spotlight.map((d) => districtById(d).name) } : null,
    // The real civic story this round re-enacts: characters speak to their part in it.
    realStory: state.crisis?.story
      ? {
          title: state.crisis.story.title, years: state.crisis.story.years, summary: state.crisis.story.summary, facts: state.crisis.story.facts,
          parts: Object.fromEntries(Object.entries(state.crisis.story.roles).map(([r, v]) => [r, { standsInFor: v.counterpart, wants: v.stance }])),
        }
      : null,
    indicators: state.city.indicators,
    places: DISTRICTS.map((d) => ({ id: d.id, name: d.name, shore: d.shore, facts: districtFacts(d) })),
    stakeholders: [
      ...state.players.map((p) => ({ role: p.persona, name: PERSONA_INFO[p.persona].name, voice: PERSONA_INFO[p.persona].voice, goal: PERSONA_INFO[p.persona].goal })),
    ],
    table: state.board
      ? {
          proposals: state.board.proposals.map((p) => ({ id: p.id, by: p.persona, project: PROJECTS[p.kind].name, place: districtById(p.district).name, delayed: p.carried })),
          cards: state.board.attachments.map((a) => ({ by: a.persona, card: state.crisis?.skins?.[a.card]?.name ?? a.card, place: districtById(a.district).name, on: a.proposalId })),
          conditions: state.board.compromises.map((c) => ({ id: c.id, title: c.title, on: c.proposalId, accepted: c.accepted })),
          moves: state.actions.map((a) => ({ by: a.persona, move: a.move, on: a.proposalId })),
        }
      : null,
    lastRound: last
      ? {
          outcomes: last.resolution.outcomes.map((o) => ({ by: o.persona, project: PROJECTS[o.kind].name, place: districtById(o.district).name, result: o.status, conditions: o.conditions })),
          combos: last.resolution.combos.map((c) => COMBOS[c.combo].name),
        }
      : null,
    // Only a twist that has happened: during the crisis the template twist may still be replaced.
    twist: state.event && state.phase !== 'crisis' ? { title: state.event.title, place: districtById(state.event.district).name, narrative: state.event.narrative } : null,
  };
}

export type DirectorFacts = ReturnType<typeof directorFacts>;

const PERSONAS_TEXT = `Characters (nuanced people, never caricatures):
- Mayor: pragmatic, budget-wary, politically cautious, dry humor. ("We have three disasters and one budget. Fantastic.")
- Resident: affordability, safety, getting to the beach.
- Environmental Activist: habitat and the long term; passionate but willing to deal.
- Resort Owner: ambitious, persuasive, a bit opportunistic.
- Fisherman (not a player): working-waterfront livelihoods; direct, witty, wary of development. ("Great, another luxury marina. Guess my boat's becoming a tourist attraction.")`;

export interface Director {
  /** Up to one line per speaker for the current moment (raw: rooms.applyDialogue validates). */
  dialogue(facts: DirectorFacts, speakers: RoleId[], moment: string): Promise<unknown[]>;
  /** A twist proposal (raw: rooms.proposeEvent validates). */
  event(facts: DirectorFacts, round: number, fired: EventType[]): Promise<unknown>;
  /** Wording for hints the engine found, and an explanation for a combo in reach (raw). */
  hints(facts: DirectorFacts, hints: TableHint[], reach: ComboInReach[]): Promise<{ suggestions: unknown[]; combos: unknown[] }>;
  /** A plain-language version of a template explanation, or throw. */
  explain(e: Explanation): Promise<string>;
}

/** Where each twist type may happen, from the real facts: the model chooses from this list. */
export function allowedEvents(fired: EventType[]) {
  return EVENT_TYPES.filter((t) => !fired.includes(t)).map((t) => ({
    type: t,
    title: DIRECTOR_EVENTS[t].title,
    places: DISTRICTS.filter((d) => DIRECTOR_EVENTS[t].where(d).ok).map((d) => d.id),
  }));
}

/** Long enough for a structured answer on a busy key; a late answer simply finds its moment gone. */
export function geminiDirector(gemini: Gemini, timeoutMs = 8_000): Director | null {
  if (!gemini.ready()) return null;
  return {
    async dialogue(facts, speakers, moment) {
      const { lines } = await gemini.json<{ lines: unknown[] }>({
        system: `You write speech bubbles for characters standing on the map in "consensusclub", a playful city-planning game.
${PERSONAS_TEXT}
Write at most one line per character listed in "speakers": 8 to 15 words, in character, funny and warm, general-audience safe.
React to the current moment (${moment}): the crisis, the cards just played, the deals on the table, or what was decided.
When facts.realStory is given, this round re-enacts that real Miami Beach story: each character speaks from their part in it (realStory.parts: who they stand in for and what they want), using only its facts.
Pick each character's reaction from the given list only. Optionally name the place id where they stand.
- Do not decide or predict outcomes; only react to the facts.
${GROUNDED}`,
        prompt: JSON.stringify({ speakers, reactions: REACTIONS, facts }),
        schema: {
          type: 'object',
          properties: {
            lines: {
              type: 'array', maxItems: 6,
              items: {
                type: 'object',
                properties: {
                  speaker: { type: 'string', enum: ROLES.filter((r) => speakers.includes(r)) },
                  line: { type: 'string' },
                  reaction: { type: 'string', enum: [...REACTIONS] },
                  district: { type: 'string', enum: DISTRICTS.map((d) => d.id) },
                },
                required: ['speaker', 'line', 'reaction'],
              },
            },
          },
          required: ['lines'],
        },
        temperature: 0.9,
        timeoutMs,
      });
      return Array.isArray(lines) ? lines : [];
    },

    async event(facts, round, fired) {
      const allowed = allowedEvents(fired);
      return gemini.json<unknown>({
        system: `You are the Game Director of "consensusclub", a city-planning game on real Miami Beach data. Propose ONE twist for round ${round} that raises the tension in an interesting, fair way.
Choose the type and a place from "allowed" only, a magnitude from ${EVENT_RULES.magnitude.min} to ${EVENT_RULES.magnitude.max}, and write a one-sentence narrative (no numbers, under 25 words) in the playful voice of the game's narrator.
- This is game fiction: never present it as a real event, forecast, alert or "breaking" news, and never name real agencies (NOAA, NWS, FEMA). The game computes all effects; do not state any.
${GROUNDED}`,
        prompt: JSON.stringify({ allowed, facts }),
        schema: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: allowed.map((a) => a.type) },
            district: { type: 'string', enum: DISTRICTS.map((d) => d.id) },
            magnitude: { type: 'integer' },
            narrative: { type: 'string' },
            tension: { type: 'string', enum: ['low', 'medium', 'high'] },
          },
          required: ['type', 'district', 'magnitude', 'narrative', 'tension'],
        },
        temperature: 0.8,
        timeoutMs,
      });
    },

    async hints(facts, hints, reach) {
      const out = await gemini.json<{ suggestions: unknown[]; combos: unknown[] }>({
        system: `You coach the whole negotiating table in "consensusclub" (everyone sees the same hints). The game engine has already found which moves would change an outcome ("hints") and which authored combos are within reach ("reach").
Rewrite each hint as a short, friendly pitch (under 30 words) that names who could do it and what would change. Never invent a move, a combo or an effect; only use the hint ids and combo ids given. Players decide; you only point things out.
For combos in reach, explain in one sentence why the pairing works. If you think of a new combo that is not in the list, put it in "novelIdea" (it will be reviewed by a designer, never played).
${GROUNDED}`,
        prompt: JSON.stringify({ hints: hints.filter((h) => h.kind !== 'combo').map((h) => ({ id: h.id, text: h.text })), reach: reach.map((r) => ({ combo: r.combo, name: COMBOS[r.combo].name, recipe: COMBOS[r.combo].recipe, proposalIds: r.proposalIds, needs: r.needs })), facts }),
        schema: {
          type: 'object',
          properties: {
            suggestions: { type: 'array', maxItems: 4, items: { type: 'object', properties: { hint: { type: 'string' }, pitch: { type: 'string' } }, required: ['hint', 'pitch'] } },
            combos: {
              type: 'array', maxItems: 3,
              items: { type: 'object', properties: { combo: { type: 'string' }, proposalIds: { type: 'array', items: { type: 'string' } }, explanation: { type: 'string' }, novelIdea: { type: 'string' } }, required: ['combo', 'proposalIds', 'explanation'] },
            },
          },
          required: ['suggestions', 'combos'],
        },
        temperature: 0.6,
        timeoutMs,
      });
      return { suggestions: Array.isArray(out.suggestions) ? out.suggestions : [], combos: Array.isArray(out.combos) ? out.combos : [] };
    },

    async explain(e) {
      const { answer } = await gemini.json<{ answer: string }>({
        system: `You explain a rule of "consensusclub", a planning game on real Miami Beach data, to a player in two plain sentences (under 60 words). Use only the facts given: the game's rules and the real zoning and FEMA measurements. Do not add science, economics or advice.
${GROUNDED}`,
        prompt: JSON.stringify({ question: e.question, answer: e.answer, facts: e.facts }),
        schema: { type: 'object', properties: { answer: { type: 'string' } }, required: ['answer'] },
        temperature: 0.3,
        timeoutMs,
        check: ({ answer }) => {
          if (typeof answer !== 'string' || answer.trim().length < 10) return 'empty answer';
          if (answer.length > 500) return 'too long';
          return checkSpoken(answer, e);
        },
      });
      return answer.trim();
    },
  };
}
