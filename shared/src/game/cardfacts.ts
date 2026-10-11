// Everything a card says, derived from the authored rules, so the card face can never disagree with the engine:
// what it costs (influence, and whose money), what it does, where it may go (the real-geography threshold), the
// money deal it puts on the table, what answers it and the combos it can complete. cards.test.ts pins these.
import { AGREEMENTS, CARDS, COMBOS, INDICATOR_INFO, PROJECTS, type AgreementSpec, type CardId, type Delta, type Indicator } from './content';
import { requirementText } from './districts';
import { walletOf, WALLET_INFO, type WalletId } from './money';

export interface CardEffect {
  label: string;
  value: string;
  tone: 'up' | 'down' | 'flat' | 'deal';
}

export interface CardFacts {
  id: CardId;
  /** Influence to play it. */
  influence: number;
  /** Money it costs if its project is built: whose wallet, how much ($M simulated). Null for cards without a cost. */
  money: { payer: WalletId; payerName: string; amountM: number; kind: 'public' | 'private' } | null;
  /** Upkeep per later round ($M) once built. */
  upkeepM: number;
  /** The headline effects (at most four), from the project or the card's authored effect. */
  effects: CardEffect[];
  /** Where it may be played, in words, from the real-geography rules. */
  requirement: string;
  /** The money agreement it offers, if any. */
  deal: (AgreementSpec & { payerName: string }) | null;
  tradeoff: string;
  counters: { id: CardId; name: string; art: string }[];
  combos: { id: string; name: string }[];
  /** A consequence one round later, if any. */
  later: string | null;
}

const ICON = (k: Indicator) => INDICATOR_INFO[k].icon;
const sign = (n: number) => (n > 0 ? `+${n}` : `−${-n}`);

/** Indicator changes as effect pills, biggest first. */
export function deltaEffects(d: Delta, prefix = ''): CardEffect[] {
  return (Object.entries(d) as [Indicator, number][])
    .filter(([, v]) => v)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .map(([k, v]) => ({ label: `${prefix}${INDICATOR_INFO[k].short}`, value: k === 'budget' ? `${v > 0 ? '+' : '−'}$${Math.abs(v)}M` : `${ICON(k)}${sign(v)}`, tone: v > 0 ? 'up' : 'down' }));
}

/** What each card does on the board, beyond its project or deal (the engine's special cases, in words). */
const SPECIAL: Partial<Record<CardId, CardEffect[]>> = {
  'emergency-funding': [{ label: 'Support', value: '+1', tone: 'up' }, { label: 'Grant pays', value: 'cost', tone: 'deal' }],
  'fast-track': [{ label: 'Support', value: '+1', tone: 'up' }, { label: 'Ignores', value: '1 opp', tone: 'up' }, { label: 'Breaks ties', value: '✓', tone: 'up' }],
  'public-campaign': [{ label: 'Support', value: '+2', tone: 'up' }],
  'environmental-challenge': [{ label: 'Oppose', value: '+2', tone: 'down' }, { label: 'VE coast', value: 'Blocks', tone: 'down' }, { label: 'Offer', value: 'Setback', tone: 'deal' }],
  'private-investment': [{ label: 'Support', value: '+1', tone: 'up' }],
  'tourism-campaign': [{ label: 'Support', value: '+1', tone: 'up' }, { label: 'If built', value: '💼+3', tone: 'up' }],
  'neighborhood-petition': [{ label: 'Oppose', value: '+2', tone: 'down' }],
  'public-access-guarantee': [{ label: 'Accept', value: '🏖️+4', tone: 'deal' }, { label: 'Refuse', value: '+1 opp', tone: 'down' }],
};

export function cardFacts(id: CardId): CardFacts {
  const c = CARDS[id];
  const project = c.project ? PROJECTS[c.project] : null;
  let money: CardFacts['money'] = null;
  if (project) {
    const priv = project.privateCost > 0;
    const payer: WalletId = priv ? walletOf(c.persona) : 'city';
    const amountM = priv ? project.privateCost : project.budgetCost;
    if (amountM > 0) money = { payer, payerName: WALLET_INFO[payer].short, amountM, kind: priv ? 'private' : 'public' };
  }
  const spec = c.agreement ? AGREEMENTS[c.agreement] : null;
  const dealPayer: WalletId | null = spec ? (spec.funder === 'lender' ? 'lender' : walletOf(c.persona)) : null;
  if (!money && spec && typeof spec.amount === 'number' && dealPayer) money = { payer: dealPayer, payerName: WALLET_INFO[dealPayer].short, amountM: spec.amount, kind: 'private' };

  let effects: CardEffect[];
  if (project) effects = deltaEffects(project.delta);
  else {
    effects = [...(SPECIAL[id] ?? [])];
    if (c.offer) effects.push({ label: 'Accept', value: deltaEffects(c.offer.accepted.ifBuilt)[0]?.value ?? '✓', tone: 'deal' }, { label: 'Refuse', value: `+${c.offer.refused.opposition} opp`, tone: 'down' });
    if (c.attach?.support) effects.push({ label: 'Support', value: `+${c.attach.support}`, tone: 'up' });
    if (c.attach?.opposition) effects.push({ label: 'Oppose', value: `+${c.attach.opposition}`, tone: 'down' });
    if (c.attach?.ifBuilt) effects.push(...deltaEffects(c.attach.ifBuilt, 'If built: '));
    if (spec) {
      if (spec.support) effects.push({ label: 'If accepted', value: `+${spec.support} support`, tone: 'deal' });
      if (spec.refused.opposition) effects.push({ label: 'If refused', value: `+${spec.refused.opposition} opp`, tone: 'down' });
      effects.push(...deltaEffects(spec.ifBuilt, 'Deal: '));
    }
  }

  return {
    id,
    influence: c.cost,
    money,
    upkeepM: project?.upkeep ?? 0,
    effects: dedupe(effects).slice(0, 4),
    requirement: c.project ? requirementText(c.project) : c.acts?.length ? `Acts on ${c.acts.map((k) => PROJECTS[k].name.toLowerCase()).join(', ')} proposals in the same area.` : 'Any area.',
    deal: spec && dealPayer ? { ...spec, payerName: WALLET_INFO[dealPayer].short } : null,
    tradeoff: c.tradeoff,
    counters: c.counters.map((x) => ({ id: x, name: CARDS[x].name, art: CARDS[x].art })),
    combos: c.combos.map((k) => ({ id: k, name: COMBOS[k].name })),
    later: c.delayed?.text ?? null,
  };
}

const dedupe = (xs: CardEffect[]) => xs.filter((x, i) => xs.findIndex((y) => y.label === x.label) === i);
