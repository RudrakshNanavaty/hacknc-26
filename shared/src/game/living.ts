// The living city: who stands on the map, what they say and how they react. Everything here is
// presentation, never rules: speech bubbles and moods are derived from what the engine already
// decided. Template lines are always ready (no network); the server may swap in Gemini lines that
// pass validation (server/src/ai/director.ts), but only from this fixed reaction vocabulary.
import { CARDS, PERSONA_INFO, PERSONAS, PROJECTS, type CardId, type Crisis, type CrisisId, type PersonaId, type ProjectKind } from './content';
import type { Board, FinalResult, OutcomeStatus, Resolution } from './engine';

/** A non-player role a scenario puts on the map. It talks and reacts; it never plays cards. */
export interface ScenarioRole {
  id: 'fisherman';
  name: string;
  title: string;
  goal: string;
  voice: string;
  emoji: string;
  color: string;
  /** The area it hangs around (decorative: not a surveyed position). */
  home: string;
}

export const SCENARIO_ROLES: Record<ScenarioRole['id'], ScenarioRole> = {
  fisherman: {
    id: 'fisherman',
    name: 'Fisherman',
    title: 'Lou Ferreira, South Pointe pier regular',
    goal: 'Keep the working waterfront working: clean water, open docks, fish worth catching.',
    voice: 'Direct, dry, wary of anything with a yacht slip.',
    emoji: '🎣',
    color: '#2f7fb8',
    home: 'south-pointe',
  },
};

export type RoleId = PersonaId | ScenarioRole['id'];
export const ROLES: readonly RoleId[] = [...PERSONAS, 'fisherman'];
export const isRoleId = (v: unknown): v is RoleId => typeof v === 'string' && (ROLES as readonly string[]).includes(v);
export const roleInfo = (r: RoleId) => (r === 'fisherman' ? SCENARIO_ROLES.fisherman : PERSONA_INFO[r]);

/** The only reactions there are. Each maps to an avatar animation (REACTION_MOOD). */
export const REACTIONS = ['idle', 'celebrate', 'congratulate', 'protest', 'worry', 'negotiate', 'mock', 'conditional-support'] as const;
export type Reaction = (typeof REACTIONS)[number];
export const isReaction = (v: unknown): v is Reaction => typeof v === 'string' && (REACTIONS as readonly string[]).includes(v);

/** Avatar animation states (CSS classes in app/src/styles.css). */
export type Mood = 'idle' | 'walk' | 'celebrate' | 'frustrated' | 'worried' | 'negotiate' | 'smug';
export const REACTION_MOOD: Record<Reaction, Mood> = {
  idle: 'idle',
  celebrate: 'celebrate',
  congratulate: 'celebrate',
  protest: 'frustrated',
  worry: 'worried',
  negotiate: 'negotiate',
  mock: 'smug',
  'conditional-support': 'negotiate',
};

export interface Bubble {
  /** Stable within a moment: `${moment}:${speaker}`. */
  id: string;
  speaker: RoleId;
  text: string;
  reaction: Reaction;
  /** Where the speaker stands while saying it. */
  district: string | null;
  source: 'template' | 'gemini';
}

/** Lines shown at once on the map. Short on purpose: bubbles, not dialogue boxes. */
export const BUBBLE_WORDS = { min: 3, max: 18 } as const;
export const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

const bubble = (moment: string, speaker: RoleId, text: string, reaction: Reaction, district: string | null): Bubble => ({
  id: `${moment}:${speaker}`, speaker, text, reaction, district, source: 'template',
});

// ---------- Template lines (authored; 8-15 words each) ----------

const CRISIS_LINES: Record<CrisisId, Record<RoleId, [string, Reaction]>> = {
  'king-tide': {
    mayor: ['We have three disasters and one budget. Fantastic. Somebody find a pump.', 'worry'],
    activist: ['The bay is telling us something. Maybe this time we listen.', 'worry'],
    resort: ['Seawater in the lobby is terrible for reviews. Let us fix this fast.', 'worry'],
    resident: ['Rubber boots by the door again. West Avenue floods every high tide.', 'protest'],
    fisherman: ['Tide is up to the dock rail. Fish do not mind; my truck does.', 'mock'],
  },
  'hotel-boom': {
    mayor: ['Developers are lining up. So are the lawyers. Delightful.', 'worry'],
    activist: ['Every tower wants a dune view. Nobody wants to keep the dune.', 'protest'],
    resort: ['Occupancy is booming! This is a synergy moment, people.', 'celebrate'],
    resident: ['More hotels, more traffic on my street. Is anyone asking us?', 'worry'],
    fisherman: ['Great, another luxury marina. Guess my boat is a tourist attraction now.', 'mock'],
  },
  'storm-season': {
    mayor: ['A storm offshore and projects half finished. Wonderful timing, as always.', 'worry'],
    activist: ['Dunes and mangroves are free storm armor. Please, let them work.', 'negotiate'],
    resort: ['Storm season means cancellations. Protect the guests, protect the economy.', 'worry'],
    resident: ['I have sandbags, a flashlight and zero faith in the drains.', 'worry'],
    fisherman: ['Boats are tied double. When the sea talks, I listen.', 'worry'],
  },
};

/** What a player says when their card lands. */
const PLAY_LINES: Partial<Record<CardId, string>> = {
  'drainage-upgrade': 'Pumps, pipes and a ribbon-cutting. The streets will thank me.',
  'emergency-funding': 'I found emergency money. Do not ask which couch cushion.',
  'fast-track': 'Fast-track stamp is out. Paperwork, meet the express lane.',
  'living-shoreline': 'Mangroves instead of concrete. Nature did this job for free.',
  'environmental-challenge': 'See you in the hearing room. The dunes have a lawyer now.',
  'public-campaign': 'Signs are printed, chants are rehearsed. The public is with us.',
  'hotel-development': 'Ocean views, rooftop bar, record occupancy. Who is with me?',
  'private-investment': 'My investors love a good resilience story. Checkbook is open.',
  'tourism-campaign': 'New jingle, new billboards. Visitors will come in droves.',
  'elevate-buildings': 'Raise the houses, keep the neighbors. Simple as that.',
  'neighborhood-petition': 'Four hundred signatures and a very determined clipboard.',
  'public-access-guarantee': 'Build it if you want. Just keep a path to the beach.',
  'seawall-upgrade': 'Taller, stronger seawall. The tide can knock all it wants.',
  'resilience-bond': 'We build today and pay tomorrow. Future me will understand.',
  'building-moratorium': 'Everybody put down the cranes until the drains catch up.',
  'dune-restoration': 'Sea oats, sand fencing, patience. Dunes are free storm armor.',
  'habitat-survey': 'Before you pour concrete, meet the birds who live here.',
  'eco-certification': 'Go green and I will cheer. Go grey and I will not.',
  'marina-expansion': 'Yacht slips, a promenade, waterfront dining. Pure synergy.',
  'lobbying-blitz': 'I have booked lunch with every council member. Twice.',
  'community-benefits': 'Public showers, bike racks, a pocket park. Everybody wins, mostly.',
  'workforce-housing': 'Homes for teachers and nurses, built above the flood line.',
  'flood-watch': 'Flashlights, rakes and a group chat. We clear the drains ourselves.',
  'rent-shield': 'Protect the renters first, then we can talk about towers.',
};

const OUTCOME_LINES: Record<OutcomeStatus, [string, Reaction]> = {
  approved: ['Approved! Put my name on the plaque, please.', 'celebrate'],
  blocked: ['Blocked? By a coastal hazard map? Fine. Fine!', 'protest'],
  rejected: ['Voted down. The council will regret this, mark my words.', 'protest'],
  delayed: ['A tie. We will be back next round, stronger.', 'negotiate'],
  unfunded: ['Approved but no money. That is a very expensive maybe.', 'worry'],
};

const FISHER_ON: Partial<Record<ProjectKind, [string, Reaction]>> = {
  hotel: ['Another hotel. More guests, more boats, less room at the pier.', 'mock'],
  marina: ['Great, another luxury marina. Guess my boat is a tourist attraction now.', 'protest'],
  seawall: ['A wall keeps water out. It also keeps the fish out.', 'worry'],
  dune: ['Healthy dunes, healthy beach, healthy fishing. Finally, good news.', 'congratulate'],
  shoreline: ['Mangroves mean baitfish. Baitfish mean dinner. I approve.', 'congratulate'],
  drainage: ['Cleaner runoff into the bay. The snook will be pleased.', 'congratulate'],
};

/** Crisis: everyone gathers at the spotlight and says what worries them. */
export function crisisBubbles(crisis: Crisis, personas: PersonaId[]): Bubble[] {
  const lines = CRISIS_LINES[crisis.id];
  const moment = `crisis-${crisis.round}`;
  const at = (i: number) => crisis.spotlight[i % crisis.spotlight.length] ?? null;
  return [
    ...personas.map((p, i) => bubble(moment, p, lines[p][0], lines[p][1], at(i))),
    bubble(moment, 'fisherman', lines.fisherman[0], lines.fisherman[1], SCENARIO_ROLES.fisherman.home),
  ];
}

/** Reveal: each player talks up their card; whoever is targeted by an opposition card worries. */
export function revealBubbles(board: Board): Bubble[] {
  const moment = `reveal-${board.round}`;
  const out: Bubble[] = [];
  const opposed = new Set(board.attachments.filter((a) => a.proposalId && CARDS[a.card].category === 'opposition').map((a) => a.proposalId!));
  for (const p of board.proposals.filter((x) => !x.carried)) {
    const card = cardFor(p.kind);
    const worried = opposed.has(p.id);
    out.push(bubble(moment, p.persona, worried ? `Wait, who is opposing my ${PROJECTS[p.kind].name.toLowerCase()}? Let us talk.` : PLAY_LINES[card] ?? 'Here is my proposal.', worried ? 'worry' : 'celebrate', p.district));
  }
  for (const a of board.attachments) {
    const cat = CARDS[a.card].category;
    const reaction: Reaction = cat === 'opposition' ? 'protest' : cat === 'negotiation' ? 'conditional-support' : 'congratulate';
    out.push(bubble(moment, a.persona, PLAY_LINES[a.card] ?? `${CARDS[a.card].name}, coming right up.`, reaction, a.district));
  }
  const near = board.proposals.find((p) => p.district === SCENARIO_ROLES.fisherman.home && FISHER_ON[p.kind]);
  if (near) out.push(bubble(moment, 'fisherman', FISHER_ON[near.kind]![0], FISHER_ON[near.kind]![1], near.district));
  return dedupe(out);
}

/** Resolution: owners react to their verdicts; the fisherman has opinions about his waterfront. */
export function resolutionBubbles(r: Resolution): Bubble[] {
  const moment = `resolve-${r.round}`;
  const out: Bubble[] = [];
  for (const o of r.outcomes) {
    const [text, reaction] = OUTCOME_LINES[o.status];
    out.push(bubble(moment, o.persona, o.conditions.length && o.status === 'approved' ? `Approved, with conditions. ${o.conditions[0]}. I can live with that.` : text, reaction, o.district));
  }
  const fish = r.outcomes.find((o) => o.status === 'approved' && FISHER_ON[o.kind]);
  if (fish) out.push(bubble(moment, 'fisherman', FISHER_ON[fish.kind]![0], FISHER_ON[fish.kind]![1], fish.district));
  if (!r.outcomes.length) out.push(bubble(moment, 'fisherman', 'Nothing got built. The tide does not wait for meetings.', 'mock', SCENARIO_ROLES.fisherman.home));
  return dedupe(out);
}

export function finalBubbles(f: FinalResult): Bubble[] {
  return [
    ...f.scores.map((s) => bubble('final', s.persona, f.winners.includes(s.persona) ? 'We did it. Mostly me, but we did it.' : f.viable ? 'Not my best session, but the city is standing.' : 'The city is in trouble. We all lose a little.', f.winners.includes(s.persona) ? 'celebrate' : f.viable ? 'congratulate' : 'worry', null)),
    bubble('final', 'fisherman', f.viable ? 'City still standing. I am going fishing.' : 'Told you so. I am going fishing anyway.', f.viable ? 'congratulate' : 'mock', SCENARIO_ROLES.fisherman.home),
  ];
}

/** One bubble per speaker per moment: the first (most important) wins. */
function dedupe(bs: Bubble[]): Bubble[] {
  const seen = new Set<string>();
  return bs.filter((b) => (seen.has(b.speaker) ? false : (seen.add(b.speaker), true)));
}

const cardFor = (kind: ProjectKind): CardId => (Object.values(CARDS).find((c) => c.project === kind)?.id ?? 'drainage-upgrade') as CardId;
