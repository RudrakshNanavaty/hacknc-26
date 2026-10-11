// Coastal Clash content: personas, cards, indicators and the scenario. Everything here is authored
// game design. Numbers are ILLUSTRATIVE SCENARIO VALUES (labelled so in the UI and the exports),
// never predictions of what a real project would do. Real-world facts live in districts.json.

export const RULES_VERSION = 'coastal-clash-rules/2.0.0';
/**
 * Beginner Mode's rules (beginner.ts): the same engine and numbers, with one conflict a round, 2-3 cards
 * a player, no influence, and the Suggest a Change move (rules C5/O8). Records made under it say so.
 */
export const BEGINNER_RULES_VERSION = 'coastal-clash-beginner/1.0.0';

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
  budget: { label: 'Public budget (hypothetical $M)', short: 'Budget', unit: '$M', icon: '💲' },
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
    voice: 'Pragmatic and budget-wary, politically cautious, with a dry sense of humor.',
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
    voice: 'Thinks in decades and habitats; passionate and quotable, but willing to deal.',
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
    voice: 'Ambitious and persuasive, a little opportunistic. Says "synergy" unironically.',
    emoji: '🏨',
    color: '#ffb020',
    weights: { economy: 3, flood: 1 },
    bonuses: ['+4 for each hotel or marina approved'],
  },
  resident: {
    id: 'resident',
    name: 'Resident',
    title: 'Rosa Delgado, West Avenue homeowner',
    goal: 'Reduce flood risk, keep the neighborhood affordable and the beach reachable.',
    voice: 'Practical: affordability, safety, a way to the beach. Tired of wading to the car.',
    emoji: '🏠',
    color: '#ff7a6b',
    weights: { flood: 2, access: 2 },
    bonuses: ['+3 for each home-elevation or workforce-housing program approved'],
  },
};

export type CardCategory = 'project' | 'support' | 'opposition' | 'negotiation';
/** What a card is about, for the player (the category above is what it does in the rules). */
export type CardFamily = 'infrastructure' | 'economic' | 'environmental' | 'civic' | 'negotiation';
export const FAMILY_INFO: Record<CardFamily, { label: string; color: string }> = {
  infrastructure: { label: 'Infrastructure', color: '#19b6e6' },
  economic: { label: 'Economic development', color: '#ffb020' },
  environmental: { label: 'Environmental', color: '#5cc21b' },
  civic: { label: 'Civic / political', color: '#b79cff' },
  negotiation: { label: 'Negotiation', color: '#ff7a6b' },
};
export type ProjectKind = 'drainage' | 'shoreline' | 'hotel' | 'elevate' | 'seawall' | 'dune' | 'marina' | 'housing';
/** Which animation the map plays when the card lands (app/src/map/LivingLayer.tsx). */
export type CardAnim = 'construct' | 'restore' | 'protest' | 'invest' | 'campaign' | 'legal' | 'deal' | 'stamp';

export type CardId =
  | 'emergency-funding' | 'fast-track' | 'drainage-upgrade' | 'seawall-upgrade' | 'resilience-bond' | 'building-moratorium'
  | 'living-shoreline' | 'environmental-challenge' | 'public-campaign' | 'dune-restoration' | 'habitat-survey' | 'eco-certification'
  | 'hotel-development' | 'private-investment' | 'tourism-campaign' | 'marina-expansion' | 'lobbying-blitz' | 'community-benefits'
  | 'elevate-buildings' | 'neighborhood-petition' | 'public-access-guarantee' | 'workforce-housing' | 'flood-watch' | 'rent-shield';

/** A plain support or opposition effect, applied by the engine's generic path (rule ids in `rule`). */
export interface AttachEffect {
  rule: string;
  support?: number;
  opposition?: number;
  /** Covers the proposal's public cost. */
  cover?: boolean;
  /** Extra effect on the city if the proposal is built anyway (illustrative). */
  ifBuilt?: Delta;
}

/** A condition offered to the proposal's owner during negotiation. */
export interface Offer {
  kind: 'green';
  title: string;
  text: string;
  /** Accepted: rule C4. */
  accepted: { support: number; ifBuilt: Delta };
  /** Refused: rule O7. */
  refused: { opposition: number };
}

export interface Card {
  id: CardId;
  name: string;
  /** The deck it belongs to (and its color). */
  persona: PersonaId;
  category: CardCategory;
  family: CardFamily;
  /** Influence to play it. */
  cost: number;
  art: string;
  anim: CardAnim;
  /** One line on the card. */
  text: string;
  /** The authored rule, in words, as the engine applies it. */
  rule: string;
  tradeoff: string;
  /** Project cards: what gets proposed. */
  project?: ProjectKind;
  /** Non-project cards: which proposals it can act on, best first. */
  acts?: ProjectKind[];
  /** Cards without a special rule in the engine: what they do (see resolveRound). */
  attach?: AttachEffect;
  offer?: Offer;
  /** A consequence one round later, if the proposal the card backed is approved (rules L0/L1). */
  delayed?: { delta: Delta; text: string };
  /** If nothing in the district can be acted on, this happens instead. */
  fallback?: { delta: Delta; text: string };
  /** Cards that answer this one (for the player; the engine decides through the rules). */
  counters: CardId[];
  /** Authored combos this card can complete. */
  combos: ComboId[];
  /** Real-world references behind the card's premise (not its numbers). */
  refs: string[];
}

export interface Project {
  kind: ProjectKind;
  name: string;
  /** Hypothetical public cost in $M, paid from the budget unless someone covers it. */
  budgetCost: number;
  /** Hypothetical yearly upkeep in $M, charged in every later round once it is built (rule U1). */
  upkeep: number;
  /** Effect on the city when it is built (illustrative). */
  delta: Delta;
  /** Effect on the district's own resilience meter (0-100) and what appears on the map. */
  resilience: number;
  marker: string;
}

export const PROJECTS: Record<ProjectKind, Project> = {
  drainage: { kind: 'drainage', name: 'Drainage & pump station', budgetCost: 8, upkeep: 1, delta: { flood: 6 }, resilience: 18, marker: '⛲' },
  shoreline: { kind: 'shoreline', name: 'Living shoreline', budgetCost: 6, upkeep: 0, delta: { environment: 6, flood: 3, access: 2 }, resilience: 12, marker: '🌾' },
  hotel: { kind: 'hotel', name: 'Beachfront hotel', budgetCost: 0, upkeep: 0, delta: { economy: 8, environment: -4, access: -3 }, resilience: -4, marker: '🏨' },
  elevate: { kind: 'elevate', name: 'Home elevation program', budgetCost: 4, upkeep: 0, delta: { flood: 4 }, resilience: 10, marker: '🏗️' },
  seawall: { kind: 'seawall', name: 'Raised seawall', budgetCost: 7, upkeep: 1, delta: { flood: 5, environment: -3, access: -1 }, resilience: 14, marker: '🧱' },
  dune: { kind: 'dune', name: 'Dune restoration', budgetCost: 3, upkeep: 0, delta: { environment: 4, flood: 2, access: 1 }, resilience: 8, marker: '🏝️' },
  marina: { kind: 'marina', name: 'Marina expansion', budgetCost: 0, upkeep: 0, delta: { economy: 5, environment: -3, access: -1 }, resilience: -2, marker: '⛵' },
  housing: { kind: 'housing', name: 'Workforce housing', budgetCost: 5, upkeep: 0, delta: { access: 3, economy: 2 }, resilience: 4, marker: '🏘️' },
};

const MB_PROJECTS = 'https://www.miamibeachfl.gov/projects/';
const MB_BUDGET = 'https://www.miamibeachfl.gov/city-hall/office-of-budget-peformance/budget/';
const NOAA_SLR = 'https://coast.noaa.gov/slrdata/';
const FEMA_NFHL = 'https://gisweb.miamidade.gov/ArcGIS/rest/services/EnerGov/MD_LandMgtViewer/MapServer/63';
const MB_ZONING = 'https://gis.miamibeachfl.gov/public/rest/services/gc/gc_Zoning/MapServer/0';

const PUBLIC_WORKS: ProjectKind[] = ['drainage', 'seawall', 'elevate', 'shoreline', 'dune', 'housing'];
const DEVELOPMENT: ProjectKind[] = ['hotel', 'marina'];

export const CARDS: Record<CardId, Card> = {
  // ---------- Mayor ----------
  'drainage-upgrade': {
    id: 'drainage-upgrade', name: 'Drainage Upgrade', persona: 'mayor', category: 'project', family: 'infrastructure', cost: 3, art: '⛲', anim: 'construct', project: 'drainage',
    text: 'Propose stormwater pumps and drains for this district.',
    rule: 'Project: +6 flood resilience citywide, +18 district resilience. Costs $8M of public budget unless covered, then $1M upkeep a round. Needs at least half the district in FEMA\'s 1% annual chance flood area.',
    tradeoff: 'Expensive, with upkeep. Grey infrastructure does nothing for nature.',
    counters: ['neighborhood-petition'], combos: ['public-private-flood', 'resilience-package'],
    refs: [MB_PROJECTS, FEMA_NFHL],
  },
  'seawall-upgrade': {
    id: 'seawall-upgrade', name: 'Seawall Upgrade', persona: 'mayor', category: 'project', family: 'infrastructure', cost: 3, art: '🧱', anim: 'construct', project: 'seawall',
    text: 'Propose raising and armoring the seawall along this district.',
    rule: 'Project: +5 flood, −3 environment, −1 access, +14 district resilience. Costs $7M unless covered, then $1M upkeep a round. Needs at least half the district in FEMA\'s 1% annual chance flood area.',
    tradeoff: 'Hard edges protect streets but starve beaches and habitat.',
    counters: ['habitat-survey', 'neighborhood-petition'], combos: ['hybrid-shoreline', 'public-private-flood', 'resilience-package'],
    refs: [MB_PROJECTS, FEMA_NFHL],
  },
  'emergency-funding': {
    id: 'emergency-funding', name: 'Emergency Funding', persona: 'mayor', category: 'support', family: 'civic', cost: 2, art: '🚨', anim: 'invest',
    text: 'Back a public resilience proposal and pay for it from an emergency grant.',
    rule: 'Adds 1 support to a public project here (drainage, seawall, shoreline, dune, elevation, housing) and covers its public cost. With a living shoreline it also matches the grant: +2 environment.',
    tradeoff: 'Does nothing for private development.',
    acts: ['shoreline', 'drainage', 'seawall', 'dune', 'elevate', 'housing'],
    fallback: { delta: { flood: 2, budget: -3 }, text: 'No public proposal here: the money goes to spot repairs (+2 flood, −$3M).' },
    counters: [], combos: ['grant-match'],
    refs: [MB_BUDGET],
  },
  'fast-track': {
    id: 'fast-track', name: 'Fast-Track Review', persona: 'mayor', category: 'support', family: 'civic', cost: 1, art: '⏩', anim: 'stamp',
    text: 'Push a proposal through review.',
    rule: 'The proposal here ignores 1 opposition and gets +1 support. A proposal delayed from an earlier round is decided now. Cannot override a legal challenge in a coastal high hazard area.',
    tradeoff: 'Opponents remember: the review is faster, not fairer.',
    acts: ['drainage', 'seawall', 'shoreline', 'dune', 'elevate', 'housing', 'hotel', 'marina'],
    fallback: { delta: {}, text: 'Nothing to fast-track here: 1 influence comes back.' },
    counters: ['environmental-challenge'], combos: [],
    refs: [MB_PROJECTS],
  },
  'resilience-bond': {
    id: 'resilience-bond', name: 'Resilience Bond', persona: 'mayor', category: 'support', family: 'civic', cost: 2, art: '📜', anim: 'invest',
    text: 'Borrow now to build a public project, pay it back later.',
    rule: 'Adds 1 support to a public project here and covers its cost. If the project is approved, the bond payment is due next round: −$3M budget.',
    tradeoff: 'Pays now, costs later.',
    acts: ['drainage', 'seawall', 'elevate', 'shoreline', 'dune', 'housing'],
    attach: { rule: 'F4', support: 1, cover: true },
    delayed: { delta: { budget: -3 }, text: 'Resilience Bond payment due: −$3M budget.' },
    fallback: { delta: {}, text: 'No public project to finance here: 1 influence comes back.' },
    counters: ['neighborhood-petition'], combos: [],
    refs: [MB_BUDGET],
  },
  'building-moratorium': {
    id: 'building-moratorium', name: 'Building Moratorium', persona: 'mayor', category: 'opposition', family: 'civic', cost: 2, art: '🛑', anim: 'stamp',
    text: 'Pause private development until the drains catch up.',
    rule: 'Adds 2 opposition to another player\'s hotel, marina or housing proposal here.',
    tradeoff: 'Stops good projects too, and investors notice.',
    acts: ['hotel', 'marina', 'housing'],
    attach: { rule: 'O4', opposition: 2 },
    fallback: { delta: { economy: -1 }, text: 'Nothing to pause here, but the announcement spooks investors (−1 economy).' },
    counters: ['lobbying-blitz', 'fast-track'], combos: [],
    refs: [MB_ZONING],
  },
  // ---------- Environmental Activist ----------
  'living-shoreline': {
    id: 'living-shoreline', name: 'Living Shoreline', persona: 'activist', category: 'project', family: 'environmental', cost: 3, art: '🌾', anim: 'restore', project: 'shoreline',
    text: 'Propose dunes, mangroves and reef-friendly edges instead of concrete.',
    rule: 'Project: +6 environment, +3 flood, +2 access, +12 district resilience. Costs $6M unless covered.',
    tradeoff: 'Slower to protect property than a drainage project.',
    counters: ['neighborhood-petition'], combos: ['hybrid-shoreline', 'grant-match'],
    refs: [NOAA_SLR],
  },
  'dune-restoration': {
    id: 'dune-restoration', name: 'Dune Restoration', persona: 'activist', category: 'project', family: 'environmental', cost: 2, art: '🏝️', anim: 'restore', project: 'dune',
    text: 'Propose replanting and widening the dunes on the Atlantic side.',
    rule: 'Project: +4 environment, +2 flood, +1 access, +8 district resilience. Costs $3M unless covered. Needs an Atlantic-facing district.',
    tradeoff: 'Slow and modest: a dune protects less than a seawall, and a bay-side area cannot have one.',
    counters: ['neighborhood-petition'], combos: ['hybrid-shoreline'],
    refs: [NOAA_SLR, FEMA_NFHL],
  },
  'environmental-challenge': {
    id: 'environmental-challenge', name: 'Environmental Challenge', persona: 'activist', category: 'opposition', family: 'civic', cost: 2, art: '⚖️', anim: 'legal',
    text: 'Contest a development that does not belong on a fragile coast.',
    rule: 'Against a hotel here. If the district borders a FEMA VE coastal high hazard zone, the hotel is blocked (rule R1) unless its owner accepts a dune setback. Elsewhere: +2 opposition.',
    tradeoff: 'Costs influence and goodwill; does nothing against public projects.',
    acts: ['hotel'],
    fallback: { delta: {}, text: 'No development to challenge here: 1 influence comes back.' },
    counters: ['private-investment'], combos: ['eco-resort'],
    refs: [FEMA_NFHL],
  },
  'public-campaign': {
    id: 'public-campaign', name: 'Public Campaign', persona: 'activist', category: 'support', family: 'civic', cost: 1, art: '📣', anim: 'campaign',
    text: 'Rally the public behind a compatible proposal.',
    rule: 'Adds 2 support to a shoreline, dune, drainage or elevation proposal here.',
    tradeoff: 'Will not campaign for a hotel, a marina or a seawall.',
    acts: ['shoreline', 'dune', 'drainage', 'elevate'],
    fallback: { delta: { environment: 1 }, text: 'No compatible proposal: the campaign raises awareness (+1 environment).' },
    counters: ['neighborhood-petition'], combos: [],
    refs: [],
  },
  'habitat-survey': {
    id: 'habitat-survey', name: 'Habitat Survey', persona: 'activist', category: 'opposition', family: 'environmental', cost: 1, art: '🔬', anim: 'legal',
    text: 'Document the wildlife a hard-edged project would displace.',
    rule: 'Adds 1 opposition to a seawall, marina or hotel here. If it is built anyway, the survey shapes mitigation: +1 environment.',
    tradeoff: 'Slows projects down; rarely stops them on its own.',
    acts: ['seawall', 'marina', 'hotel'],
    attach: { rule: 'O5', opposition: 1, ifBuilt: { environment: 1 } },
    fallback: { delta: { environment: 1 }, text: 'Nothing to survey against: the data goes to the city\'s habitat map (+1 environment).' },
    counters: ['fast-track'], combos: [],
    refs: [NOAA_SLR],
  },
  'eco-certification': {
    id: 'eco-certification', name: 'Eco-Certification', persona: 'activist', category: 'negotiation', family: 'negotiation', cost: 1, art: '🏅', anim: 'deal',
    text: 'Offer a green label in exchange for greener design.',
    rule: 'Offers a compromise to a hotel or marina here. Accepted: +1 support, +3 environment, −1 economy. Refused: +1 opposition.',
    tradeoff: 'A deal, not a veto: accepted, the project is greener and gets support; refused, it costs it one opposition.',
    acts: ['hotel', 'marina'],
    offer: {
      kind: 'green', title: 'Eco-certified design',
      text: 'Certified green design: native landscaping, bird-safe glass, no beach lighting. Accept: +1 support, +3 environment, 1 less economy. Refuse: +1 opposition.',
      accepted: { support: 1, ifBuilt: { environment: 3, economy: -1 } }, refused: { opposition: 1 },
    },
    fallback: { delta: {}, text: 'No development to certify here: 1 influence comes back.' },
    counters: [], combos: ['eco-resort'],
    refs: [],
  },
  // ---------- Resort Owner ----------
  'hotel-development': {
    id: 'hotel-development', name: 'Hotel Development', persona: 'resort', category: 'project', family: 'economic', cost: 4, art: '🏨', anim: 'construct', project: 'hotel',
    text: 'Propose a new beachfront hotel.',
    rule: 'Project: +8 economy, −4 environment, −3 access. Privately funded. Needs at least a quarter of the district zoned for hotel or commercial use (RM-2, RM-3, CD, CPS, MXE, TC, RO).',
    tradeoff: 'Every guest needs a beach; every beach needs a dune.',
    counters: ['environmental-challenge', 'building-moratorium', 'neighborhood-petition', 'rent-shield'], combos: ['eco-resort'],
    refs: [MB_ZONING],
  },
  'marina-expansion': {
    id: 'marina-expansion', name: 'Marina Expansion', persona: 'resort', category: 'project', family: 'economic', cost: 3, art: '⛵', anim: 'construct', project: 'marina',
    text: 'Propose new yacht slips and a waterfront promenade on the bay.',
    rule: 'Project: +5 economy, −3 environment, −1 access. Privately funded. Needs a Biscayne Bay shore and at least a quarter of the district zoned hotel or commercial.',
    tradeoff: 'Slips for yachts, less room for working boats.',
    counters: ['habitat-survey', 'building-moratorium', 'rent-shield'], combos: ['working-waterfront', 'eco-resort'],
    refs: [MB_ZONING],
  },
  'private-investment': {
    id: 'private-investment', name: 'Private Investment', persona: 'resort', category: 'support', family: 'economic', cost: 2, art: '💰', anim: 'invest',
    text: 'Put private money behind a proposal.',
    rule: 'Adds 1 support and covers the proposal\'s public cost. Behind a hotel: +2 economy.',
    tradeoff: 'Investors expect a return.',
    acts: ['hotel', 'marina', 'drainage', 'seawall', 'shoreline', 'dune', 'elevate', 'housing'],
    fallback: { delta: { economy: 1 }, text: 'Nothing to invest in here: the money finds a café (+1 economy).' },
    counters: ['building-moratorium'], combos: ['public-private-flood'],
    refs: [],
  },
  'tourism-campaign': {
    id: 'tourism-campaign', name: 'Tourism Campaign', persona: 'resort', category: 'support', family: 'economic', cost: 1, art: '🌴', anim: 'campaign',
    text: 'Market the district to visitors.',
    rule: 'Behind a hotel or marina here: +1 support, and +3 economy if it is built. With neither: +2 economy, −1 environment.',
    tradeoff: 'More visitors, more pressure on the beach.',
    acts: ['hotel', 'marina'],
    fallback: { delta: { economy: 2, environment: -1 }, text: 'No hotel here: the campaign still brings visitors (+2 economy, −1 environment).' },
    counters: [], combos: [],
    refs: [],
  },
  'lobbying-blitz': {
    id: 'lobbying-blitz', name: 'Lobbying Blitz', persona: 'resort', category: 'support', family: 'civic', cost: 2, art: '🤵', anim: 'stamp',
    text: 'Work the phones and the lunch circuit for a project business wants.',
    rule: 'Adds 2 support to a hotel, marina, seawall, drainage or housing proposal here. If it is approved, the public backlash arrives next round: −2 access.',
    tradeoff: 'Wins votes now; residents remember later.',
    acts: ['hotel', 'marina', 'seawall', 'drainage', 'housing'],
    attach: { rule: 'S3', support: 2 },
    delayed: { delta: { access: -2 }, text: 'Backlash over the lobbying blitz: −2 access.' },
    fallback: { delta: {}, text: 'No development to lobby for here: 1 influence comes back.' },
    counters: ['building-moratorium', 'neighborhood-petition'], combos: [],
    refs: [],
  },
  'community-benefits': {
    id: 'community-benefits', name: 'Community Benefits Pledge', persona: 'resort', category: 'support', family: 'negotiation', cost: 1, art: '🤝', anim: 'deal',
    text: 'Promise public amenities to win over the neighborhood.',
    rule: 'Adds 1 support to any proposal here. If it is built: +2 access, −1 economy.',
    tradeoff: 'Goodwill costs money.',
    acts: ['marina', 'hotel', 'housing', 'shoreline', 'dune', 'drainage', 'seawall', 'elevate'],
    attach: { rule: 'S4', support: 1, ifBuilt: { access: 2, economy: -1 } },
    fallback: { delta: { access: 1 }, text: 'No proposal here: the pledge funds a beach shower and a bike rack (+1 access).' },
    counters: [], combos: [],
    refs: [],
  },
  // ---------- Resident ----------
  'elevate-buildings': {
    id: 'elevate-buildings', name: 'Elevate Buildings', persona: 'resident', category: 'project', family: 'infrastructure', cost: 2, art: '🏗️', anim: 'construct', project: 'elevate',
    text: 'Propose a program to raise flood-prone homes.',
    rule: 'Project: +4 flood resilience, +10 district resilience. Costs $4M unless covered. Needs at least a fifth of the district zoned residential and half of it in the 1% flood area.',
    tradeoff: 'Protects homes, not streets.',
    counters: [], combos: ['resilience-package'],
    refs: [FEMA_NFHL, MB_ZONING],
  },
  'workforce-housing': {
    id: 'workforce-housing', name: 'Workforce Housing', persona: 'resident', category: 'project', family: 'economic', cost: 2, art: '🏘️', anim: 'construct', project: 'housing',
    text: 'Propose flood-ready homes that teachers and nurses can afford.',
    rule: 'Project: +3 access, +2 economy, +4 district resilience. Costs $5M unless covered. Needs at least a fifth of the district zoned residential.',
    tradeoff: 'Density brings neighbors, and traffic.',
    counters: ['building-moratorium'], combos: [],
    refs: [MB_ZONING],
  },
  'neighborhood-petition': {
    id: 'neighborhood-petition', name: 'Neighborhood Petition', persona: 'resident', category: 'opposition', family: 'civic', cost: 1, art: '📝', anim: 'protest',
    text: 'Gather signatures against a disruptive proposal.',
    rule: 'Adds 2 opposition to a hotel or marina here, or else to another player\'s seawall, drainage, shoreline or dune proposal.',
    tradeoff: 'Can stall projects the neighborhood actually needs.',
    acts: ['hotel', 'marina', 'seawall', 'drainage', 'shoreline', 'dune'],
    fallback: { delta: { access: 1 }, text: 'Nothing to petition: the neighbors organize a beach cleanup (+1 access).' },
    counters: ['fast-track', 'community-benefits'], combos: [],
    refs: [],
  },
  'public-access-guarantee': {
    id: 'public-access-guarantee', name: 'Public Access Guarantee', persona: 'resident', category: 'negotiation', family: 'negotiation', cost: 1, art: '🚶', anim: 'deal',
    text: 'Support a proposal only if it keeps a public path to the beach.',
    rule: 'Offers a compromise to a hotel, marina or shoreline here. If its owner accepts: +1 support, +4 access, and a hotel gives 2 less economy. If refused: +1 opposition.',
    tradeoff: 'A condition, not a veto.',
    acts: ['hotel', 'marina', 'shoreline'],
    fallback: { delta: { access: 2 }, text: 'No proposal here: the existing beach access is protected (+2 access).' },
    counters: [], combos: ['working-waterfront'],
    refs: [MB_PROJECTS],
  },
  'flood-watch': {
    id: 'flood-watch', name: 'Flood Watch Brigade', persona: 'resident', category: 'support', family: 'civic', cost: 1, art: '🔦', anim: 'campaign',
    text: 'Neighbors who clear drains and check on each other at high tide.',
    rule: 'Adds 1 support to a drainage, seawall, elevation, shoreline or dune proposal here. If it is built: +1 flood.',
    tradeoff: 'Volunteers burn out; it helps, it does not replace pumps.',
    acts: ['drainage', 'seawall', 'elevate', 'shoreline', 'dune'],
    attach: { rule: 'S5', support: 1, ifBuilt: { flood: 1 } },
    fallback: { delta: { flood: 1 }, text: 'No project here: the brigade clears storm drains (+1 flood).' },
    counters: [], combos: [],
    refs: [NOAA_SLR],
  },
  'rent-shield': {
    id: 'rent-shield', name: 'Rent Shield', persona: 'resident', category: 'opposition', family: 'civic', cost: 1, art: '🛡️', anim: 'protest',
    text: 'Demand protection for renters before luxury development.',
    rule: 'Adds 1 opposition to a hotel or marina here. If it is built anyway, renter protections come with it: +2 access.',
    tradeoff: 'Slows development; protections are a consolation prize.',
    acts: ['hotel', 'marina'],
    attach: { rule: 'O6', opposition: 1, ifBuilt: { access: 2 } },
    fallback: { delta: { access: 1 }, text: 'No development here: tenants organize anyway (+1 access).' },
    counters: ['lobbying-blitz'], combos: [],
    refs: [],
  },
};

export const CARD_IDS = Object.keys(CARDS) as CardId[];
/** Own keys only: 'constructor', 'toString' and friends are not cards. */
export const isCardId = (v: unknown): v is CardId => typeof v === 'string' && Object.hasOwn(CARDS, v);
/** A persona's whole deck. */
export const handOf = (persona: PersonaId): CardId[] => CARD_IDS.filter((id) => CARDS[id].persona === persona);

/** The hand each crisis deals (4 of the deck's 6): authored, so every match and replay is the same. */
export const HANDS: Record<PersonaId, [CardId[], CardId[], CardId[]]> = {
  mayor: [
    ['drainage-upgrade', 'emergency-funding', 'seawall-upgrade', 'resilience-bond'],
    ['fast-track', 'building-moratorium', 'emergency-funding', 'resilience-bond'],
    ['emergency-funding', 'drainage-upgrade', 'seawall-upgrade', 'fast-track'],
  ],
  activist: [
    ['living-shoreline', 'public-campaign', 'dune-restoration', 'habitat-survey'],
    ['environmental-challenge', 'eco-certification', 'public-campaign', 'habitat-survey'],
    ['living-shoreline', 'environmental-challenge', 'dune-restoration', 'public-campaign'],
  ],
  resort: [
    ['tourism-campaign', 'private-investment', 'hotel-development', 'marina-expansion'],
    ['hotel-development', 'lobbying-blitz', 'marina-expansion', 'community-benefits'],
    ['private-investment', 'tourism-campaign', 'community-benefits', 'lobbying-blitz'],
  ],
  resident: [
    ['elevate-buildings', 'flood-watch', 'workforce-housing', 'neighborhood-petition'],
    ['public-access-guarantee', 'neighborhood-petition', 'rent-shield', 'workforce-housing'],
    ['public-access-guarantee', 'elevate-buildings', 'flood-watch', 'neighborhood-petition'],
  ],
};
export const HAND_SIZE = 4;
/** The cards in a persona's hand this round. */
export const handFor = (persona: PersonaId, round: number): CardId[] => HANDS[persona][Math.min(Math.max(round, 1), HANDS[persona].length) - 1]!;

// ---------- Combos: authored pairings the engine detects (rules M1-M5); Gemini may only pick and explain them ----------

export type ComboId = 'public-private-flood' | 'eco-resort' | 'hybrid-shoreline' | 'resilience-package' | 'working-waterfront' | 'grant-match';
export interface Combo {
  id: ComboId;
  name: string;
  rule: string;
  /** The pairing, in words. */
  recipe: string;
  /** The cards involved (for the UI). */
  cards: CardId[];
  /** Extra effect when it completes (illustrative). */
  bonus: Delta;
  /** Extra district resilience when it completes. */
  resilience: number;
}

export const COMBOS: Record<ComboId, Combo> = {
  'public-private-flood': {
    id: 'public-private-flood', name: 'Public-Private Flood Partnership', rule: 'M1',
    recipe: 'Private Investment behind an approved drainage or seawall project.', cards: ['private-investment', 'drainage-upgrade', 'seawall-upgrade'],
    bonus: { flood: 2 }, resilience: 4,
  },
  'eco-resort': {
    id: 'eco-resort', name: 'Eco-Resort Agreement', rule: 'M2',
    recipe: 'A hotel or marina approved with an accepted dune setback or eco-certification.', cards: ['hotel-development', 'marina-expansion', 'environmental-challenge', 'eco-certification'],
    bonus: { environment: 1, economy: 1 }, resilience: 2,
  },
  'hybrid-shoreline': {
    id: 'hybrid-shoreline', name: 'Hybrid Shoreline', rule: 'M3',
    recipe: 'A seawall and a living shoreline or dune restoration approved in the same area in the same round.', cards: ['seawall-upgrade', 'living-shoreline', 'dune-restoration'],
    bonus: { environment: 2, flood: 1 }, resilience: 6,
  },
  'resilience-package': {
    id: 'resilience-package', name: 'Neighborhood Resilience Package', rule: 'M4',
    recipe: 'Home elevation and drainage or a seawall approved in the same area in the same round.', cards: ['elevate-buildings', 'drainage-upgrade', 'seawall-upgrade'],
    bonus: { flood: 2 }, resilience: 6,
  },
  'working-waterfront': {
    id: 'working-waterfront', name: 'Working Waterfront Deal', rule: 'M5',
    recipe: 'A marina approved with an accepted Public Access Guarantee: public slips for working boats.', cards: ['marina-expansion', 'public-access-guarantee'],
    bonus: { access: 2, environment: 1 }, resilience: 0,
  },
  'grant-match': {
    id: 'grant-match', name: 'Nature-Based Grant Match', rule: 'C3',
    recipe: 'Emergency Funding behind a living shoreline.', cards: ['emergency-funding', 'living-shoreline'],
    bonus: { environment: 2 }, resilience: 0,
  },
};
export const COMBO_IDS = Object.keys(COMBOS) as ComboId[];
export const isComboId = (v: unknown): v is ComboId => typeof v === 'string' && Object.hasOwn(COMBOS, v);

/** Negotiation moves (one per player per round, plus accepting compromises offered to you). */
export const NEGOTIATION_COST = { back: 1, oppose: 1, fund: 2 } as const;
export type InfluenceMove = keyof typeof NEGOTIATION_COST;
/** Advanced moves cost influence; 'suggest' (Suggest a Change) is Beginner Mode only and free (beginner.ts). */
export type NegotiationMove = InfluenceMove | 'suggest';
export const isInfluenceMove = (m: unknown): m is InfluenceMove => m === 'back' || m === 'oppose' || m === 'fund';

/**
 * Suggest a Change (Beginner Mode, rules C5/O8): a condition any other player may put on a project. If its
 * owner accepts: +1 support and, if built, this effect (illustrative). If not accepted: +1 opposition.
 * One per project kind, authored to fit it.
 */
export const SUGGESTED_CHANGES: Record<ProjectKind, { title: string; ifBuilt: Delta }> = {
  drainage: { title: 'Green streets around the pumps', ifBuilt: { environment: 2, budget: -1 } },
  seawall: { title: 'A living edge along the wall', ifBuilt: { environment: 3, access: 1, budget: -2 } },
  hotel: { title: 'A public beach path through the site', ifBuilt: { access: 3, economy: -1 } },
  marina: { title: 'Public slips for working boats', ifBuilt: { access: 2, economy: -1 } },
  elevate: { title: 'Include rental homes, not just owners', ifBuilt: { access: 2, budget: -1 } },
  housing: { title: 'Flood-ready ground floors', ifBuilt: { flood: 2, budget: -1 } },
  shoreline: { title: 'A boardwalk and kayak launch', ifBuilt: { access: 2, economy: 1, environment: -1 } },
  dune: { title: 'Dune walkovers to reach the beach', ifBuilt: { access: 2, environment: -1 } },
};

/** The storm at the end of round 3 (rule S1): weak flood resilience costs the economy. */
export const STORM_TEST = { threshold: 50, economyLossPerPoint: 0.25 };
