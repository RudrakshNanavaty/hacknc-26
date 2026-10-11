// Money agreements on the negotiating table. A card puts an authored agreement (AGREEMENTS in content.ts)
// on a proposal at the reveal; its terms are fixed then, in exact cents, from the card and the project.
// Nobody can write their own terms: no free-form deals, no amounts from the client or the model.
//
// An agreement is a Compromise with `terms` (engine.ts), so it is accepted like any other condition (by the
// proposal's owner, or at once when the card's player is the one who pays), shows in the same hints, and is
// recorded and replayed with the board. Its money moves only in resolveRound, and only if the proposal is
// approved and the payer can pay at that moment.
import { AGREEMENTS, CARDS, NEGOTIATION_COST, PROJECTS, type AgreementType, type CardId, type Delta, type PersonaId, type ProjectKind } from './content';
import { laterRounds, millions, usd, walletOf, WALLET_INFO, type Cents, type Treasury, type WalletId } from './money';
import type { Board, NegotiationAction, Proposal } from './engine';

export interface ScheduledPayment {
  /** TOTAL_ROUNDS + 1: at the end of the session. */
  dueRound: number;
  from: WalletId;
  to: WalletId;
  amount: Cents;
  kind: 'availability' | 'debt-service';
}

export interface AgreementTerms {
  type: AgreementType;
  name: string;
  rule: string;
  funder: WalletId;
  to: WalletId;
  /** Paid on approval. */
  amount: Cents;
  /** It pays the project's public cost (it is a funding source, not an extra). */
  covers: boolean;
  schedule: ScheduledPayment[];
  /** For a bond: what the city borrows, and what it repays in all. */
  principal: Cents;
  repay: Cents;
  support: number;
  ifBuilt: Delta;
  refused: { opposition: number; ifBuilt: Delta };
  /** Plain words with the exact amounts (simulated money). */
  summary: string;
}

/** Does this card offer an agreement on this proposal? (Some agreements only fit some projects.) */
export function offersAgreement(card: CardId, kind: ProjectKind): AgreementType | null {
  const type = CARDS[card].agreement;
  if (!type) return null;
  const p = PROJECTS[kind];
  if ((type === 'ppp' || type === 'bond') && p.budgetCost <= 0) return null; // nothing public to pay for
  if (type === 'reserve' && p.upkeep <= 0) return null; // nothing to maintain
  return type;
}

/** The exact terms of a card's agreement on a proposal, fixed at the reveal. */
export function agreementTerms(type: AgreementType, player: PersonaId, proposal: Proposal, round: number): AgreementTerms {
  const spec = AGREEMENTS[type];
  const project = PROJECTS[proposal.kind];
  const funder: WalletId = spec.funder === 'lender' ? 'lender' : walletOf(player);
  const amount = spec.amount === 'cost' ? millions(project.budgetCost) : millions(spec.amount);
  const to: WalletId = spec.to;
  const schedule: ScheduledPayment[] = [];
  let principal = 0;
  let repay = 0;
  const later = laterRounds(round);
  if (spec.schedule?.kind === 'availability') {
    for (const r of later) schedule.push({ dueRound: r, from: 'city', to: funder, amount: millions(spec.schedule.perRoundM), kind: 'availability' });
  } else if (spec.schedule?.kind === 'debt-service') {
    principal = amount;
    // Whole $M, rounded up: cost plus interest, split over at most `installments` later rounds.
    const totalM = Math.ceil((project.budgetCost * (100 + spec.schedule.interestPct)) / 100);
    repay = millions(totalM);
    const rounds = later.slice(0, spec.schedule.installments);
    const base = Math.floor(totalM / rounds.length);
    rounds.forEach((r, i) => schedule.push({ dueRound: r, from: 'city', to: 'lender', amount: millions(base + (i < totalM - base * rounds.length ? 1 : 0)), kind: 'debt-service' }));
  }
  const due = (r: number) => (r > 3 ? 'at the end of the session' : `in round ${r}`);
  const strings = schedule.length ? ` Then: ${schedule.map((s) => `${usd(s.amount)} from the ${WALLET_INFO[s.from].short.toLowerCase()} ${due(s.dueRound)}`).join('; ')}.` : '';
  const summary = `${WALLET_INFO[funder].name} pays ${usd(amount)} to ${WALLET_INFO[to].short.toLowerCase()} if approved.${strings} (Simulated money.)`;
  return {
    type, name: spec.name, rule: spec.rule, funder, to, amount, covers: spec.amount === 'cost', schedule, principal, repay,
    support: spec.support, ifBuilt: spec.ifBuilt, refused: spec.refused, summary,
  };
}

/**
 * What a wallet has already promised on this board: accepted agreements it funds, fund moves it made, and its
 * own private project costs. Money promised once cannot be promised again (no double spend).
 */
export function committed(board: Board, actions: NegotiationAction[], wallet: WalletId, except?: string): Cents {
  let sum = 0;
  for (const c of board.compromises) if (c.terms && c.accepted && c.id !== except && c.terms.funder === wallet) sum += c.terms.amount;
  for (const a of actions) {
    if (a.move !== 'fund' || walletOf(a.persona) !== wallet) continue;
    const p = board.proposals.find((x) => x.id === a.proposalId);
    if (p) sum += millions(PROJECTS[p.kind].budgetCost);
  }
  for (const p of board.proposals) if (walletOf(p.persona) === wallet) sum += millions(PROJECTS[p.kind].privateCost);
  return sum;
}

/** Money a wallet can still promise right now (outside sources are not players and never ask). */
export const available = (treasury: Treasury, board: Board, actions: NegotiationAction[], wallet: WalletId, except?: string): Cents =>
  Math.max(0, treasury.balances[wallet] - committed(board, actions, wallet, except));

/** Why this fund move cannot be paid, or null. */
export function checkFund(treasury: Treasury | undefined, board: Board, actions: NegotiationAction[], persona: PersonaId, proposalId: string): string | null {
  const p = board.proposals.find((x) => x.id === proposalId);
  if (!p) return 'That proposal is not on the table.';
  const cost = millions(PROJECTS[p.kind].budgetCost);
  if (cost === 0) return 'That proposal has no public cost to pay.';
  const w = walletOf(persona);
  if (w === 'city') return 'The public budget already pays for public projects: the Mayor cannot fund on top of it.';
  if (!treasury) return 'Funding needs a wallet.';
  const left = available(treasury, board, actions, w);
  if (left < cost) return `Funding it costs ${usd(cost)} of your own money; you have ${usd(left)} not yet promised.`;
  return null;
}

/** Why the payer cannot sign this agreement now, or null. */
export function checkAfford(treasury: Treasury | undefined, board: Board, actions: NegotiationAction[], compromiseId: string): string | null {
  const c = board.compromises.find((x) => x.id === compromiseId);
  if (!c?.terms || !treasury || WALLET_INFO[c.terms.funder].external) return null;
  const left = available(treasury, board, actions, c.terms.funder, c.id);
  return left < c.terms.amount ? `${WALLET_INFO[c.terms.funder].name} has ${usd(left)} not yet promised; this needs ${usd(c.terms.amount)}.` : null;
}

/** Influence a fund move costs (the money comes from the wallet). */
export const FUND_INFLUENCE = NEGOTIATION_COST.fund;
