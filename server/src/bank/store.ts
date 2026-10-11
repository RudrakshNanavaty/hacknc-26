// Where the bank mirror keeps its state: the internal-to-external account map and the sync outbox. Tiger Data
// when DATABASE_URL is set (pending syncs then survive a restart), memory otherwise.
import type pg from 'pg';
import type { BankSync, WalletId } from '@shared';

/** Our wallet -> the fictional Nessie customer and account that mirror it. */
export type AccountMap = Partial<Record<WalletId, { customerId: string; accountId: string }>>;

export interface BankStore {
  readonly kind: 'tiger' | 'memory';
  loadAccounts(host: string): Promise<AccountMap>;
  saveAccounts(host: string, map: AccountMap): Promise<void>;
  /** Insert or replace items by key. */
  saveItems(items: BankSync[]): Promise<void>;
  /** Items not finished yet (pending or uncertain), oldest first. */
  openItems(): Promise<BankSync[]>;
}

export class MemoryBankStore implements BankStore {
  readonly kind = 'memory';
  private readonly accounts = new Map<string, AccountMap>();
  readonly items = new Map<string, BankSync>();

  async loadAccounts(host: string) {
    return { ...(this.accounts.get(host) ?? {}) };
  }
  async saveAccounts(host: string, map: AccountMap) {
    this.accounts.set(host, { ...map });
  }
  async saveItems(items: BankSync[]) {
    for (const it of items) this.items.set(it.key, structuredClone(it));
  }
  async openItems() {
    return [...this.items.values()].filter((i) => i.status === 'pending' || i.status === 'uncertain').sort((a, b) => a.updatedAt.localeCompare(b.updatedAt)).map((i) => structuredClone(i));
  }
}

/** Tables cc_bank_accounts and cc_bank_sync (schema.sql, idempotent). */
export class TigerBankStore implements BankStore {
  readonly kind = 'tiger';
  constructor(private readonly pool: pg.Pool) {}

  async loadAccounts(host: string) {
    const { rows } = await this.pool.query<{ wallet: WalletId; customer_id: string; account_id: string }>('SELECT wallet, customer_id, account_id FROM cc_bank_accounts WHERE host = $1', [host]);
    return Object.fromEntries(rows.map((r) => [r.wallet, { customerId: r.customer_id, accountId: r.account_id }])) as AccountMap;
  }

  async saveAccounts(host: string, map: AccountMap) {
    for (const [wallet, ids] of Object.entries(map)) {
      if (!ids) continue;
      await this.pool.query(
        `INSERT INTO cc_bank_accounts (host, wallet, customer_id, account_id) VALUES ($1, $2, $3, $4)
         ON CONFLICT (host, wallet) DO UPDATE SET customer_id = EXCLUDED.customer_id, account_id = EXCLUDED.account_id`,
        [host, wallet, ids.customerId, ids.accountId],
      );
    }
  }

  async saveItems(items: BankSync[]) {
    for (const it of items) {
      await this.pool.query(
        `INSERT INTO cc_bank_sync (key, match_id, status, updated_at, item) VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (key) DO UPDATE SET status = EXCLUDED.status, updated_at = EXCLUDED.updated_at, item = EXCLUDED.item`,
        [it.key, it.matchId, it.status, it.updatedAt, it],
      );
    }
  }

  async openItems() {
    const { rows } = await this.pool.query<{ item: BankSync }>(`SELECT item FROM cc_bank_sync WHERE status IN ('pending', 'uncertain') ORDER BY updated_at`);
    return rows.map((r) => r.item);
  }
}
