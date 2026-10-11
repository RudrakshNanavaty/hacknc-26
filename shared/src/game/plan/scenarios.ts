// The three fixed planning dilemmas of the Planning Edition, deliberately three different kinds of problem:
// flood infrastructure (West Avenue), a development-for-public-benefit trade (South Pointe) and a beach and
// shoreline choice (Mid-Beach). Each is a verified, source-linked story from the
// Snowflake civic corpus (pipeline/research/miami-beach-civic-corpus.json) set in one of the four playable
// Miami Beach areas. The story decides the three alternatives, the amendments that are allowed, and what each
// stakeholder wants. Nothing here is written by a model: the situation text is authored, and scenarios.test.ts
// checks every number in it against the story's cited facts and every source against the corpus.
// Costs are ILLUSTRATIVE game units (a round has ROUND_BUDGET of them), never the real budgets quoted in the facts.
import type { StorySource } from '../story';
import { PLAN_ROUNDS, type PlanScenario } from './types';

const src = (storyId: string, list: Omit<StorySource, 'id'>[]): StorySource[] => list.map((s, i) => ({ ...s, id: `${storyId}#${i}` }));

const WEST_AVENUE: PlanScenario = {
  id: 'west-avenue-raise-roads',
  storyId: 'west-ave-road-raising',
  district: 'west-avenue',
  title: 'West Avenue: raise the streets?',
  situation:
    'Miami Beach is raising West Avenue streets by up to two feet and adding drainage, pumps and sewer lines, in a project budgeted at about $100 million to $105 million. Most residents refused agreements that would release the city from liability if raised roads push water onto their property, and nearby businesses object to lost parking and construction.',
  question: 'Which resilience investment should this neighborhood make next?',
  facts: [
    'Streets raised by as much as two feet',
    "Total budget about $100 million to $105 million (the city's English and French project pages list different figures)",
    'Construction on a block began in June 2025 (NBC6)',
    'In one case bacteria levels were more than 600 times the state limit (CBS Miami citing the Miami Herald)',
  ],
  concerns: ['flooding', 'construction-disruption', 'parking', 'liability', 'water-quality'],
  linkedStories: ['pump-bacteria'],
  sources: [
    ...src('west-ave-road-raising', [
      { title: 'West Avenue Neighborhood Enhancements', outlet: 'City of Miami Beach', url: 'https://www.miamibeachfl.gov/projects/west-avenue-neighborhood-improvements-project-phase-ii/', kind: 'official' },
      { title: 'Miami Beach wants higher roads and pumps to fight sea rise. Some residents say no way', outlet: 'WLRN', url: 'https://www.wlrn.org/environment/2018-05-17/miami-beach-wants-higher-roads-and-pumps-to-fight-sea-rise-some-residents-say-no-way', kind: 'news' },
      { title: 'Controversy arising in Miami Beach over raising roads to combat flooding', outlet: 'Local10', url: 'https://local10.com/news/local/2022/02/21/controversy-arising-in-miami-beach-over-raising-roads-to-combat-flooding', kind: 'news' },
      { title: 'Miami Beach resiliency project brings flood protection and frustration', outlet: 'NBC6', url: 'https://www.nbcmiami.com/investigations/miami-beach-resiliency-project-brings-flood-protection-and-frustration-for-lincoln-road-business/3756786/?amp=1', kind: 'news' },
    ]),
    ...src('pump-bacteria', [
      { title: 'Study: Miami Beach King Tides Flush Human Waste Into Biscayne Bay', outlet: 'CBS Miami', url: 'https://cbsnews.com/miami/news/study-miami-beach-king-tides-flush-human-waste-into-biscayne-bay', kind: 'news' },
      { title: 'Dirty water: unintended consequence of climate resiliency', outlet: 'Eos', url: 'https://eos.org/articles/dirty-water-unintended-consequence-of-climate-resiliency', kind: 'news' },
    ]),
  ],
  verification: {
    status: 'resolved',
    notes: ['Budget differs between the English ($105,140,819) and French ($100,229,771) versions of the city project page'],
    resolution: 'Stated as a range and named the discrepancy instead of picking one figure.',
  },
  options: [
    {
      id: 'raise-roads', name: 'Raise Roads', cost: 7,
      does: 'Raise the streets about two feet and rebuild the drainage under them.',
      benefit: 'Keeps king-tide water off the street.', tradeoff: 'Homes and shops end up below the new street.',
      tags: ['raises-road', 'homes-below-grade', 'parking-loss', 'construction'],
      sim: { raiseFt: 2, drainage: 0.5, elevate: 0, access: -2 },
    },
    {
      id: 'improve-drainage', name: 'Improve Drainage', cost: 5,
      does: 'Add pumps and bigger drains and leave the streets where they are.',
      benefit: 'Clears rain fast with no height mismatch.', tradeoff: 'Does little against high tides pushing in, and pumped water reaches the bay.',
      tags: ['drainage', 'pumps', 'bay-discharge'],
      sim: { raiseFt: 0, drainage: 0.8, elevate: 0, access: 0 },
    },
    {
      id: 'elevate-properties', name: 'Elevate Properties', cost: 6,
      does: 'Help owners raise buildings, doors and utilities above the flood line.',
      benefit: 'Protects the buildings themselves.', tradeoff: 'Slow, and the street still floods.',
      tags: ['elevate-buildings', 'slow'],
      sim: { raiseFt: 0, drainage: 0.1, elevate: 0.8, access: -1 },
    },
  ],
  amendments: [
    {
      id: 'access-guarantee', name: 'Property Access Guarantee', cost: 2, addresses: 'liability',
      text: 'Safe ramps and transitions between the raised street and every existing property entrance.',
      tradeoff: 'Adds cost and slows construction.',
      appliesTo: ['raise-roads', 'elevate-properties'], addTags: ['property-access'], sim: { access: 3 },
    },
    {
      id: 'parking-relief', name: 'Parking & Construction Relief', cost: 1, addresses: 'parking',
      text: 'Replacement parking and a construction schedule that keeps shop doors open.',
      tradeoff: 'Less room for the work, so it takes longer.',
      appliesTo: ['raise-roads', 'improve-drainage'], addTags: ['parking-relief'], sim: { access: 2 },
    },
    {
      id: 'discharge-monitoring', name: 'Bay Discharge Monitoring', cost: 1, addresses: 'water-quality',
      text: 'Test pumped water before it reaches Biscayne Bay and publish the results.',
      tradeoff: 'Does not stop the water, only measures it.',
      appliesTo: ['raise-roads', 'improve-drainage'], addTags: ['bay-monitoring'], sim: { access: 1 },
    },
  ],
  mandates: {
    mayor: {
      objective: 'Cut flood risk and keep money in reserve.', concern: 'flooding',
      grounding: "The city's stated aim: raising roads and adding drainage protects against king tide and storm flooding.", inferred: false,
      base: { 'raise-roads': 2, 'improve-drainage': 1, 'elevate-properties': 1 },
      bonus: { headroom: 2, label: 'Leave at least 2 units unspent' },
    },
    activist: {
      objective: 'Keep pumped water from fouling Biscayne Bay.', concern: 'water-quality',
      grounding: 'Linked story: pumped floodwater carried fecal bacteria into the bay after king tides.', inferred: false,
      base: { 'raise-roads': 1, 'improve-drainage': 0, 'elevate-properties': 2 },
      bonus: { amendment: 'discharge-monitoring', label: 'Bay Discharge Monitoring in the plan' },
    },
    resort: {
      objective: 'Keep shops open, reachable and parked.', concern: 'parking',
      grounding: 'Nearby businesses objected to lost parking and construction.', inferred: false,
      base: { 'raise-roads': 0, 'improve-drainage': 2, 'elevate-properties': 1 },
      bonus: { amendment: 'parking-relief', label: 'Parking & Construction Relief in the plan' },
    },
    resident: {
      objective: 'Stay dry and keep every home reachable.', concern: 'liability',
      grounding: 'Residents feared raised roads would push water onto private property and refused the liability agreements.', inferred: false,
      base: { 'raise-roads': 2, 'improve-drainage': 1, 'elevate-properties': 1 },
      bonus: { amendment: 'access-guarantee', label: 'Property Access Guarantee in the plan' },
    },
  },
  constraints: [
    { option: 'raise-roads', requires: 'property-access', because: 'Most residents refused the liability agreements, so raising streets cannot go ahead without a property-access guarantee.' },
  ],
  statusQuo: { name: 'Do nothing', text: 'The streets stay as they are and the next king tide floods them again.' },
};

const SOUTH_POINTE: PlanScenario = {
  id: 'south-pointe-alton-tower',
  storyId: 'five-hundred-alton',
  district: 'south-pointe',
  title: 'South Pointe: a tower for a park?',
  situation:
    'The city approved a tower of over 500 ft at the South Beach gateway on Alton Road in exchange for a developer-donated 3-acre public park. A $10 million GO Bond pays for the pedestrian bridge, and the real question is whether height is a fair price for a public park.',
  question: 'What should the city do with the Alton Road site?',
  facts: [
    'Tower over 500 ft (sources give 519 ft and 553 ft)',
    '3-acre park donated to the city',
    '$10 million GO Bond for the bridge',
    'The trade: height for a public park (City Commission position)',
  ],
  concerns: ['height', 'parks', 'density', 'cost'],
  linkedStories: [],
  sources: src('five-hundred-alton', [
    { title: 'Beach commission to hear 44-story limit on Alton Road site', outlet: 'Miami Today', url: 'https://www.miamitodaynews.com/breaking/beach-commission-hear-44-story-limit-alton-road-site/', kind: 'news' },
    { title: 'Crescent Heights reveals new renderings of Park on Fifth', outlet: 'Profile Miami', url: 'https://profilemiamire.com/miamirealestate/2019/12/12/crescent-heights-reveals-new-renderings-of-park-coming-to-500-alton-in-south-beach', kind: 'news' },
  ]),
  verification: {
    status: 'resolved',
    notes: ['Sources disagree on tower height (519 ft vs 553 ft)'],
    resolution: 'Height stated as over 500 ft with both reported figures named.',
  },
  options: [
    {
      id: 'tower-for-park', name: 'Tower + Park', cost: 4,
      does: 'Allow the tall tower; the developer builds and donates the 3-acre park.',
      benefit: 'A public park with no land to buy.', tradeoff: 'A very tall building at the city’s gateway.',
      tags: ['tall-tower', 'public-park', 'traded-height'],
      sim: { raiseFt: 0, drainage: 0.2, elevate: 0, access: 2 },
    },
    {
      id: 'shorter-tower', name: 'Shorter Tower, Smaller Park', cost: 3,
      does: 'Cap the height well below the plan and take a smaller park in return.',
      benefit: 'Less height and less crowding.', tradeoff: 'A smaller park for the public.',
      tags: ['lower-height', 'small-park'],
      sim: { raiseFt: 0, drainage: 0.1, elevate: 0, access: 1 },
    },
    {
      id: 'city-park', name: 'City Builds the Park', cost: 9,
      does: 'No height trade: the city pays for the park itself.',
      benefit: 'No tower, and the park belongs to the city.', tradeoff: 'The city pays for everything.',
      tags: ['city-funded', 'no-tower', 'public-park'],
      sim: { raiseFt: 0, drainage: 0.2, elevate: 0, access: 3 },
    },
  ],
  amendments: [
    {
      id: 'park-open-to-all', name: 'Park Open to Everyone', cost: 1, addresses: 'parks',
      text: 'Put in writing that the park stays public, open and looked after.',
      tradeoff: 'Upkeep is a long-term cost.',
      appliesTo: ['tower-for-park', 'shorter-tower', 'city-park'], addTags: ['park-guaranteed'], sim: { access: 2 },
    },
    {
      id: 'step-the-tower-back', name: 'Step the Tower Back', cost: 1, addresses: 'height',
      text: 'Step the upper floors back from Alton Road so the height feels lower.',
      tradeoff: 'Fewer floors for the developer.',
      appliesTo: ['tower-for-park'], addTags: ['stepped-back'], sim: { access: 1 },
    },
    {
      id: 'cap-the-units', name: 'Cap the Number of Units', cost: 0, addresses: 'density',
      text: 'Limit how many homes and rooms the tower may hold.',
      tradeoff: 'A smaller project may be harder to finance.',
      appliesTo: ['tower-for-park', 'shorter-tower'], addTags: ['density-capped'], sim: {},
    },
  ],
  mandates: {
    mayor: {
      objective: 'Get the public park and keep money in reserve.', concern: 'parks',
      grounding: 'The City Commission traded height for a public park.', inferred: false,
      base: { 'tower-for-park': 2, 'shorter-tower': 1, 'city-park': 0 },
      bonus: { headroom: 5, label: 'Leave at least 5 units unspent' },
    },
    activist: {
      objective: 'Keep the building low and the crowding down.', concern: 'density',
      grounding: 'Role inference: height and density are listed concerns in the story; no group is quoted.', inferred: true,
      base: { 'tower-for-park': 0, 'shorter-tower': 2, 'city-park': 2 },
      bonus: { amendment: 'cap-the-units', label: 'Cap the Number of Units in the plan' },
    },
    resort: {
      objective: 'Get the tower approved, with a clear park deal.', concern: 'parks',
      grounding: 'The developer builds the tower and donates the park.', inferred: false,
      base: { 'tower-for-park': 2, 'shorter-tower': 1, 'city-park': 0 },
      bonus: { amendment: 'park-open-to-all', label: 'A signed, public park deal in the plan' },
    },
    resident: {
      objective: 'A building that is not too tall, and a park I can use.', concern: 'height',
      grounding: 'Height, density and the park are the three concerns the story lists.', inferred: false,
      base: { 'tower-for-park': 0, 'shorter-tower': 2, 'city-park': 1 },
      bonus: { amendment: 'step-the-tower-back', label: 'Step the Tower Back in the plan' },
    },
  },
  constraints: [
    { option: 'tower-for-park', requires: 'park-guaranteed', because: 'The city approved the height only as the price of a public park, so the tower cannot go ahead unless the park is guaranteed to the public.' },
  ],
  statusQuo: { name: 'Do nothing', text: 'The Alton Road site stays as it is: no tower and no new park.' },
};

const MID_BEACH: PlanScenario = {
  id: 'mid-beach-sand',
  storyId: 'beach-renourishment',
  district: 'collins-mid-beach',
  title: 'Mid-Beach: keeping the sand',
  situation:
    'The Army Corps placed about 835,000 cubic yards of sand along about 11,400 ft of eroded Miami Beach shoreline under a $40.4 million contract, and the federal project was reauthorized for 50 years from 2025. The county now weighs breakwaters and groins to hold the sand against erosion, flood and surge protection, and rising seas.',
  question: 'How should Mid-Beach keep its beach?',
  facts: [
    '$40.4 million contract (July 2021)',
    'About 835,000 cubic yards of sand along about 11,400 ft of shoreline',
    'Federal project reauthorized for 50 years from 2025 (Miami Today)',
    'County consultant recommends breakwaters and groins at several locations, including Miami Beach (Miami Today)',
    'Competing needs: erosion protection, flood and surge protection, and rising seas (Miami Today)',
  ],
  concerns: ['beach-access', 'flooding', 'habitat', 'cost'],
  linkedStories: [],
  sources: src('beach-renourishment', [
    { title: 'USACE nearing completion of the Miami Beach project', outlet: 'Dredging Today', url: 'https://dredgingtoday.com/?p=82517', kind: 'industry' },
    { title: 'Miami-Dade seeks new ways to retain vital beach sand', outlet: 'Miami Today', url: 'https://www.miamitodaynews.com/?p=76028', kind: 'news' },
    { title: 'Beach Renourishment', outlet: 'Miami-Dade County Environmental Resources Management', url: 'https://miamidade.gov/environment/beach-renourishment.asp', kind: 'official' },
  ]),
  verification: {
    status: 'resolved',
    notes: [
      'Three sources (1 official, 1 news, 1 industry) re-read 2026-10-11.',
      'Dredging Today gives $40.4 million and 835,000 cubic yards; Miami Today gives $40.5 million and 830,000 cubic yards for the same project.',
    ],
    resolution: 'Stated the Dredging Today figures and named the discrepancy; the county page describes the older 2016 work and was used only for its list of options (no action to breakwaters and groins).',
  },
  options: [
    {
      id: 'more-sand', name: 'Add More Sand', cost: 5,
      does: 'Keep renourishing the beach with new sand.',
      benefit: 'A wide natural beach that also cushions storms.', tradeoff: 'Sand washes away, so it must be paid for again.',
      tags: ['renourish', 'nature-based', 'recurring-cost'],
      sim: { raiseFt: 1, drainage: 0, elevate: 0, access: 3 },
    },
    {
      id: 'groins-breakwaters', name: 'Groins & Breakwaters', cost: 7,
      does: 'Build hard structures that trap sand and break waves.',
      benefit: 'The sand stays longer and waves are weaker.', tradeoff: 'Hard structures change the beach and its habitat.',
      tags: ['hard-structures', 'grey'],
      sim: { raiseFt: 1.5, drainage: 0, elevate: 0, access: -1 },
    },
    {
      id: 'dune-restore', name: 'Restore the Dunes', cost: 4,
      does: 'Plant and rebuild dunes behind the beach.',
      benefit: 'A natural storm buffer with real habitat.', tradeoff: 'Takes time to grow and narrows the beach walk.',
      tags: ['dunes', 'nature-based', 'habitat'],
      sim: { raiseFt: 1, drainage: 0.1, elevate: 0, access: 1 },
    },
  ],
  amendments: [
    {
      id: 'keep-access-paths', name: 'Keep Beach Paths Open', cost: 1, addresses: 'beach-access',
      text: 'Build the project around public paths to the water.',
      tradeoff: 'Less room for dunes or structures.',
      appliesTo: ['more-sand', 'groins-breakwaters', 'dune-restore'], addTags: ['access-kept'], sim: { access: 2 },
    },
    {
      id: 'habitat-safeguards', name: 'Habitat Safeguards', cost: 1, addresses: 'habitat',
      text: 'Time the work and place the sand to protect dune plants and wildlife.',
      tradeoff: 'Slower work.',
      appliesTo: ['more-sand', 'dune-restore'], addTags: ['habitat-safeguards'], sim: { access: 1 },
    },
    {
      id: 'use-the-federal-share', name: 'Use the Federal Project', cost: -2, addresses: 'cost',
      text: 'Fit the work into the federal project so the Corps carries more of the cost.',
      tradeoff: 'You wait for the federal schedule, so protection arrives later.',
      appliesTo: ['more-sand', 'groins-breakwaters', 'dune-restore'], addTags: ['federal-share'], sim: { raiseFt: -0.4 },
    },
    {
      id: 'worst-blocks-first', name: 'Worst Blocks First', cost: 1, addresses: 'flooding',
      text: 'Start where erosion is worst, so the most exposed blocks are protected first.',
      tradeoff: 'Other stretches wait.',
      appliesTo: ['more-sand', 'groins-breakwaters'], addTags: ['worst-first'], sim: { raiseFt: 0.5 },
    },
  ],
  mandates: {
    mayor: {
      objective: 'Protect the beach and let the federal share carry the cost.', concern: 'cost',
      grounding: 'The federal project was reauthorized for 50 years from 2025; the city weighs competing needs on a limited budget.', inferred: false,
      base: { 'more-sand': 2, 'groins-breakwaters': 1, 'dune-restore': 1 },
      bonus: { amendment: 'use-the-federal-share', label: 'Use the Federal Project in the plan' },
    },
    activist: {
      objective: 'Keep the beach natural: dunes and habitat first.', concern: 'habitat',
      grounding: 'Habitat and nature-versus-hard-structures are the story’s listed tensions.', inferred: false,
      base: { 'more-sand': 1, 'groins-breakwaters': 0, 'dune-restore': 2 },
      bonus: { amendment: 'habitat-safeguards', label: 'Habitat Safeguards in the plan' },
    },
    resort: {
      objective: 'A wide, open beach for visitors.', concern: 'beach-access',
      grounding: 'Beach access and tourism-versus-residents are listed concerns and tensions.', inferred: false,
      base: { 'more-sand': 2, 'groins-breakwaters': 0, 'dune-restore': 1 },
      bonus: { amendment: 'keep-access-paths', label: 'Keep Beach Paths Open in the plan' },
    },
    resident: {
      objective: 'Keep storm waves and surge away from homes.', concern: 'flooding',
      grounding: 'Flood and surge protection is one of the competing needs the county lists.', inferred: false,
      base: { 'more-sand': 1, 'groins-breakwaters': 2, 'dune-restore': 1 },
      bonus: { amendment: 'worst-blocks-first', label: 'Worst Blocks First in the plan' },
    },
  },
  constraints: [],
  statusQuo: { name: 'Do nothing', text: 'The beach keeps eroding and the sand keeps washing away.' },
};

/** The three dilemmas, in play order (one per round, one per area). */
export const PLAN_SCENARIOS: readonly PlanScenario[] = [WEST_AVENUE, SOUTH_POINTE, MID_BEACH];
if (PLAN_SCENARIOS.length !== PLAN_ROUNDS) throw new Error('One scenario per round');

export const scenarioById = (id: string): PlanScenario | null => PLAN_SCENARIOS.find((s) => s.id === id) ?? null;
export const scenarioForRound = (round: number): PlanScenario => PLAN_SCENARIOS[round - 1] ?? PLAN_SCENARIOS[0]!;
