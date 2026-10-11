// The city's money: who holds what, who owes what, and every movement in a ledger. Pure and
// deterministic like the engine that drives it. Amounts are integer US cents (minor units) of
// HYPOTHETICAL, SIMULATED money: every authored amount is a whole number of millions, so the public
// budget indicator ($M) stays an exact integer and always equals the city wallet.
//
// The resources are not interchangeable:
//   influence      political capital per player (cards, negotiation moves); never buys money
//   public budget  the city wallet; pays public projects, upkeep, debt service
//   private capital  the Activist's, Resort Owner's and Resident's wallets; pays their own projects and the
//                  agreements they sign
//   debt           what the city owes the (simulated) lender: bonds, and arrears when a bill cannot be paid
//   operating costs  upkeep and scheduled payments, charged at the start of every later round
//
// No wallet goes below zero except the simulated outside parties (lender, grants), which are where outside
// money comes from (an explicit credit rule). The city never overdraws: a bill it cannot pay becomes
// arrears debt (rule B3). Money only moves through the functions below, each one writing a ledger entry.
import { PERSONAS, PROJECTS, START_INDICATORS, TOTAL_ROUNDS, type Delta, type Indicators, type PersonaId, type ProjectKind } from './content';

/** Integer US cents per $1M (all game amounts are hypothetical). */
export const CENTS_PER_M = 100_000_000;
export type Cents = number;
/** An authored amount in $M as cents. */
export const millions = (m: number): Cents => Math.round(m * CENTS_PER_M);
/** Cents as $M (exact for every authored amount). */
export const inMillions = (c: Cents): number => c / CENTS_PER_M;
/** "$8M" (hypothetical money). */
export const usd = (c: Cents): string => `$${+(inMillions(Math.abs(c))).toFixed(2)}M`;

export type WalletId = 'city' | 'activist' | 'resort' | 'resident' | 'lender' | 'grants' | 'builders' | 'reserves';
export const WALLETS: readonly WalletId[] = ['city', 'activist', 'resort', 'resident', 'lender', 'grants', 'builders', 'reserves'];
export const isWalletId = (v: unknown): v is WalletId => typeof v === 'string' && (WALLETS as readonly string[]).includes(v);

export interface WalletInfo {
  id: WalletId;
  name: string;
  short: string;
  icon: string;
  /** The player who controls it (the Mayor controls the city's). */
  owner: PersonaId | null;
  /** Outside the city: a simulated source (may go below zero) or sink. */
  external: boolean;
}

export const WALLET_INFO: Record<WalletId, WalletInfo> = {
  city: { id: 'city', name: 'City treasury (public budget)', short: 'Public budget', icon: '🏛️', owner: 'mayor', external: false },
  activist: { id: 'activist', name: 'Save Our Dunes restoration fund', short: 'Dunes fund', icon: '🌱', owner: 'activist', external: false },
  resort: { id: 'resort', name: 'Vance Hospitality capital', short: 'Resort capital', icon: '🏨', owner: 'resort', external: false },
  resident: { id: 'resident', name: 'West Avenue neighborhood fund', short: 'Neighborhood fund', icon: '🏠', owner: 'resident', external: false },
  lender: { id: 'lender', name: 'Bond market (simulated lender)', short: 'Lender', icon: '🏦', owner: null, external: true },
  grants: { id: 'grants', name: 'Grants and outside funds (simulated)', short: 'Grants', icon: '🎁', owner: null, external: true },
  builders: { id: 'builders', name: 'Contractors (simulated)', short: 'Contractors', icon: '👷', owner: null, external: true },
  reserves: { id: 'reserves', name: 'Maintenance reserves (escrow)', short: 'Reserves', icon: '🧰', owner: null, external: false },
};

/** Sources of outside money: allowed below zero (what they have put in). */
const SOURCES: ReadonlySet<WalletId> = new Set(['lender', 'grants']);

/** Starting money in $M (hypothetical). The city starts with the public budget indicator. */
export const START_WALLETS: Record<WalletId, number> = {
  city: START_INDICATORS.budget, activist: 4, resort: 20, resident: 3, lender: 0, grants: 0, builders: 0, reserves: 0,
};

/** The wallet a persona pays from (the Mayor pays from the public budget). */
export const walletOf = (p: PersonaId): WalletId => (p === 'mayor' ? 'city' : p);
export const PERSONA_WALLETS: Record<PersonaId, WalletId> = Object.fromEntries(PERSONAS.map((p) => [p, walletOf(p)])) as Record<PersonaId, WalletId>;

export type EntryKind =
  | 'project' // a project's public or private cost, paid to contractors
  | 'upkeep' // operating cost of what was built (U1)
  | 'debt-service' // a bond installment (U2)
  | 'availability' // a partnership's scheduled payment to the investor (U3)
  | 'bond' // bond proceeds paying for a project (F4)
  | 'grant' // outside money: emergency grants, twist grants, crisis aid
  | 'contribution' // money an agreement moves on approval (restoration works, community benefits, reserves)
  | 'arrears' // the lender covers a bill the city could not pay (B3)
  | 'repair'; // spending without a project (card fallbacks)

export interface LedgerEntry {
  /** Deterministic: r{round}-m{n} (resolution) or r{round}-t{n} (twist). */
  id: string;
  round: number;
  rule: string;
  kind: EntryKind;
  from: WalletId;
  to: WalletId;
  amount: Cents;
  text: string;
  proposalId?: string;
  agreementId?: string;
}

export interface Debt {
  id: string;
  kind: 'bond' | 'arrears';
  round: number;
  principal: Cents;
  /** Still owed (principal and interest not yet paid). */
  outstanding: Cents;
  proposalId?: string;
  agreementId?: string;
}

/** A payment scheduled for a later round (bond installments, partnership availability payments). */
export interface Obligation {
  id: string;
  dueRound: number;
  from: WalletId;
  to: WalletId;
  amount: Cents;
  kind: 'debt-service' | 'availability';
  rule: string;
  text: string;
  debtId?: string;
  agreementId?: string;
}

/** Money set aside for one built project's upkeep. */
export interface Reserve {
  id: string;
  proposalId: string;
  kind: ProjectKind;
  district: string;
  balance: Cents;
}

export interface Treasury {
  balances: Record<WalletId, Cents>;
  debts: Debt[];
  obligations: Obligation[];
  reserves: Reserve[];
  /** Every movement this match, oldest first. */
  ledger: LedgerEntry[];
}

export function startTreasury(): Treasury {
  return {
    balances: Object.fromEntries(WALLETS.map((w) => [w, millions(START_WALLETS[w])])) as Record<WalletId, Cents>,
    debts: [], obligations: [], reserves: [], ledger: [],
  };
}

export const cloneTreasury = (t: Treasury): Treasury => ({
  balances: { ...t.balances },
  debts: t.debts.map((d) => ({ ...d })),
  obligations: t.obligations.map((o) => ({ ...o })),
  reserves: t.reserves.map((r) => ({ ...r })),
  ledger: [...t.ledger],
});

export class MoneyError extends Error {}

/** A working set of books for one round: every movement gets the next id and keeps the budget indicator in step. */
export class Books {
  readonly entries: LedgerEntry[] = [];
  constructor(
    readonly t: Treasury,
    readonly round: number,
    readonly ind: Indicators,
    private readonly prefix: 'm' | 't' = 'm',
  ) {}

  balance = (w: WalletId): Cents => this.t.balances[w];
  /** What a wallet can pay (outside sources always can). */
  canPay = (w: WalletId, amount: Cents): boolean => SOURCES.has(w) || this.t.balances[w] >= amount;

  /** Move money. Refuses (returns null) when the payer cannot cover it; never overdraws. */
  pay(from: WalletId, to: WalletId, amount: Cents, meta: Omit<LedgerEntry, 'id' | 'round' | 'from' | 'to' | 'amount'>): LedgerEntry | null {
    if (!Number.isSafeInteger(amount) || amount <= 0) throw new MoneyError(`bad amount ${amount}`);
    if (from === to) throw new MoneyError('a payment needs two different wallets');
    if (!this.canPay(from, amount)) return null;
    this.t.balances[from] -= amount;
    this.t.balances[to] += amount;
    const e: LedgerEntry = { id: `r${this.round}-${this.prefix}${this.t.ledger.filter((x) => x.round === this.round && x.id.startsWith(`r${this.round}-${this.prefix}`)).length + 1}`, round: this.round, from, to, amount, ...meta };
    this.t.ledger.push(e);
    this.entries.push(e);
    this.ind.budget = inMillions(this.t.balances.city);
    return e;
  }

  /**
   * The city pays a bill it cannot refuse (upkeep, installments, repairs). What the budget cannot cover,
   * the lender pays and the city owes as arrears (rule B3): the explicit credit rule, never a negative budget.
   */
  charge(to: WalletId, amount: Cents, meta: Omit<LedgerEntry, 'id' | 'round' | 'from' | 'to' | 'amount'>, from: WalletId = 'city'): { paid: LedgerEntry | null; arrears: LedgerEntry | null } {
    const own = Math.min(amount, Math.max(0, this.t.balances[from]));
    const paid = own > 0 ? this.pay(from, to, own, meta) : null;
    const short = amount - own;
    if (short <= 0) return { paid, arrears: null };
    if (from !== 'city') throw new MoneyError(`${from} cannot run arrears`);
    const arrears = this.pay('lender', to, short, { ...meta, rule: 'B3', kind: 'arrears', text: `The budget was ${usd(short)} short: the lender covers it and the city owes it as arrears. (${meta.text})` });
    this.t.debts.push({ id: `${arrears!.id}-arrears`, kind: 'arrears', round: this.round, principal: short, outstanding: short, ...(meta.proposalId ? { proposalId: meta.proposalId } : {}) });
    return { paid, arrears };
  }

  /** Outside money into the city (grants, aid, fees). */
  credit(amount: Cents, meta: Omit<LedgerEntry, 'id' | 'round' | 'from' | 'to' | 'amount'>): LedgerEntry | null {
    return amount > 0 ? this.pay('grants', 'city', amount, meta) : null;
  }
}

/** Split a delta: the budget part moves money (grants in, repairs out), the rest is returned for the indicators. */
export function budgetDelta(books: Books, d: Delta, meta: { rule: string; text: string; proposalId?: string }): Delta {
  const { budget, ...rest } = d;
  if (budget && budget > 0) books.credit(millions(budget), { rule: meta.rule, kind: 'grant', text: meta.text, ...(meta.proposalId ? { proposalId: meta.proposalId } : {}) });
  if (budget && budget < 0) books.charge('builders', millions(-budget), { rule: meta.rule, kind: 'repair', text: meta.text, ...(meta.proposalId ? { proposalId: meta.proposalId } : {}) });
  return rest;
}

// ---------- Scheduled payments ----------

/** Pay every obligation due by `round` (all of them when `all`): installments reduce their debt. */
export function settleObligations(books: Books, round: number, all = false): LedgerEntry[] {
  const due = books.t.obligations.filter((o) => all || o.dueRound <= round).sort((a, b) => a.dueRound - b.dueRound || a.id.localeCompare(b.id));
  const out: LedgerEntry[] = [];
  for (const o of due) {
    const meta = { rule: o.rule, kind: o.kind, text: o.text, ...(o.agreementId ? { agreementId: o.agreementId } : {}) } as const;
    const r = o.from === 'city' ? books.charge(o.to, o.amount, meta) : { paid: books.pay(o.from, o.to, o.amount, meta), arrears: null };
    for (const e of [r.paid, r.arrears]) if (e) out.push(e);
    if (o.debtId) {
      const debt = books.t.debts.find((d) => d.id === o.debtId);
      if (debt) debt.outstanding = Math.max(0, debt.outstanding - o.amount);
    }
  }
  books.t.obligations = books.t.obligations.filter((o) => !due.includes(o));
  return out;
}

/** At the end of the session the city repays what arrears it can from what is left. */
export function settleArrears(books: Books): LedgerEntry[] {
  const out: LedgerEntry[] = [];
  for (const d of books.t.debts.filter((x) => x.kind === 'arrears' && x.outstanding > 0)) {
    const pay = Math.min(d.outstanding, books.balance('city'));
    if (pay <= 0) break;
    const e = books.pay('city', 'lender', pay, { rule: 'U2', kind: 'debt-service', text: `Arrears repaid at the end of the session: ${usd(pay)}.` });
    if (e) {
      d.outstanding -= pay;
      out.push(e);
    }
  }
  return out;
}

/** Upkeep on what is built (U1): from a project's maintenance reserve first, then the budget. */
export function chargeUpkeep(books: Books, built: { kind: ProjectKind; proposalId: string }[]): LedgerEntry[] {
  const out: LedgerEntry[] = [];
  for (const f of built) {
    const cost = millions(PROJECTS[f.kind].upkeep);
    if (!cost) continue;
    const reserve = books.t.reserves.find((r) => r.proposalId === f.proposalId && r.balance > 0);
    let left = cost;
    if (reserve) {
      const use = Math.min(reserve.balance, left);
      const e = books.pay('reserves', 'builders', use, { rule: 'U1', kind: 'upkeep', text: `Upkeep on the ${PROJECTS[f.kind].name.toLowerCase()} paid from its maintenance reserve: ${usd(use)}.`, proposalId: f.proposalId });
      if (e) {
        reserve.balance -= use;
        left -= use;
        out.push(e);
      }
    }
    if (left > 0) {
      const r = books.charge('builders', left, { rule: 'U1', kind: 'upkeep', text: `Upkeep on the ${PROJECTS[f.kind].name.toLowerCase()}: ${usd(left)} from the public budget.`, proposalId: f.proposalId });
      for (const e of [r.paid, r.arrears]) if (e) out.push(e);
    }
  }
  return out;
}

/** Total still owed to the lender. */
export const debtOutstanding = (t: Treasury): Cents => t.debts.reduce((s, d) => s + d.outstanding, 0);

/** Rounds after `round` that a schedule can use; at the last round a payment falls due at the end of the session. */
export const laterRounds = (round: number): number[] => (round >= TOTAL_ROUNDS ? [TOTAL_ROUNDS + 1] : Array.from({ length: TOTAL_ROUNDS - round }, (_, i) => round + 1 + i));

/** Sum of the city-side payments scheduled for a round (what the next bill holds). */
export const obligationsDue = (t: Treasury, round: number): Obligation[] => t.obligations.filter((o) => o.dueRound <= round);
