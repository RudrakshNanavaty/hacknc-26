// Capital One Nessie (https://prod.nessieisreal.com/docs), a simulated-banking API, used ONLY as an external mirror
// of the game's own ledger. Nothing here decides anything: the engine's books are authoritative.
//
// What the live API does (checked 2026-10-11 against https://prod-api.nessieisreal.com with this project's key):
// - POST /customers, POST /customers/{id}/accounts create records and answer 201 { code, message, objectCreated }.
// - POST /accounts/{id}/transfers takes exactly { transaction_date, status, amount (integer), description }: there is
//   no payee field, and transfers and deposits are records only (balances never change). So a ledger entry is
//   mirrored as ONE transfer record on the payer's account, with the payee and our idempotency key in the description.
// - POST /accounts/{id}/loans takes { type, status, credit_score, monthly_payment, amount, description }.
// - GET /accounts/{id}/transfers answers 404 "No transfers found" when there are none (treated as an empty list).
// - An unknown key is not refused: it reads an empty namespace (200 []). A missing key answers 502.
//
// The key is sent as the `key` query parameter, server side only, and never logged: errors carry a redacted URL.

export interface NessieConfig {
  baseUrl: string;
  key: string;
  timeoutMs?: number;
  /** Injected in tests: no test reaches the real API. */
  fetch?: typeof fetch;
}

export type NessieErrorKind = 'timeout' | 'network' | 'auth' | 'rejected' | 'not-found' | 'server';

export class NessieError extends Error {
  constructor(readonly kind: NessieErrorKind, message: string, readonly status?: number) {
    super(message);
  }
  /** A write that failed this way may or may not have landed: reconcile with reads before trying again. */
  get uncertain(): boolean {
    return this.kind === 'timeout' || this.kind === 'network' || this.kind === 'server';
  }
}

export interface NessieCustomer { _id: string; first_name: string; last_name: string }
export interface NessieAccount { _id: string; nickname: string; type: string; customer_id?: string }
/** List answers use `id`, create answers use `_id`. */
export interface NessieRecord { _id?: string; id?: string; description?: string; status?: string; amount?: number }
export const recordId = (r: NessieRecord): string | null => r._id ?? r.id ?? null;

export interface TransferBody { transaction_date: string; status: 'completed'; amount: number; description: string }
export interface LoanBody { type: string; status: string; credit_score: number; monthly_payment: number; amount: number; description: string }

/** Read Nessie settings from the environment. Off unless NESSIE_ENABLED is exactly "true" and a key is set. */
export function nessieConfigFromEnv(env: NodeJS.ProcessEnv = process.env): NessieConfig | null {
  if ((env.NESSIE_ENABLED ?? '').trim().toLowerCase() !== 'true') return null;
  const key = (env.NESSIE_API_KEY ?? '').trim();
  if (!key) return null;
  return { baseUrl: (env.NESSIE_BASE_URL ?? '').trim() || 'https://prod-api.nessieisreal.com', key };
}

export class NessieClient {
  private readonly base: string;
  private readonly timeoutMs: number;
  private readonly doFetch: typeof fetch;

  constructor(private readonly cfg: NessieConfig) {
    this.base = cfg.baseUrl.replace(/\/+$/, '');
    this.timeoutMs = cfg.timeoutMs ?? 8_000;
    this.doFetch = cfg.fetch ?? fetch;
  }

  get host(): string {
    return this.base;
  }

  private redact(text: string): string {
    return this.cfg.key ? text.split(this.cfg.key).join('<redacted>') : text;
  }

  async request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    const url = `${this.base}${path}${path.includes('?') ? '&' : '?'}key=${encodeURIComponent(this.cfg.key)}`;
    const where = `${method} ${path}`;
    let res: Response;
    try {
      res = await this.doFetch(url, {
        method,
        headers: body === undefined ? undefined : { 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      const e = err as Error;
      if (e.name === 'TimeoutError' || e.name === 'AbortError') throw new NessieError('timeout', `${where}: no answer within ${this.timeoutMs} ms`);
      throw new NessieError('network', this.redact(`${where}: ${e.message}`));
    }
    const text = await res.text().catch(() => '');
    if (res.ok) {
      try {
        return (text ? JSON.parse(text) : null) as T;
      } catch {
        throw new NessieError('server', `${where}: answered ${res.status} with a body that is not JSON`, res.status);
      }
    }
    const detail = this.redact(text.slice(0, 200));
    if (res.status === 401 || res.status === 403) throw new NessieError('auth', `${where}: not authorized (${res.status})`, res.status);
    if (res.status === 404) throw new NessieError('not-found', `${where}: not found ${detail}`, res.status);
    if (res.status >= 400 && res.status < 500) throw new NessieError('rejected', `${where}: rejected (${res.status}) ${detail}`, res.status);
    // 502 with no key at all is a configuration problem, not an outage.
    if (res.status === 502 && !this.cfg.key) throw new NessieError('auth', `${where}: no API key`, res.status);
    throw new NessieError('server', `${where}: server error (${res.status}) ${detail}`, res.status);
  }

  /** GET a list; Nessie answers 404 for an empty one. */
  private async list<T>(path: string): Promise<T[]> {
    try {
      const out = await this.request<T[]>('GET', path);
      return Array.isArray(out) ? out : [];
    } catch (err) {
      if (err instanceof NessieError && err.kind === 'not-found' && /no .*found/i.test(err.message)) return [];
      throw err;
    }
  }

  listCustomers = () => this.list<NessieCustomer>('/customers');
  listAccounts = (customerId: string) => this.list<NessieAccount>(`/customers/${encodeURIComponent(customerId)}/accounts`);
  listTransfers = (accountId: string) => this.list<NessieRecord>(`/accounts/${encodeURIComponent(accountId)}/transfers`);
  listLoans = (accountId: string) => this.list<NessieRecord>(`/accounts/${encodeURIComponent(accountId)}/loans`);

  async createCustomer(lastName: string): Promise<NessieCustomer> {
    const r = await this.request<{ objectCreated: NessieCustomer }>('POST', '/customers', {
      first_name: 'CoastalClash', last_name: lastName,
      address: { street_number: '1', street_name: 'Simulated Way', city: 'Miami Beach', state: 'FL', zip: '33139' },
    });
    return r.objectCreated;
  }

  async createAccount(customerId: string, nickname: string): Promise<NessieAccount> {
    const r = await this.request<{ objectCreated: NessieAccount }>('POST', `/customers/${encodeURIComponent(customerId)}/accounts`, { type: 'Checking', nickname, rewards: 0, balance: 0 });
    return r.objectCreated;
  }

  async createTransfer(accountId: string, body: TransferBody): Promise<NessieRecord> {
    const r = await this.request<{ objectCreated: NessieRecord }>('POST', `/accounts/${encodeURIComponent(accountId)}/transfers`, body);
    return r.objectCreated;
  }

  async createLoan(accountId: string, body: LoanBody): Promise<NessieRecord> {
    const r = await this.request<{ objectCreated: NessieRecord }>('POST', `/accounts/${encodeURIComponent(accountId)}/loans`, body);
    return r.objectCreated;
  }
}
