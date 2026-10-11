// Coastal Clash content: personas, cards, indicators and the scenario. Everything here is authored
// game design. Numbers are ILLUSTRATIVE SCENARIO VALUES (labelled so in the UI and the exports),
// never predictions of what a real project would do. Real-world facts live in districts.json.

export const RULES_VERSION = 'coastal-clash-rules/1.0.0';

export type PersonaId = 'mayor' | 'activist' | 'resort' | 'resident';
export const PERSONAS: readonly PersonaId[] = ['mayor', 'activist', 'resort', 'resident'];
export const isPersonaId = (v: unknown): v is PersonaId => typeof v === 'string' && (PERSONAS as readonly string[]).includes(v);

export type Indicator = 'flood' | 'economy' | 'environment' | 'access' | 'budget';
export const INDICATORS: readonly Indicator[] = ['flood', 'economy', 'environment', 'access', 'budget'];
export type Indicators = Record<Indicator, number>;
export type Delta = Partial<Indicators>;

export const INDICATOR_INFO: Record<Indicator, { label: string; short: string; unit: string; icon: string }> = {
  flood: { label: 'Flood resilience', short: 'Flood', unit: '', icon: '🌊' },
  economy: { label: 'Economic activity', short: 'Economy', unit: '', icon: '💼' },
  environment: { label: 'Environmental health', short: 'Nature', unit: '', icon: '🌿' },
  access: { label: 'Public access', short: 'Access', unit: '', icon: '🏖️' },
  budget: { label: 'Public budget (hypothetical $M)', short: 'Budget', unit: '$M', icon: '🏛️' },
};

/** Where the city starts. Flood resilience starts low: most of the playable area is in FEMA's 1% flood zone. */
export const START_INDICATORS: Indicators = { flood: 35, economy: 55, environment: 40, access: 50, budget: 30 };
/** Below this on any of flood/economy/environment/access at the end, the city is not viable. */
export const VIABILITY_FLOOR = 30;

export const TOTAL_ROUNDS = 3;
export const START_INFLUENCE = 5;
export const INFLUENCE_PER_ROUND = 2;
export const MAX_INFLUENCE = 8;

export interface Persona {
  id: PersonaId;
  name: string;
  title: string;
  goal: string;
  voice: string;
  emoji: string;
  color: string;
  /** Final score: weight per indicator point gained (or lost) over the match. */
  weights: Partial<Record<Indicator, number>>;
  /** What else scores, in words (the engine implements each one in score()). */
  bonuses: string[];
}

export const PERSONA_INFO: Record<PersonaId, Persona> = {
  mayor: {
    id: 'mayor',
    name: 'Mayor',
    title: 'Mayor Dolores "Dee" Marquez',
    goal: 'Protect infrastructure, keep the books balanced, improve public welfare.',
    voice: 'Overly dramatic. Every pothole is a historic crossroads.',
    emoji: '🎖️',
    color: '#19b6e6',
    weights: { flood: 2, economy: 1, access: 1 },
    bonuses: ['+1 for every $2M of budget left', '−10 if the budget runs dry'],
  },
  activist: {
    id: 'activist',
    name: 'Environmental Activist',
    title: 'Kai Rivera, Save Our Dunes',
    goal: 'Protect habitats, natural shorelines and public coastal access.',
    voice: 'Passionate, quotable, always has a sign ready.',
    emoji: '🌱',
    color: '#5cc21b',
    weights: { environment: 3, access: 1, flood: 1 },
    bonuses: ['+4 for each development stopped in a coastal high hazard area'],
  },
  resort: {
    id: 'resort',
    name: 'Resort Owner',
    title: 'Sterling Vance III, Vance Hospitality',
    goal: 'Grow tourism, attract investment, protect commercial property.',
    voice: 'Business-obsessed. Says "synergy" unironically.',
    emoji: '🏨',
    color: '#ffb020',
    weights: { economy: 3, flood: 1 },
    bonuses: ['+4 for each hotel approved'],
  },
  resident: {
    id: 'resident',
    name: 'Resident',
    title: 'Rosa Delgado, West Avenue homeowner',
    goal: 'Reduce flood risk, keep the neighborhood affordable and the beach reachable.',
    voice: 'Practical, tired of wading to the car.',
    emoji: '🏠',
    color: '#ff7a6b',
    weights: { flood: 2, access: 2 },
    bonuses: ['+3 for each home-elevation program approved'],
  },
};

export type CardCategory = 'project' | 'support' | 'opposition' | 'negotiation';
export type ProjectKind = 'drainage' | 'shoreline' | 'hotel' | 'elevate';

export type CardId =
  | 'emergency-funding' | 'fast-track' | 'drainage-upgrade'
  | 'living-shoreline' | 'environmental-challenge' | 'public-campaign'
  | 'hotel-development' | 'private-investment' | 'tourism-campaign'
  | 'elevate-buildings' | 'neighborhood-petition' | 'public-access-guarantee';

export interface Card {
  id: CardId;
  name: string;
  persona: PersonaId;
  category: CardCategory;
  /** Influence to play it. */
  cost: number;
  art: string;
  /** One line on the card. */
  text: string;
  /** The authored rule, in words, as the engine applies it. */
  rule: string;
  tradeoff: string;
  /** Project cards: what gets proposed. */
  project?: ProjectKind;
  /** Non-project cards: which proposals it can act on, best first. */
  acts?: ProjectKind[];
  /** If nothing in the district can be acted on, this happens instead. */
  fallback?: { delta: Delta; text: string };
  /** Real-world references behind the card's premise (not its numbers). */
  refs: string[];
}

export interface Project {
  kind: ProjectKind;
  name: string;
  /** Hypothetical public cost in $M, paid from the budget unless someone covers it. */
  budgetCost: number;
  /** Effect on the city when it is built (illustrative). */
  delta: Delta;
  /** Effect on the district's own resilience meter (0-100) and what appears on the map. */
  resilience: number;
  marker: string;
}

export const PROJECTS: Record<ProjectKind, Project> = {
  drainage: { kind: 'drainage', name: 'Drainage & pump station', budgetCost: 8, delta: { flood: 6 }, resilience: 18, marker: '⛲' },
  shoreline: { kind: 'shoreline', name: 'Living shoreline', budgetCost: 6, delta: { environment: 6, flood: 3, access: 2 }, resilience: 12, marker: '🌾' },
  hotel: { kind: 'hotel', name: 'Beachfront hotel', budgetCost: 0, delta: { economy: 8, environment: -4, access: -3 }, resilience: -4, marker: '🏨' },
  elevate: { kind: 'elevate', name: 'Home elevation program', budgetCost: 4, delta: { flood: 4 }, resilience: 10, marker: '🏗️' },
};

const MB_PROJECTS = 'https://www.miamibeachfl.gov/projects/';
const MB_BUDGET = 'https://www.miamibeachfl.gov/city-hall/office-of-budget-peformance/budget/';
const NOAA_SLR = 'https://coast.noaa.gov/slrdata/';
const FEMA_NFHL = 'https://gisweb.miamidade.gov/ArcGIS/rest/services/EnerGov/MD_LandMgtViewer/MapServer/63';
const MB_ZONING = 'https://gis.miamibeachfl.gov/public/rest/services/gc/gc_Zoning/MapServer/0';

export const CARDS: Record<CardId, Card> = {
  'emergency-funding': {
    id: 'emergency-funding', name: 'Emergency Funding', persona: 'mayor', category: 'support', cost: 2, art: '🚨',
    text: 'Back a public resilience proposal and pay for it from an emergency grant.',
    rule: 'Adds 1 support to a drainage, shoreline or elevation proposal here and covers its public cost. With a living shoreline it also matches the grant: +2 environment.',
    tradeoff: 'Does nothing for private development.',
    acts: ['shoreline', 'drainage', 'elevate'],
    fallback: { delta: { flood: 2, budget: -3 }, text: 'No public proposal here: the money goes to spot repairs (+2 flood, −$3M).' },
    refs: [MB_BUDGET],
  },
  'fast-track': {
    id: 'fast-track', name: 'Fast-Track Review', persona: 'mayor', category: 'support', cost: 1, art: '⏩',
    text: 'Push a proposal through review.',
    rule: 'The proposal here ignores 1 opposition and gets +1 support. A proposal delayed from an earlier round is decided now. Cannot override a legal challenge in a coastal high hazard area.',
    tradeoff: 'Opponents remember: the review is faster, not fairer.',
    acts: ['drainage', 'shoreline', 'elevate', 'hotel'],
    fallback: { delta: {}, text: 'Nothing to fast-track here: 1 influence comes back.' },
    refs: [MB_PROJECTS],
  },
  'drainage-upgrade': {
    id: 'drainage-upgrade', name: 'Drainage Upgrade', persona: 'mayor', category: 'project', cost: 3, art: '⛲', project: 'drainage',
    text: 'Propose stormwater pumps and drains for this district.',
    rule: 'Project: +6 flood resilience citywide, +18 district resilience. Costs $8M of public budget unless covered. Needs at least half the district in FEMA\'s 1% annual chance flood area.',
    tradeoff: 'Expensive. Grey infrastructure does nothing for nature.',
    refs: [MB_PROJECTS, FEMA_NFHL],
  },
  'living-shoreline': {
    id: 'living-shoreline', name: 'Living Shoreline', persona: 'activist', category: 'project', cost: 3, art: '🌾', project: 'shoreline',
    text: 'Propose dunes, mangroves and reef-friendly edges instead of concrete.',
    rule: 'Project: +6 environment, +3 flood, +2 access, +12 district resilience. Costs $6M unless covered.',
    tradeoff: 'Slower to protect property than a drainage project.',
    refs: [NOAA_SLR],
  },
  'environmental-challenge': {
    id: 'environmental-challenge', name: 'Environmental Challenge', persona: 'activist', category: 'opposition', cost: 2, art: '⚖️',
    text: 'Contest a development that does not belong on a fragile coast.',
    rule: 'Against a hotel here. If the district borders a FEMA VE coastal high hazard zone, the hotel is blocked (rule R1) unless its owner accepts a dune setback. Elsewhere: +2 opposition.',
    tradeoff: 'Costs influence and goodwill; does nothing against public projects.',
    acts: ['hotel'],
    fallback: { delta: {}, text: 'No development to challenge here: 1 influence comes back.' },
    refs: [FEMA_NFHL],
  },
  'public-campaign': {
    id: 'public-campaign', name: 'Public Campaign', persona: 'activist', category: 'support', cost: 1, art: '📣',
    text: 'Rally the public behind a compatible proposal.',
    rule: 'Adds 2 support to a shoreline, drainage or elevation proposal here.',
    tradeoff: 'Will not campaign for a hotel.',
    acts: ['shoreline', 'drainage', 'elevate'],
    fallback: { delta: { environment: 1 }, text: 'No compatible proposal: the campaign raises awareness (+1 environment).' },
    refs: [],
  },
  'hotel-development': {
    id: 'hotel-development', name: 'Hotel Development', persona: 'resort', category: 'project', cost: 4, art: '🏨', project: 'hotel',
    text: 'Propose a new beachfront hotel.',
    rule: 'Project: +8 economy, −4 environment, −3 access. Privately funded. Needs at least a quarter of the district zoned for hotel or commercial use (RM-2, RM-3, CD, CPS, MXE, TC, RO).',
    tradeoff: 'Every guest needs a beach; every beach needs a dune.',
    refs: [MB_ZONING],
  },
  'private-investment': {
    id: 'private-investment', name: 'Private Investment', persona: 'resort', category: 'support', cost: 2, art: '💰',
    text: 'Put private money behind a proposal.',
    rule: 'Adds 1 support and covers the proposal\'s public cost. Behind a hotel: +2 economy.',
    tradeoff: 'Investors expect a return.',
    acts: ['hotel', 'drainage', 'shoreline', 'elevate'],
    fallback: { delta: { economy: 1 }, text: 'Nothing to invest in here: the money finds a café (+1 economy).' },
    refs: [],
  },
  'tourism-campaign': {
    id: 'tourism-campaign', name: 'Tourism Campaign', persona: 'resort', category: 'support', cost: 1, art: '🌴',
    text: 'Market the district to visitors.',
    rule: 'Behind a hotel here: +1 support, and +3 economy if it is built. With no hotel: +2 economy, −1 environment.',
    tradeoff: 'More visitors, more pressure on the beach.',
    acts: ['hotel'],
    fallback: { delta: { economy: 2, environment: -1 }, text: 'No hotel here: the campaign still brings visitors (+2 economy, −1 environment).' },
    refs: [],
  },
  'elevate-buildings': {
    id: 'elevate-buildings', name: 'Elevate Buildings', persona: 'resident', category: 'project', cost: 2, art: '🏗️', project: 'elevate',
    text: 'Propose a program to raise flood-prone homes.',
    rule: 'Project: +4 flood resilience, +10 district resilience. Costs $4M unless covered. Needs at least a fifth of the district zoned residential and half of it in the 1% flood area.',
    tradeoff: 'Protects homes, not streets.',
    refs: [FEMA_NFHL, MB_ZONING],
  },
  'neighborhood-petition': {
    id: 'neighborhood-petition', name: 'Neighborhood Petition', persona: 'resident', category: 'opposition', cost: 1, art: '📝',
    text: 'Gather signatures against a disruptive proposal.',
    rule: 'Adds 2 opposition to a hotel here, or else to another player\'s drainage or shoreline proposal.',
    tradeoff: 'Can stall projects the neighborhood actually needs.',
    acts: ['hotel', 'drainage', 'shoreline'],
    fallback: { delta: { access: 1 }, text: 'Nothing to petition: the neighbors organize a beach cleanup (+1 access).' },
    refs: [],
  },
  'public-access-guarantee': {
    id: 'public-access-guarantee', name: 'Public Access Guarantee', persona: 'resident', category: 'negotiation', cost: 1, art: '🚶',
    text: 'Support a proposal only if it keeps a public path to the beach.',
    rule: 'Offers a compromise to a hotel (or shoreline) here. If its owner accepts: +1 support, +4 access, and the hotel gives 2 less economy. If refused: +1 opposition.',
    tradeoff: 'A condition, not a veto.',
    acts: ['hotel', 'shoreline'],
    fallback: { delta: { access: 2 }, text: 'No proposal here: the existing beach access is protected (+2 access).' },
    refs: [MB_PROJECTS],
  },
};

export const CARD_IDS = Object.keys(CARDS) as CardId[];
export const isCardId = (v: unknown): v is CardId => typeof v === 'string' && v in CARDS;
export const handOf = (persona: PersonaId): CardId[] => CARD_IDS.filter((id) => CARDS[id].persona === persona);

/** Negotiation moves (one per player per round, plus accepting compromises offered to you). */
export const NEGOTIATION_COST = { back: 1, oppose: 1, fund: 2 } as const;
export type NegotiationMove = keyof typeof NEGOTIATION_COST;

export type CrisisId = 'king-tide' | 'hotel-boom' | 'storm-season';
export interface Crisis {
  id: CrisisId;
  round: number;
  title: string;
  text: string;
  /** Districts the crisis is about (highlighted on the map). */
  spotlight: string[];
  /** Approved projects in a spotlight district add this (rule K1). */
  bonus: Delta;
  refs: string[];
}

export const CRISES: Crisis[] = [
  {
    id: 'king-tide', round: 1, title: 'King tide warning',
    text: 'Scenario: a seasonal king tide is forecast. In low-lying bayfront blocks like West Avenue, water comes up through the storm drains. The city must prioritize resilience investment.',
    spotlight: ['west-avenue', 'south-pointe'], bonus: { flood: 2 }, refs: [NOAA_SLR, MB_PROJECTS],
  },
  {
    id: 'hotel-boom', round: 2, title: 'Oceanfront hotel boom',
    text: 'Scenario: tourism is surging and developers are circling the oceanfront along Collins Avenue and South Pointe. Jobs are on the table, and so are the dunes.',
    spotlight: ['collins-mid-beach', 'south-pointe'], bonus: { economy: 2 }, refs: [MB_ZONING],
  },
  {
    id: 'storm-season', round: 3, title: 'Storm season',
    text: 'Scenario: a tropical storm is churning offshore. Oceanfront parks and dunes in North Beach and South Pointe are the first line. After this round, the storm tests the city.',
    spotlight: ['north-beach-oceanside', 'south-pointe'], bonus: { environment: 2 }, refs: [FEMA_NFHL, NOAA_SLR],
  },
];

/** The storm at the end of round 3 (rule S1): weak flood resilience costs the economy. */
export const STORM_TEST = { threshold: 50, economyLossPerPoint: 0.25 };
