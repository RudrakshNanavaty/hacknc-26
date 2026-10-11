// The bank mirror: copies each resolved round's ledger to Nessie as records on fictional, simulated accounts.
//
//   resolveRound (engine, authoritative) -> room effect 'ledger' -> enqueue (idempotent by key) -> outbox
//   -> worker: send -> confirmed | uncertain -> reconcile by reading -> confirmed | pending (absent, safe to send) | failed
//
// Invariants:
// - Turns never wait on it, and it never changes a game outcome; its status is reported next to the outcome.
// - An uncertain write (timeout, network, server error) is never retried blindly: the payer's records are read first,
//   and our key in the description says whether it landed. It is sent again only after TWO reads, a retry interval
//   apart, both find nothing (a write that shows up late in the listing is not duplicated).
// - A key that cannot see the accounts this server already mapped is refused (Nessie serves any unknown key an empty
//   namespace instead of an error): the mirror pauses instead of provisioning a second set.
// - Accounts are provisioned once and reused: eight fictional customers ("CoastalClash <Wallet>"), one account each,
//   found by name before anything is created. Never more, however many matches are played. Pre-existing customers are
//   never touched (only CoastalClash-named ones are read, and only ours are written to).
// - Pending and uncertain items are stored (Tiger Data when configured), so a restart resumes them.
import { WALLETS, WALLET_INFO, usd, type BankSync, type LedgerEntry, type Treasury, type WalletId } from '@shared';
import { NessieError, recordId, type NessieClient } from './nessie';
import type { AccountMap, BankStore } from './store';

const LAST_NAME: Record<WalletId, string> = {
  city: 'City', activist: 'Activist', resort: 'Resort', resident: 'Resident', lender: 'Lender', grants: 'Grants', builders: 'Builders', reserves: 'Reserves',
};
const nickname = (w: WalletId) => `cc-sim:${w}`;
/** Whole simulated dollars (Nessie amounts are integers). Every game amount is a whole $M, so this is exact. */
const dollars = (cents: number) => Math.round(cents / 100);
/** The idempotency marker written into every external description. */
export const marker = (key: string) => `[cc:${key}]`;

export interface MirrorStatus {
  enabled: true;
  host: string;
  state: 'idle' | 'working' | 'paused';
  /** Why the mirror paused (an auth error); new items wait until a restart. */
  paused: string | null;
  accounts: number;
  open: number;
}

export interface MirrorOptions {
  client: NessieClient;
  store: BankStore;
  log: { warn: (obj: unknown, msg: string) => void; info?: (obj: unknown, msg: string) => void };
  /** Every status change, for the match record and the players' ledger panel. */
  onUpdate: (matchId: string, items: BankSync[]) => void;
  now?: () => Date;
  /** Attempts to send one item before it is marked failed. */
  maxAttempts?: number;
  /** Wait between passes over uncertain items, ms. */
  retryMs?: number;
}

export class BankMirror {
  private readonly queue = new Map<string, BankSync>();
  private accounts: AccountMap = {};
  private provisioned = false;
  private running: Promise<void> | null = null;
  private pausedFor: string | null = null;
  private timer: NodeJS.Timeout | null = null;
  private readonly now: () => Date;
  private readonly maxAttempts: number;
  private readonly retryMs: number;

  constructor(private readonly o: MirrorOptions) {
    this.now = o.now ?? (() => new Date());
    this.maxAttempts = o.maxAttempts ?? 4;
    this.retryMs = o.retryMs ?? 3_000;
  }

  status(): MirrorStatus {
    return {
      enabled: true, host: this.o.client.host, state: this.pausedFor ? 'paused' : this.running ? 'working' : 'idle', paused: this.pausedFor,
      accounts: Object.keys(this.accounts).length, open: [...this.queue.values()].filter((i) => i.status === 'pending' || i.status === 'uncertain').length,
    };
  }

  /** After a restart: resume what was not finished (uncertain items are reconciled before anything is sent). */
  async resume(): Promise<number> {
    const open = await this.o.store.openItems().catch((err) => {
      this.o.log.warn({ err: (err as Error).message }, 'bank mirror: could not load pending syncs');
      return [] as BankSync[];
    });
    for (const it of open) if (!this.queue.has(it.key)) this.queue.set(it.key, it);
    if (open.length) this.kick();
    return open.length;
  }

  /**
   * A round's money is final: queue its ledger entries (one transfer record each) and its bonds (one loan record each).
   * Idempotent: an entry already queued, sent or confirmed is never queued again.
   */
  enqueue(matchId: string, round: number, entries: LedgerEntry[], treasury: Treasury): BankSync[] {
    const at = this.now().toISOString();
    const fresh: BankSync[] = [];
    for (const e of entries) {
      const key = `${matchId}:${e.id}`;
      if (!this.queue.has(key)) fresh.push({ key, matchId, entryId: e.id, round, kind: 'transfer', from: e.from, to: e.to, amount: e.amount, rule: e.rule, status: 'pending', externalId: null, attempts: 0, error: null, updatedAt: at });
      if (e.kind === 'bond') {
        const debt = treasury.debts.find((d) => d.id === `${e.id}-bond`);
        const first = treasury.obligations.find((x) => x.debtId === debt?.id);
        const loanKey = `${key}:loan`;
        if (debt && !this.queue.has(loanKey)) {
          fresh.push({ key: loanKey, matchId, entryId: e.id, round, kind: 'loan', from: 'lender', to: 'city', amount: debt.outstanding, installment: first?.amount ?? 0, rule: 'A2', status: 'pending', externalId: null, attempts: 0, error: null, updatedAt: at });
        }
      }
    }
    for (const it of fresh) this.queue.set(it.key, it);
    if (fresh.length) {
      this.persist(fresh);
      this.o.onUpdate(matchId, fresh);
      this.kick();
    }
    return fresh;
  }

  /** Items of a match as the mirror sees them now. */
  itemsOf(matchId: string): BankSync[] {
    return [...this.queue.values()].filter((i) => i.matchId === matchId);
  }

  /** Run the worker until nothing is ready; resolves when idle (tests await it). */
  drain(): Promise<void> {
    this.kick();
    return this.running ?? Promise.resolve();
  }

  close(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private kick(): void {
    if (this.running || this.pausedFor) return;
    this.running = this.work().finally(() => {
      this.running = null;
      const waiting = [...this.queue.values()].some((i) => i.status === 'uncertain' || i.status === 'pending');
      if (waiting && !this.pausedFor && !this.timer) {
        this.timer = setTimeout(() => {
          this.timer = null;
          this.kick();
        }, this.retryMs);
        this.timer.unref?.();
      }
    });
  }

  private persist(items: BankSync[]): void {
    this.o.store.saveItems(items).catch((err) => this.o.log.warn({ err: (err as Error).message }, 'bank mirror: sync state not saved'));
  }

  private update(it: BankSync, patch: Partial<BankSync>): void {
    Object.assign(it, patch, { updatedAt: this.now().toISOString() });
    this.persist([it]);
    this.o.onUpdate(it.matchId, [{ ...it }]);
  }

  private async work(): Promise<void> {
    try {
      await this.ensureAccounts();
    } catch (err) {
      this.handleFatal(err, 'provisioning');
      return;
    }
    // One pass: uncertain items are reconciled, pending ones are sent, in queue order. A failure is retried on a later pass.
    for (const it of [...this.queue.values()]) {
      if (this.pausedFor) return;
      if (it.status === 'uncertain') await this.reconcile(it);
      if (it.status === 'pending') await this.send(it);
    }
  }

  private handleFatal(err: unknown, what: string): void {
    const e = err as Error;
    if (err instanceof NessieError && err.kind === 'auth') {
      this.pausedFor = `${what}: ${e.message}`;
      this.o.log.warn({ err: e.message }, 'bank mirror paused: Nessie refused the key');
    } else this.o.log.warn({ err: e.message }, `bank mirror: ${what} failed; will retry`);
  }

  /** Find or create the eight fictional customers and accounts. Reads first, so a restart never creates duplicates. */
  private async ensureAccounts(): Promise<void> {
    if (this.provisioned) return;
    const host = this.o.client.host;
    this.accounts = await this.o.store.loadAccounts(host).catch(() => ({}));
    const customers = (await this.o.client.listCustomers()).filter((c) => c.first_name === 'CoastalClash');
    // Accounts we mapped before, none of them visible now: almost certainly a different (mistyped) key.
    const mapped = Object.values(this.accounts).filter(Boolean);
    if (mapped.length && !mapped.some((a) => customers.some((c) => c._id === a!.customerId))) {
      throw new NessieError('auth', `the ${mapped.length} accounts already mapped for ${host} are not visible with this key; check NESSIE_API_KEY (to provision a fresh set on purpose, clear cc_bank_accounts for this host)`);
    }
    let changed = false;
    for (const w of WALLETS) {
      let customer = customers.find((c) => c.last_name === LAST_NAME[w]);
      if (!customer) {
        customer = await this.o.client.createCustomer(LAST_NAME[w]);
        customers.push(customer);
        this.o.log.info?.({ wallet: w }, 'bank mirror: created a fictional customer');
      }
      const accounts = await this.o.client.listAccounts(customer._id);
      let account = accounts.find((a) => a.nickname === nickname(w));
      if (!account) account = await this.o.client.createAccount(customer._id, nickname(w));
      const known = this.accounts[w];
      if (!known || known.accountId !== account._id || known.customerId !== customer._id) {
        this.accounts[w] = { customerId: customer._id, accountId: account._id };
        changed = true;
      }
    }
    if (changed) await this.o.store.saveAccounts(host, this.accounts).catch(() => {});
    this.provisioned = true;
  }

  private accountOf(w: WalletId): string {
    const a = this.accounts[w];
    if (!a) throw new Error(`no mirror account for ${w}`);
    return a.accountId;
  }

  /** Where an item's record lives: transfers on the payer's account, loans on the borrower's (the city). */
  private home = (it: BankSync) => this.accountOf(it.kind === 'loan' ? it.to : it.from);

  private description(it: BankSync): string {
    const tail = '(Coastal Clash simulated money, not real)';
    if (it.kind === 'loan') return `${marker(it.key)} Resilience bond: ${WALLET_INFO.city.name} owes ${usd(it.amount)} to the simulated lender, installments of about ${usd(it.installment ?? 0)} per round ${tail}`;
    return `${marker(it.key)} ${it.rule ?? ''} ${WALLET_INFO[it.from].short} -> ${WALLET_INFO[it.to].short}: ${usd(it.amount)} ${tail}`.replace(/\s+/g, ' ');
  }

  private async send(it: BankSync): Promise<void> {
    if (it.attempts >= this.maxAttempts) {
      this.update(it, { status: 'failed', error: `gave up after ${it.attempts} attempts; check the account by hand` });
      return;
    }
    this.update(it, { attempts: it.attempts + 1 });
    const date = this.now().toISOString().slice(0, 10);
    try {
      const rec = it.kind === 'loan'
        ? await this.o.client.createLoan(this.home(it), { type: 'municipal bond (simulated)', status: 'approved', credit_score: 0, monthly_payment: dollars(it.installment ?? 0), amount: dollars(it.amount), description: this.description(it) })
        : await this.o.client.createTransfer(this.home(it), { transaction_date: date, status: 'completed', amount: dollars(it.amount), description: this.description(it) });
      this.update(it, { status: 'confirmed', externalId: recordId(rec), error: null });
    } catch (err) {
      if (err instanceof NessieError && err.uncertain) {
        // It may have landed. Do not send again until a read says it did not.
        this.update(it, { status: 'uncertain', error: err.message });
      } else if (err instanceof NessieError && err.kind === 'auth') {
        this.update(it, { status: 'pending', error: err.message });
        this.handleFatal(err, 'sending');
      } else {
        // A definite refusal (validation): nothing landed, and sending it again would be refused again.
        this.update(it, { status: 'failed', error: (err as Error).message });
      }
    }
  }

  /** Read the home account's records: our marker in a description proves the write landed. */
  private async reconcile(it: BankSync): Promise<void> {
    try {
      const records = it.kind === 'loan' ? await this.o.client.listLoans(this.home(it)) : await this.o.client.listTransfers(this.home(it));
      const found = records.find((r) => typeof r.description === 'string' && r.description.includes(marker(it.key)));
      if (found) this.update(it, { status: 'confirmed', externalId: recordId(found), checks: 0, error: null });
      // Absent on the first read: a listing can lag behind a write, so read once more on the next pass.
      else if ((it.checks ?? 0) < 1) this.update(it, { checks: (it.checks ?? 0) + 1, error: `not found on the first read after an uncertain write (${it.error ?? 'unknown'}); reading again before sending` });
      // Absent twice, a retry apart: it never landed, so sending it is safe (still counted against the attempt limit).
      else this.update(it, { status: 'pending', checks: 0, error: 'not found on two reads; sending again' });
    } catch (err) {
      // Still cannot tell: stay uncertain and try reading again on a later pass.
      this.update(it, { error: `reconcile failed: ${(err as Error).message}` });
      if (err instanceof NessieError && err.kind === 'auth') this.handleFatal(err, 'reconciling');
    }
  }
}

