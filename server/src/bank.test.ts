// The Nessie bank mirror against a fake Nessie (the real API is never called: a tripwire replaces global fetch).
// Covers provisioning once, idempotent enqueue, timeouts with and without a landed write, auth errors, refusals,
// a restart with pending syncs, bond loans, a full bot match over WebSockets, and replay with zero network calls.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AddressInfo } from 'node:net';
import WebSocket from 'ws';
import { authoredScenario, buildBoard, millions, replayMatch, resolveRound, startCity, type BankSync, type LedgerEntry, type RoomState, type ServerMsg } from '@shared';
import { buildServer } from './app';
import { MemoryStore } from './db/store';
import { BankMirror, marker } from './bank/mirror';
import { NessieClient } from './bank/nessie';
import { MemoryBankStore } from './bank/store';
import { rooms } from './rooms';

type FakeRecord = { _id: string; description: string; amount: number; status?: string; monthly_payment?: number };
type Mode = 'timeout-after-write' | 'timeout-before-write' | 'auth' | 'reject' | 'server-after-write';

/** A tiny Nessie: customers, accounts, transfers and loans in memory, with failures on demand. */
class FakeNessie {
  customers: { _id: string; first_name: string; last_name: string }[] = [];
  accounts: { _id: string; nickname: string; type: string; customer_id: string }[] = [];
  transfers = new Map<string, FakeRecord[]>();
  loans = new Map<string, FakeRecord[]>();
  calls: string[] = [];
  failures: { when: (method: string, path: string) => boolean; mode: Mode }[] = [];
  /** Listings that lag: this many reads of an account's transfers leave out its newest record. */
  lagReads = 0;
  private n = 0;
  readonly key = 'test-key-not-real';

  fail(mode: Mode, when: (method: string, path: string) => boolean = (m, p) => m === 'POST' && p.endsWith('/transfers')) {
    this.failures.push({ when, mode });
  }

  fetch: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    const method = init?.method ?? 'GET';
    const path = url.pathname;
    this.calls.push(`${method} ${path}`);
    if (url.searchParams.get('key') !== this.key) return new Response('', { status: 404 });
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    const i = this.failures.findIndex((f) => f.when(method, path));
    const failure = i >= 0 ? this.failures.splice(i, 1)[0]!.mode : null;
    const timeout = () => Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' });
    if (failure === 'timeout-before-write') throw timeout();
    if (failure === 'auth') return new Response('{"message":"forbidden"}', { status: 403 });
    if (failure === 'reject') return new Response('"1 validation error for TransferCreate"', { status: 400 });
    const res = this.route(method, path, body);
    if (failure === 'timeout-after-write') throw timeout();
    if (failure === 'server-after-write') return new Response('upstream error', { status: 503 });
    return res;
  };

  private id = () => `fake-${++this.n}`;
  private json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status, headers: { 'content-type': 'application/json' } });

  private route(method: string, path: string, body: Record<string, unknown> | undefined): Response {
    let m: RegExpMatchArray | null;
    if (path === '/customers' && method === 'GET') return this.json(this.customers);
    if (path === '/customers' && method === 'POST') {
      const c = { _id: this.id(), first_name: String(body!.first_name), last_name: String(body!.last_name) };
      this.customers.push(c);
      return this.json({ code: 201, objectCreated: c }, 201);
    }
    if ((m = path.match(/^\/customers\/([^/]+)\/accounts$/))) {
      if (method === 'GET') return this.json(this.accounts.filter((a) => a.customer_id === m![1]));
      const a = { _id: this.id(), nickname: String(body!.nickname), type: String(body!.type), customer_id: m[1]! };
      this.accounts.push(a);
      return this.json({ code: 201, objectCreated: a }, 201);
    }
    if ((m = path.match(/^\/accounts\/([^/]+)\/(transfers|loans)$/))) {
      const book: Map<string, FakeRecord[]> = m[2] === 'transfers' ? this.transfers : this.loans;
      const list = book.get(m[1]!) ?? [];
      if (method === 'GET') {
        const shown = this.lagReads > 0 ? (this.lagReads--, list.slice(0, -1)) : list;
        return shown.length ? this.json(shown.map(({ _id, ...rest }) => ({ id: _id, ...rest }))) : new Response(`"No ${m[2]} found for this account"`, { status: 404 });
      }
      if (typeof body!.amount !== 'number' || !Number.isInteger(body!.amount)) return new Response('"amount: value is not a valid integer"', { status: 400 });
      const rec: FakeRecord = { _id: this.id(), ...(body as Omit<FakeRecord, '_id'>) };
      book.set(m[1]!, [...list, rec]);
      return this.json({ code: 201, objectCreated: rec }, 201);
    }
    return new Response('', { status: 404 });
  }

  transferCount = () => [...this.transfers.values()].reduce((s, l) => s + l.length, 0);
  writes = () => this.calls.filter((c) => c.startsWith('POST')).length;
}

const log = { warn: () => {}, info: () => {} };
const entry = (id: string, from: LedgerEntry['from'], to: LedgerEntry['to'], m: number, rule = 'B2'): LedgerEntry => ({ id, round: 1, rule, kind: 'project', from, to, amount: millions(m), text: 'test' });

function mirrorOn(fake: FakeNessie, store = new MemoryBankStore(), updates: BankSync[] = []) {
  const client = new NessieClient({ baseUrl: 'https://nessie.test', key: fake.key, fetch: fake.fetch, timeoutMs: 50 });
  return { mirror: new BankMirror({ client, store, log, onUpdate: (_m, items) => updates.push(...items), retryMs: 5 }), store, updates };
}

/** Run the mirror until nothing changes (uncertain items are retried on later passes). */
async function settle(mirror: BankMirror) {
  for (let i = 0; i < 8; i++) {
    await mirror.drain();
    if (!mirror.status().open || mirror.status().state === 'paused') break;
  }
}

let realFetch: typeof fetch;
beforeEach(() => {
  realFetch = globalThis.fetch;
  // Tripwire: nothing in these tests may reach a real network.
  globalThis.fetch = vi.fn(async () => {
    throw new Error('a test tried to reach the network');
  }) as unknown as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

describe('the Nessie mirror', () => {
  it('provisions eight fictional accounts once, and a restart reuses them', async () => {
    const fake = new FakeNessie();
    // A pre-existing customer that is not ours is never touched.
    fake.customers.push({ _id: 'someone-else', first_name: 'Jane', last_name: 'Doe' });
    const a = mirrorOn(fake);
    a.mirror.enqueue('m1', 1, [entry('r1-m1', 'city', 'builders', 8)], startCity().treasury);
    await settle(a.mirror);
    expect(fake.customers.filter((c) => c.first_name === 'CoastalClash')).toHaveLength(8);
    expect(fake.accounts).toHaveLength(8);
    expect(fake.calls.some((c) => c.includes('someone-else'))).toBe(false);
    const b = mirrorOn(fake);
    b.mirror.enqueue('m2', 1, [entry('r1-m1', 'city', 'builders', 8)], startCity().treasury);
    await settle(b.mirror);
    expect(fake.customers).toHaveLength(9);
    expect(fake.accounts).toHaveLength(8);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('mirrors each entry as one transfer record on the payer, once, however often it is enqueued', async () => {
    const fake = new FakeNessie();
    const { mirror } = mirrorOn(fake);
    const entries = [entry('r1-m1', 'city', 'builders', 8), entry('r1-m2', 'resort', 'city', 2, 'A4')];
    expect(mirror.enqueue('m1', 1, entries, startCity().treasury)).toHaveLength(2);
    expect(mirror.enqueue('m1', 1, entries, startCity().treasury)).toHaveLength(0); // duplicate submission
    await settle(mirror);
    expect(mirror.itemsOf('m1').map((i) => i.status)).toEqual(['confirmed', 'confirmed']);
    expect(fake.transferCount()).toBe(2);
    const city = fake.accounts.find((a) => a.nickname === 'cc-sim:city')!._id;
    const rec = fake.transfers.get(city)![0]!;
    expect(rec.amount).toBe(8_000_000); // whole simulated dollars
    expect(rec.description).toContain(marker('m1:r1-m1'));
    expect(rec.description).toMatch(/simulated money, not real/);
    mirror.enqueue('m1', 1, entries, startCity().treasury);
    await settle(mirror);
    expect(fake.transferCount()).toBe(2);
  });

  it('a timeout after the write landed: uncertain, reconciled by reading, confirmed without a second write', async () => {
    const fake = new FakeNessie();
    const { mirror } = mirrorOn(fake);
    await settle(mirror); // provision first
    fake.fail('timeout-after-write');
    mirror.enqueue('m1', 1, [entry('r1-m1', 'city', 'builders', 8)], startCity().treasury);
    await mirror.drain();
    expect(mirror.itemsOf('m1')[0]!.status).toBe('uncertain');
    await settle(mirror);
    const it = mirror.itemsOf('m1')[0]!;
    expect(it.status).toBe('confirmed');
    expect(it.externalId).toBeTruthy();
    expect(fake.transferCount()).toBe(1);
    expect(fake.calls.filter((c) => c.startsWith('POST') && c.endsWith('/transfers'))).toHaveLength(1);
  });

  it('a timeout before the write: the read finds nothing, so it is sent again, exactly once', async () => {
    const fake = new FakeNessie();
    const { mirror } = mirrorOn(fake);
    await settle(mirror);
    fake.fail('timeout-before-write');
    mirror.enqueue('m1', 1, [entry('r1-m1', 'city', 'builders', 8)], startCity().treasury);
    await settle(mirror);
    expect(mirror.itemsOf('m1')[0]).toMatchObject({ status: 'confirmed', attempts: 2 });
    expect(fake.transferCount()).toBe(1);
  });

  it('a write that lands but shows up late in the listing is found on the second read, not sent twice', async () => {
    const fake = new FakeNessie();
    const { mirror } = mirrorOn(fake);
    await settle(mirror);
    fake.fail('timeout-after-write');
    fake.lagReads = 1;
    mirror.enqueue('m1', 1, [entry('r1-m1', 'city', 'builders', 8)], startCity().treasury);
    await settle(mirror);
    expect(mirror.itemsOf('m1')[0]).toMatchObject({ status: 'confirmed', attempts: 1 });
    expect(fake.transferCount()).toBe(1);
    expect(fake.calls.filter((c) => c.startsWith('GET') && c.endsWith('/transfers'))).toHaveLength(2);
  });

  it('a key that cannot see the accounts already mapped pauses the mirror instead of provisioning a second set', async () => {
    const before = new FakeNessie();
    const store = new MemoryBankStore();
    const first = mirrorOn(before, store);
    await settle(first.mirror);
    expect(before.customers).toHaveLength(8);
    // Same host, a different (mistyped) key: Nessie answers with an empty namespace, not an error.
    const other = new FakeNessie();
    const second = mirrorOn(other, store);
    second.mirror.enqueue('m1', 1, [entry('r1-m1', 'city', 'builders', 8)], startCity().treasury);
    await settle(second.mirror);
    expect(second.mirror.status()).toMatchObject({ state: 'paused', paused: expect.stringMatching(/not visible with this key/) });
    expect(other.writes()).toBe(0);
    expect(second.mirror.itemsOf('m1')[0]!.status).toBe('pending');
  });

  it('a server error after the write is treated as unknown, never resent blindly', async () => {
    const fake = new FakeNessie();
    const { mirror } = mirrorOn(fake);
    await settle(mirror);
    fake.fail('server-after-write');
    mirror.enqueue('m1', 1, [entry('r1-m1', 'city', 'builders', 8)], startCity().treasury);
    await settle(mirror);
    expect(mirror.itemsOf('m1')[0]!.status).toBe('confirmed');
    expect(fake.transferCount()).toBe(1);
  });

  it('an auth error pauses the mirror; the item stays pending and nothing else is sent', async () => {
    const fake = new FakeNessie();
    const { mirror } = mirrorOn(fake);
    await settle(mirror);
    fake.fail('auth');
    mirror.enqueue('m1', 1, [entry('r1-m1', 'city', 'builders', 8), entry('r1-m2', 'city', 'builders', 1)], startCity().treasury);
    await settle(mirror);
    expect(mirror.status()).toMatchObject({ state: 'paused' });
    expect(mirror.itemsOf('m1').map((i) => i.status)).toEqual(['pending', 'pending']);
    const writes = fake.writes();
    mirror.enqueue('m1', 1, [entry('r1-m3', 'city', 'builders', 1)], startCity().treasury);
    await settle(mirror);
    expect(fake.writes()).toBe(writes);
  });

  it('a refusal (validation) is final: failed, not resent', async () => {
    const fake = new FakeNessie();
    const { mirror } = mirrorOn(fake);
    await settle(mirror);
    fake.fail('reject');
    mirror.enqueue('m1', 1, [entry('r1-m1', 'city', 'builders', 8)], startCity().treasury);
    await settle(mirror);
    expect(mirror.itemsOf('m1')[0]).toMatchObject({ status: 'failed', attempts: 1 });
    expect(fake.transferCount()).toBe(0);
  });

  it('after a restart, pending and uncertain syncs resume from the store; the uncertain one is reconciled, not duplicated', async () => {
    const fake = new FakeNessie();
    const store = new MemoryBankStore();
    const first = mirrorOn(fake, store);
    await settle(first.mirror);
    fake.fail('timeout-after-write');
    first.mirror.enqueue('m1', 1, [entry('r1-m1', 'city', 'builders', 8)], startCity().treasury);
    await first.mirror.drain(); // uncertain, and the server "restarts" here
    first.mirror.close();
    const pending: BankSync = { key: 'm1:r1-m2', matchId: 'm1', entryId: 'r1-m2', round: 1, kind: 'transfer', from: 'resort', to: 'builders', amount: millions(7), rule: 'A1', status: 'pending', externalId: null, attempts: 0, error: null, updatedAt: new Date().toISOString() };
    await store.saveItems([pending]);
    expect((await store.openItems()).map((i) => i.status).sort()).toEqual(['pending', 'uncertain']);
    const second = mirrorOn(fake, store);
    expect(await second.mirror.resume()).toBe(2);
    await settle(second.mirror);
    expect(second.mirror.itemsOf('m1').map((i) => i.status)).toEqual(['confirmed', 'confirmed']);
    expect(fake.transferCount()).toBe(2);
    expect(await store.openItems()).toEqual([]);
  });

  it('a bond becomes a loan record on the city account, with its installment', async () => {
    const fake = new FakeNessie();
    const { mirror } = mirrorOn(fake);
    const board = buildBoard(1, [{ seat: 0, persona: 'mayor', card: 'resilience-bond', district: 'west-avenue' }, { seat: 3, persona: 'resident', card: 'elevate-buildings', district: 'west-avenue' }]);
    const r = resolveRound(board, [], startCity());
    mirror.enqueue('m1', 1, r.ledger, r.city.treasury);
    await settle(mirror);
    const items = mirror.itemsOf('m1');
    expect(items.map((i) => [i.kind, i.status])).toEqual([['transfer', 'confirmed'], ['loan', 'confirmed']]);
    const city = fake.accounts.find((a) => a.nickname === 'cc-sim:city')!._id;
    expect(fake.loans.get(city)![0]).toMatchObject({ amount: 5_000_000, monthly_payment: 3_000_000 });
  });
});

describe('a full match with the mirror on, and replays that never call out', () => {
  const fake = new FakeNessie();
  const store = new MemoryStore();
  const down = () => Promise.reject(new Error('Gemini is down'));
  const app = buildServer({
    store,
    narrator: { line: down },
    director: { dialogue: down, event: down, hints: down, explain: down },
    scenario: { live: async () => null, write: down },
    bank: { client: new NessieClient({ baseUrl: 'https://nessie.test', key: fake.key, fetch: fake.fetch, timeoutMs: 50 }), store: new MemoryBankStore(), retryMs: 5 },
  });
  let base = '';
  beforeAll(async () => {
    await app.listen({ port: 0, host: '127.0.0.1' });
    base = `127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  });
  afterAll(() => app.close());

  it('a bot match: every ledger entry is mirrored and confirmed; the record and the screen show the sync status', async () => {
    rooms.delete('BANK');
    const ws = new WebSocket(`ws://${base}/ws/rooms/BANK`);
    const seen: ServerMsg[] = [];
    ws.on('message', (raw) => seen.push(JSON.parse(String(raw)) as ServerMsg));
    await new Promise((r) => ws.once('open', r));
    const send = (m: object) => ws.send(JSON.stringify(m));
    const latest = () => [...seen].reverse().find((m): m is { t: 'state'; state: RoomState } => m.t === 'state')?.state;
    const until = async (test: (s: RoomState) => boolean) => {
      for (let i = 0; i < 400; i++) {
        const s = latest();
        if (s && test(s)) return s;
        await new Promise((r) => setTimeout(r, 10));
      }
      throw new Error(`timed out; phase ${latest()?.phase}`);
    };
    send({ t: 'join', name: 'Mae', persona: 'mayor', create: true });
    await until((s) => s.players.length === 1);
    for (const p of ['activist', 'resort', 'resident']) send({ t: 'bot', persona: p, on: true });
    send({ t: 'pace', pace: 'demo' });
    await until((s) => s.players.length === 4);
    send({ t: 'start' });
    let round = 0;
    while (latest()?.phase !== 'final') {
      const s = await until((x) => x.phase !== 'lobby' && (x.phase !== 'crisis' || !!x.crisis));
      if (s.phase === 'select' && !s.mine?.selection) send({ t: 'select', card: s.round === 1 ? 'drainage-upgrade' : s.round === 2 ? 'resilience-bond' : 'emergency-funding', district: 'west-avenue' });
      else if (s.phase === 'negotiate') send({ t: 'done' });
      else if (s.phase !== 'final') send({ t: 'skip' });
      if (s.round !== round) round = s.round;
      await new Promise((r) => setTimeout(r, 15));
    }
    await app.mirror!.drain();
    const final = await until((s) => s.phase === 'final' && s.bank.items.length > 0 && s.bank.items.every((i) => i.status === 'confirmed'));
    expect(final.bank.mirror).toBe('nessie');
    const ledger = final.history.flatMap((h) => h.resolution.city.treasury.ledger.filter((e) => e.round === h.round));
    expect(final.bank.items.filter((i) => i.kind === 'transfer')).toHaveLength(ledger.length);
    expect(fake.transferCount()).toBe(ledger.length);
    expect((await app.inject({ url: '/api/bank' })).json()).toMatchObject({ enabled: true, open: 0 });
    // The stored record carries the sync status next to the outcomes; Planning Studio shows it.
    await new Promise((r) => setTimeout(r, 30));
    const record = (await store.list(1))[0]!;
    expect(record.bank!.items.every((i) => i.status === 'confirmed')).toBe(true);
    const studio = (await app.inject({ url: '/api/studio' })).json();
    expect(studio.summary.money.sync.confirmed).toBe(final.bank.items.length);
    const csv = (await app.inject({ url: '/api/studio/export.csv' })).body;
    expect(csv).toMatch(/,ledger,/);
    expect(csv).toMatch(/confirmed,fake-\d+/);

    // Replay: the record alone, through the engine, with no network at all.
    const calls = fake.calls.length;
    const replay = replayMatch(record);
    expect(replay).toMatchObject({ comparable: true, matches: true, mismatches: [] });
    expect(fake.calls.length).toBe(calls);
    expect(globalThis.fetch).not.toHaveBeenCalled();
    ws.close();
  }, 20_000);
});

describe('the game does not notice the bank', () => {
  it('with the mirror timing out on every call, a round resolves exactly as with it off', () => {
    const board = buildBoard(1, [{ seat: 0, persona: 'mayor', card: 'drainage-upgrade', district: 'west-avenue' }]);
    const off = resolveRound(board, [], startCity());
    const fake = new FakeNessie();
    for (let i = 0; i < 50; i++) fake.fail('timeout-before-write', () => true);
    const { mirror } = mirrorOn(fake);
    mirror.enqueue('m1', 1, off.ledger, off.city.treasury);
    // Nothing above waited on the mirror; the resolution is pure and the same either way.
    expect(resolveRound(board, [], startCity())).toEqual(off);
    mirror.close();
  });
});

void authoredScenario;
