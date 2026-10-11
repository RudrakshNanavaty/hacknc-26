// The news desk's template lines. They are always ready (no network), so a match never waits on
// Gemini. The server may swap in a Gemini line built from the same facts (narrationFacts) if it
// passes the number check; otherwise these stand.
import { CARDS, INDICATORS, INDICATOR_INFO, PERSONA_INFO, PROJECTS, type CardId, type Indicators, type PersonaId } from './content';
import { districtById } from './districts';
import type { Board, FinalResult, Resolution } from './engine';
import type { Crisis } from './scenario';

/** What each card says about its player, for "Breaking news" lines. */
const QUIPS: Record<CardId, string> = {
  'emergency-funding': 'has brought an emergency grant and a very serious face',
  'fast-track': 'is waving a fast-track stamp',
  'drainage-upgrade': 'wants pumps, pipes and a ribbon-cutting',
  'living-shoreline': 'wants mangroves where the concrete was',
  'environmental-challenge': 'has brought a lawsuit',
  'public-campaign': 'has organized a rally with surprisingly good signs',
  'hotel-development': 'wants another beachfront hotel',
  'private-investment': 'has a checkbook and a business card',
  'tourism-campaign': 'has hired a jingle writer',
  'elevate-buildings': 'wants to put the houses on stilts',
  'neighborhood-petition': 'has four hundred signatures and a clipboard',
  'public-access-guarantee': 'just wants a way to get to the beach',
  'seawall-upgrade': 'wants a taller wall and a bigger ribbon',
  'resilience-bond': 'is borrowing against the future, very responsibly',
  'building-moratorium': 'has hit the pause button on the cranes',
  'dune-restoration': 'is planting sea oats one by one',
  'habitat-survey': 'has binoculars and a list of nesting birds',
  'eco-certification': 'is handing out green gold stars, with conditions',
  'marina-expansion': 'wants more yacht slips on the bay',
  'lobbying-blitz': 'has booked every lunch table at City Hall',
  'community-benefits': 'is promising public amenities, lots of them',
  'workforce-housing': 'wants homes that teachers and nurses can afford',
  'flood-watch': 'has a flashlight, a rake and a group chat',
  'rent-shield': 'wants renters protected before the next luxury tower',
};

const name = (p: PersonaId) => PERSONA_INFO[p].name.replace('Environmental ', '').toLowerCase();

export function crisisHeadline(crisis: Crisis, round: number): string {
  const text = crisis.text.replace(/^Scenario: /, '');
  return `Round ${round}: ${crisis.title}. ${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}

export function revealHeadline(board: Board): string {
  const plays = [...board.attachments.map((a) => ({ persona: a.persona, card: a.card })), ...board.proposals.filter((p) => !p.carried).map((p) => ({ persona: p.persona, card: cardFor(p.kind) }))];
  if (!plays.length) return 'Breaking news: nobody played a card. Experts call it "the quietest council meeting in Miami Beach history."';
  const [lead, ...rest] = plays.sort((a, b) => (CARDS[a.card].category === 'project' ? -1 : 1) - (CARDS[b.card].category === 'project' ? -1 : 1));
  const tail = rest.map((p, i) => `${i === rest.length - 1 && rest.length > 1 ? 'and ' : ''}the ${name(p.persona)} ${QUIPS[p.card]}`).join(', ');
  return `Breaking news! The ${name(lead!.persona)} ${QUIPS[lead!.card]}.${tail ? ` Meanwhile, ${tail}.` : ''}`;
}

const cardFor = (kind: string): CardId =>
  (Object.values(CARDS).find((c) => c.project === kind)?.id ?? 'drainage-upgrade') as CardId;

const STATUS_WORD = { approved: 'approved', blocked: 'blocked', rejected: 'voted down', delayed: 'delayed', unfunded: 'stuck without funding' } as const;

export function resolutionHeadline(r: Resolution): string {
  if (!r.outcomes.length) return 'No projects on the table this round. The city exhales; the tide does not.';
  const parts = r.outcomes.map((o) => `the ${PROJECTS[o.kind].name.toLowerCase()} in ${districtById(o.district).name} is ${STATUS_WORD[o.status]}${o.conditions.length ? ` with a ${o.conditions[0]!.toLowerCase()}` : ''}`);
  const first = parts[0]!;
  const lead = `${first.charAt(0).toUpperCase()}${first.slice(1)}`;
  return `${lead}${parts.length > 1 ? `; ${parts.slice(1).join('; ')}` : ''}. ${changeLine(r.before, r.after)}`;
}

export function changeLine(before: Indicators, after: Indicators): string {
  const moved = INDICATORS.filter((k) => after[k] !== before[k]).map((k) => `${INDICATOR_INFO[k].short.toLowerCase()} ${after[k] > before[k] ? 'up' : 'down'} ${Math.abs(after[k] - before[k])}`);
  return moved.length ? `On the scoreboard: ${moved.join(', ')}.` : 'The city indicators did not move.';
}

export function finalHeadline(f: FinalResult): string {
  const winners = f.winners.map((p) => `the ${name(p)}`).join(' and ');
  return f.viable
    ? `That's the session. Miami Beach is still standing, and ${winners} ${f.winners.length > 1 ? 'share' : 'takes'} the day.`
    : `That's the session. Miami Beach is in trouble (${f.failing.map((k) => INDICATOR_INFO[k].short.toLowerCase()).join(', ')} too low), so everyone's score is halved. ${winners} still ${f.winners.length > 1 ? 'come' : 'comes'} out on top.`;
}

/** The facts a narrator may use. Every number in a narrated line must appear here. */
export function narrationFacts(kind: 'reveal' | 'resolution', board: Board, r?: Resolution) {
  return {
    city: 'Miami Beach, Florida',
    round: board.round,
    crisis: board.crisis.title,
    cards: [
      ...board.proposals.map((p) => ({ player: PERSONA_INFO[p.persona].name, card: PROJECTS[p.kind].name, place: districtById(p.district).name, delayedFromEarlier: p.carried })),
      ...board.attachments.map((a) => ({ player: PERSONA_INFO[a.persona].name, card: CARDS[a.card].name, place: districtById(a.district).name })),
    ],
    compromisesOnTable: board.compromises.map((c) => c.title),
    ...(kind === 'resolution' && r
      ? {
          outcomes: r.outcomes.map((o) => ({ project: PROJECTS[o.kind].name, place: districtById(o.district).name, proposedBy: PERSONA_INFO[o.persona].name, result: STATUS_WORD[o.status], conditions: o.conditions })),
          indicatorChanges: Object.fromEntries(INDICATORS.filter((k) => r.after[k] !== r.before[k]).map((k) => [INDICATOR_INFO[k].label, r.after[k] - r.before[k]])),
        }
      : {}),
    personas: Object.fromEntries(Object.values(PERSONA_INFO).map((p) => [p.name, p.voice])),
  };
}
