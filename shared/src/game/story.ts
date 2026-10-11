// Real civic stories as rounds. Each story comes from the reviewed research corpus (Snowflake
// COASTAL_CLASH.CORPUS.APPROVED_ISSUES) with its sources, and carries a CAST written offline by the
// casting agent (pipeline/cast-stories.ts): which real-world actor each character stands in for, each
// character's opening script, the 4 cards each persona is dealt for this story, and story names for
// those cards. The cast only chooses among authored things (cards, reactions, crisis kinds, areas);
// it never changes what a card does. validateCast checks every field before anything is stored.
import { CARDS, HAND_SIZE, PERSONAS, handOf, type CardId, type PersonaId } from './content';
import { DISTRICT_IDS, districtById, isDistrictId, projectEligibility } from './districts';
import { checkSpoken, type Verdict } from './director';
import { REACTIONS, ROLES, isReaction, wordCount, type Reaction, type RoleId } from './living';
import { CRISIS_KINDS, CRISIS_KIND_INFO, type Crisis, type CrisisKind } from './scenario';

export interface StorySource {
  /** `${storyId}#${index}`: what a crisis cites. */
  id: string;
  title: string;
  outlet: string;
  url: string;
  kind: 'official' | 'news' | 'advocacy' | 'industry' | 'other';
}

/** The research reviewer's report on a story: did the sources agree, and what was done about it. */
export interface StoryVerification {
  status: 'sources-checked' | 'resolved' | 'conflict';
  notes: string[];
  resolution?: string;
}

export interface StorySide {
  who: string;
  position: string;
  quote?: string;
}

/** One character's part in a story. */
export interface StoryRole {
  /** The real person or group this character stands in for, from the story's sides (or null). */
  counterpart: string | null;
  /** What this character wants in this story (the player's agenda for the round). */
  stance: string;
  /** Their opening line when the crisis is announced. */
  line: string;
  reaction: Reaction;
}

export interface CardSkin {
  /** The card's name in this story (the authored mechanic is unchanged). */
  name: string;
  /** What the character says when they play it. */
  line: string;
}

export interface StoryCast {
  kind: CrisisKind;
  /** The playable area the story is set in. */
  district: string;
  roles: Record<RoleId, StoryRole>;
  /** HAND_SIZE cards per persona, most fitting first (bots play in this order). */
  hands: Record<PersonaId, CardId[]>;
  skins: Partial<Record<CardId, CardSkin>>;
  castBy: 'gemini' | 'authored';
  castAt: string;
}

export interface CivicStory {
  id: string;
  title: string;
  area: string;
  scope: 'area' | 'citywide' | 'new-area';
  category: string;
  years: string;
  summary: string;
  facts: string[];
  sides: StorySide[];
  tensions: string[];
  concerns: string[];
  card_ideas: string[];
  sources: Omit<StorySource, 'id'>[];
  cast?: StoryCast | null;
  verification?: StoryVerification | null;
  /** When the sources were retrieved (YYYY-MM-DD). */
  retrieved_at?: string | null;
}

/** What a crisis carries about its story (shown on the crisis card and kept in the match record). */
export interface CrisisStory {
  id: string;
  title: string;
  years: string;
  summary: string;
  facts: string[];
  sides: StorySide[];
  concerns: string[];
  sources: StorySource[];
  roles: Record<RoleId, StoryRole>;
  verification?: StoryVerification | null;
  retrievedAt?: string | null;
}

export const storySources = (s: CivicStory): StorySource[] => s.sources.map((x, i) => ({ ...x, id: `${s.id}#${i}` }));

/** The facts a story's text may use: numbers in anything written about it must appear here. */
export const storyFacts = (s: CivicStory) => ({ title: s.title, years: s.years, summary: s.summary, facts: s.facts, sides: s.sides });

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').slice(0, max) : '');

/** A story's playable area: its own, or (citywide) the one the cast chose. */
export function storyDistrict(s: CivicStory, chosen?: unknown): string | null {
  if (isDistrictId(s.area)) return s.area;
  if (s.scope === 'citywide' && isDistrictId(chosen)) return chosen;
  return null;
}

/** Check a cast proposed for a story. Every string a player reads is safe and invents no numbers. */
export function validateCast(raw: unknown, s: CivicStory): Verdict<Omit<StoryCast, 'castBy' | 'castAt'>> {
  const reasons: string[] = [];
  if (!isObj(raw)) return { ok: false, reasons: ['not an object'] };
  const facts = storyFacts(s);
  const kind = raw.kind as CrisisKind;
  if (!CRISIS_KINDS.includes(kind)) reasons.push(`unknown kind ${String(raw.kind)}`);
  const district = storyDistrict(s, raw.district);
  if (!district) reasons.push(s.scope === 'new-area' ? 'story is outside the playable areas' : `bad district ${String(raw.district)}`);

  const roles = {} as Record<RoleId, StoryRole>;
  const rolesRaw = isObj(raw.roles) ? raw.roles : {};
  for (const r of ROLES) {
    const x = rolesRaw[r];
    if (!isObj(x)) { reasons.push(`missing role ${r}`); continue; }
    const stance = text(x.stance, 220);
    const line = text(x.line, 140);
    const counterpart = typeof x.counterpart === 'string' && x.counterpart.trim() && !/^none$/i.test(x.counterpart.trim()) ? text(x.counterpart, 80) : null;
    if (counterpart && !s.sides.some((side) => side.who.toLowerCase().includes(counterpart.toLowerCase()) || counterpart.toLowerCase().includes(side.who.toLowerCase()))) {
      reasons.push(`${r}: counterpart "${counterpart}" is not one of the story's sides`);
    }
    if (wordCount(stance) < 5 || wordCount(stance) > 35) reasons.push(`${r}: stance must be 5-35 words`);
    if (wordCount(line) < 3 || wordCount(line) > 18) reasons.push(`${r}: line must be 3-18 words`);
    if (!isReaction(x.reaction)) reasons.push(`${r}: unknown reaction ${String(x.reaction)}`);
    for (const t of [stance, line]) {
      const p = checkSpoken(t, facts);
      if (p) reasons.push(`${r}: ${p}`);
    }
    roles[r] = { counterpart, stance, line, reaction: (isReaction(x.reaction) ? x.reaction : 'idle') as Reaction };
  }

  const hands = {} as Record<PersonaId, CardId[]>;
  const handsRaw = isObj(raw.hands) ? raw.hands : {};
  for (const p of PERSONAS) {
    const own = handOf(p);
    const h = Array.isArray(handsRaw[p]) ? [...new Set((handsRaw[p] as unknown[]).map(String))] : [];
    if (h.length !== HAND_SIZE || !h.every((c) => own.includes(c as CardId))) {
      reasons.push(`${p}: hand must be ${HAND_SIZE} distinct cards of their own deck`);
      continue;
    }
    const ids = h as CardId[];
    // Something to propose where the story is, whenever the real zoning lets this persona build there.
    const canBuild = district ? own.filter((c) => CARDS[c].project && projectEligibility(CARDS[c].project!, districtById(district)).ok) : [];
    if (canBuild.length && !ids.some((c) => canBuild.includes(c))) reasons.push(`${p}: deal at least one of ${canBuild.join(', ')} (allowed in ${district})`);
    hands[p] = ids;
  }

  const skins: Partial<Record<CardId, CardSkin>> = {};
  const skinsRaw = isObj(raw.skins) ? raw.skins : {};
  for (const id of Object.values(hands).flat()) {
    const x = skinsRaw[id];
    if (!isObj(x)) { reasons.push(`missing skin for ${id}`); continue; }
    const name = text(x.name, 40);
    const line = text(x.line, 140);
    if (wordCount(name) < 1 || wordCount(name) > 5 || name.length > 32) reasons.push(`${id}: name must be 1-5 words, 32 characters`);
    if (wordCount(line) < 3 || wordCount(line) > 18) reasons.push(`${id}: line must be 3-18 words`);
    for (const t of [name, line]) {
      const p = checkSpoken(t, facts);
      if (p) reasons.push(`${id}: ${p}`);
    }
    skins[id] = { name, line };
  }

  if (reasons.length) return { ok: false, reasons };
  return { ok: true, value: { kind, district: district!, roles, hands, skins }, clamped: [] };
}

// ---------- From stories to a match ----------

/** A small seeded generator: the same seed picks the same stories. */
function rng(seed: number) {
  let x = seed >>> 0 || 1;
  return () => ((x = (Math.imul(x ^ (x >>> 15), 2246822507) + 0x9e3779b9) >>> 0) / 2 ** 32);
}

/** Stories a match can use: reviewed, cast, and set in a playable area. */
export const playableStories = (all: CivicStory[]) => all.filter((s) => s.cast && isDistrictId(s.cast.district));

/**
 * Three stories for three rounds: different stories, spread over areas and kinds where possible,
 * round 3 preferring a flood or storm story (the storm test follows it).
 */
export function pickStories(all: CivicStory[], seed: number): CivicStory[] {
  const pool = playableStories(all);
  if (pool.length < 3) return [];
  const r = rng(seed);
  const shuffled = pool.map((s) => ({ s, k: r() })).sort((a, b) => a.k - b.k).map((x) => x.s);
  const picked: CivicStory[] = [];
  const score = (s: CivicStory) =>
    (picked.some((p) => p.cast!.district === s.cast!.district) ? 2 : 0) + (picked.some((p) => p.cast!.kind === s.cast!.kind) ? 1 : 0) + (picked.some((p) => p.category === s.category) ? 1 : 0);
  for (let round = 1; round <= 3; round++) {
    const left = shuffled.filter((s) => !picked.includes(s));
    const ranked = left.sort((a, b) => {
      const storm = (s: CivicStory) => (round === 3 && !['flood', 'storm'].includes(s.cast!.kind) ? 1 : 0);
      return score(a) + storm(a) - (score(b) + storm(b));
    });
    picked.push(ranked[0]!);
  }
  return picked;
}

/** A crisis from a story; `written` is the scenario desk's title and text when Gemini wrote them. */
export function storyCrisis(round: number, s: CivicStory, readings: string[], written?: { title: string; text: string; spotlight?: string[] }): Crisis {
  const cast = s.cast!;
  const extra = (written?.spotlight ?? []).filter((d) => isDistrictId(d) && d !== cast.district).slice(0, 1);
  const storm = round === 3 && !/storm tests/i.test(written?.text ?? '') ? ' When this round ends, a storm tests the city’s flood resilience.' : '';
  return {
    id: `r${round}-${s.id}`,
    round,
    kind: cast.kind,
    title: written?.title ?? s.title,
    text: `${written?.text ?? s.summary}${storm}`,
    spotlight: [cast.district, ...extra],
    bonus: CRISIS_KIND_INFO[cast.kind].bonus,
    readings,
    refs: s.sources.map((x) => x.url),
    source: written ? 'gemini' : 'authored',
    story: {
      id: s.id, title: s.title, years: s.years, summary: s.summary, facts: s.facts, sides: s.sides, concerns: s.concerns,
      sources: storySources(s), roles: cast.roles, verification: s.verification ?? null, retrievedAt: s.retrieved_at ?? null,
    },
    hands: cast.hands,
    skins: cast.skins,
  };
}

/** The name a card goes by this round (its story name, else its own). */
export const cardName = (id: CardId, crisis?: Crisis | null) => crisis?.skins?.[id]?.name ?? CARDS[id].name;

export { REACTIONS, DISTRICT_IDS };
