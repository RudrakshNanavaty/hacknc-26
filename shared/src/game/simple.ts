// Every card in plain words for a first-time player: what it does, what is good about it, what is bad
// about it, and what it costs. Project effects and costs are derived from the rules (PROJECTS, CARDS),
// so they cannot drift; the lines for the other cards are authored, and simple.test.ts pins every
// number in them to the card's rule. The engine never reads this file.
import { CARDS, INDICATORS, PROJECTS, type CardId, type Delta, type Indicator } from './content';

/** The indicators in everyday words. */
export const PLAIN: Record<Indicator, string> = {
  flood: 'flood safety',
  economy: 'jobs & business',
  environment: 'nature',
  access: 'beach access',
  budget: 'city money',
};

export interface SimpleCard {
  /** One short sentence: what playing it does. */
  does: string;
  good: string[];
  bad: string[];
  /** Influence to play it. */
  influence: number;
  /** City money, in plain words (null when it does not touch the budget). */
  money: string | null;
}

/** "+6 flood safety", "−3 nature". */
export const plainDelta = (k: Indicator, v: number) => (k === 'budget' ? `${v > 0 ? '+' : '−'}$${Math.abs(v)}M city money` : `${v > 0 ? '+' : '−'}${Math.abs(v)} ${PLAIN[k]}`);

export function plainParts(d: Delta): { good: string[]; bad: string[] } {
  const keys = INDICATORS.filter((k) => d[k]);
  return { good: keys.filter((k) => d[k]! > 0).map((k) => plainDelta(k, d[k]!)), bad: keys.filter((k) => d[k]! < 0).map((k) => plainDelta(k, d[k]!)) };
}

/** Authored lines for the cards that act on someone else's project. */
const ACTS: Partial<Record<CardId, { does: string; good: string[]; bad: string[] }>> = {
  'emergency-funding': { does: 'Back a public project here and pay its bill from a grant.', good: ['+1 support', 'The city does not pay for it'], bad: ['Will not help hotels or marinas'] },
  'fast-track': { does: 'Push a project here through review.', good: ['+1 support and 1 opposition ignored'], bad: ['Cannot beat a legal block on a high-hazard coast'] },
  'resilience-bond': { does: 'Borrow to pay for a public project here.', good: ['+1 support', 'Paid for now'], bad: ['−$3M city money next round if it passes'] },
  'building-moratorium': { does: 'Pause a hotel, marina or housing project here.', good: ['+2 opposition'], bad: ['Investors get nervous'] },
  'environmental-challenge': { does: 'Take a hotel here to court.', good: ['Blocks it next to a high-hazard coast', 'Elsewhere +2 opposition'], bad: ['Does nothing to public projects'] },
  'public-campaign': { does: 'Rally people behind a green or flood project here.', good: ['+2 support'], bad: ['Will not back hotels, marinas or seawalls'] },
  'habitat-survey': { does: 'Document the wildlife a hard-edged project would hurt.', good: ['+1 opposition', '+1 nature if it is built anyway'], bad: ['Rarely stops a project alone'] },
  'eco-certification': { does: 'Offer a hotel or marina here a green-design deal.', good: ['Accepted: +1 support, +3 nature'], bad: ['Refused: +1 opposition against it'] },
  'private-investment': { does: 'Put private money behind a project here.', good: ['+1 support', 'The city does not pay for it'], bad: ['Investors expect a return'] },
  'tourism-campaign': { does: 'Bring visitors to a hotel or marina here.', good: ['+1 support', '+3 jobs & business if built'], bad: ['More visitors, more pressure on the beach'] },
  'lobbying-blitz': { does: 'Work the phones for a project business wants here.', good: ['+2 support'], bad: ['−2 beach access next round if it passes'] },
  'community-benefits': { does: 'Promise neighbors something to win them over.', good: ['+1 support', '+2 beach access if built'], bad: ['−1 jobs & business if built'] },
  'neighborhood-petition': { does: 'Gather signatures against a project here.', good: ['+2 opposition'], bad: ['Can stall projects people need'] },
  'public-access-guarantee': { does: 'Offer a deal: keep a public path to the beach.', good: ['Accepted: +1 support, +4 beach access'], bad: ['Refused: +1 opposition against it'] },
  'flood-watch': { does: 'Neighbors clear drains and back a flood project here.', good: ['+1 support', '+1 flood safety if built'], bad: ['Helps, but it is not a pump station'] },
  'rent-shield': { does: 'Demand renter protections before a hotel or marina.', good: ['+1 opposition', '+2 beach access if built anyway'], bad: ['Slows development down'] },
};

export function simpleCard(id: CardId): SimpleCard {
  const c = CARDS[id];
  if (c.project) {
    const p = PROJECTS[c.project];
    const { good, bad } = plainParts(p.delta);
    // Upkeep is already a downside line; the money line is the bill now.
    const money = p.budgetCost ? `City pays $${p.budgetCost}M` : 'Privately paid: free for the city';
    const worse = p.upkeep ? [...bad, `$${p.upkeep}M upkeep every later round`] : bad;
    // Nothing negative in the numbers: the card's own trade-off is the catch.
    return { does: `Propose a ${p.name.toLowerCase()} here.`, good, bad: worse.length ? worse : [c.tradeoff], influence: c.cost, money };
  }
  const a = ACTS[id]!;
  const covers = id === 'emergency-funding' || id === 'resilience-bond' || id === 'private-investment';
  return { ...a, influence: c.cost, money: covers ? 'Pays the project\'s bill' : null };
}
