import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import WebSocket from 'ws';
import { AVATARS, BRIEFING_SECONDS, BUILD_SECONDS, LOCK_GRACE_MS, flatTile, ridgedTile, type RoomState, type ServerMsg } from '@shared';
import { buildServer } from './app';
import { MemoryStore } from './db/store';
import { RoomError, again, getOrCreateRoom, join, lock, pick, presence, rooms, setReef, start, tick, type Evaluator } from './rooms';

const okEvaluator = (material: number, settlementRate: number | null): Evaluator => () => ({
  result: { material, settlementRate, model: 'test', seed: 1 },
  design: flatTile(),
  experimentId: `exp-${material}`,
});

describe('room state machine', () => {
  const fresh = (code = 'ABCD') => {
    rooms.delete(code);
    return getOrCreateRoom(code, 0);
  };

  it('accepts only the code alphabet', () => {
    expect(() => getOrCreateRoom('AB1D')).toThrow(RoomError);
    expect(() => getOrCreateRoom('ABIO')).toThrow(RoomError);
  });

  it('divers and names are unique, joining closes when the round starts, the briefing leads into building', () => {
    const room = fresh();
    const a = join(room, 'Ana', AVATARS[0]);
    expect(() => join(room, 'Ben', AVATARS[0])).toThrow(/taken/);
    expect(() => join(room, 'ana', AVATARS[1])).toThrow(/name/);
    expect(() => join(room, 'Ben', 'peep-999')).toThrow(/Pick a diver/);
    const b = join(room, 'Ben', AVATARS[1]);
    pick(room, b, AVATARS[2]);
    expect(() => start(room, b, 1000)).toThrow(/Only the host/);
    start(room, a, 1000);
    expect(room.phase).toBe('briefing');
    expect(() => join(room, 'Cy', AVATARS[3])).toThrow(/under way/);
    expect(() => lock(room, a, flatTile(), okEvaluator(1, null), 2000)).toThrow(/over/);
    const briefEnd = 1000 + BRIEFING_SECONDS * 1000;
    expect(tick(room, briefEnd - 1)).toBe(false);
    expect(tick(room, briefEnd)).toBe(true);
    expect(room.phase).toBe('building');
    expect(room.endsAt).toBe(briefEnd + BUILD_SECONDS * 1000);
  });

  it('only ready reefs can be picked, by the host, in the lobby', () => {
    const room = fresh();
    const a = join(room, 'Ana', AVATARS[0]);
    const b = join(room, 'Ben', AVATARS[1]);
    expect(() => setReef(room, b, 'kaneohe')).toThrow(/host/);
    expect(() => setReef(room, a, 'atlantis')).toThrow(/not on the map/);
    expect(() => setReef(room, a, 'maldives')).toThrow(/coming next/);
    setReef(room, a, 'kaneohe');
    expect(room.reef).toBe('kaneohe');
  });

  it('ranks by settlement then material; a missing design ranks last; the host hands off', () => {
    const room = fresh();
    const a = join(room, 'Ana', AVATARS[0]);
    const b = join(room, 'Ben', AVATARS[1]);
    const c = join(room, 'Cy', AVATARS[2]);
    start(room, a, 0);
    start(room, a, 0); // the host skips the briefing
    lock(room, a, flatTile(), okEvaluator(300, 0.1), 10);
    lock(room, b, flatTile(), okEvaluator(100, 0.1), 20);
    expect(room.phase).toBe('building');
    // Cy never locks: the clock (plus grace) ends the round.
    expect(tick(room, BUILD_SECONDS * 1000 + LOCK_GRACE_MS)).toBe(true);
    expect(room.results!.map((r) => [r.name, r.rank, r.submitted])).toEqual([['Ben', 1, true], ['Ana', 2, true], ['Cy', 3, false]]);
    presence(room, a, false);
    expect(room.hostSeat).toBe(b.seat);
    expect(() => again(room, c)).toThrow(/host/);
    again(room, b);
    expect(room.phase).toBe('lobby');
  });
});

describe('rooms over WebSockets, experiments over HTTP', () => {
  const store = new MemoryStore();
  const app = buildServer({ store });
  let base = '';

  beforeAll(async () => {
    await app.listen({ port: 0, host: '127.0.0.1' });
    base = `127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  });
  afterAll(() => app.close());

  /** A client that keeps every message, and waits for one that matches. */
  function client(code: string) {
    const ws = new WebSocket(`ws://${base}/ws/rooms/${code}`);
    const seen: ServerMsg[] = [];
    const waiters: { test: (m: ServerMsg) => boolean; done: (m: ServerMsg) => void }[] = [];
    ws.on('message', (raw) => {
      const msg = JSON.parse(String(raw)) as ServerMsg;
      seen.push(msg);
      for (const w of [...waiters]) if (w.test(msg)) waiters.splice(waiters.indexOf(w), 1), w.done(msg);
    });
    const next = (test: (m: ServerMsg) => boolean) =>
      new Promise<ServerMsg>((done) => {
        const hit = seen.find(test);
        if (hit) return done(hit);
        waiters.push({ test, done });
      });
    const state = (test: (s: RoomState) => boolean) =>
      next((m) => m.t === 'state' && test(m.state)).then((m) => (m as { state: RoomState }).state);
    const send = (msg: object) => ws.send(JSON.stringify(msg));
    return { ws, next, state, send, open: new Promise((r) => ws.once('open', r)) };
  }

  it('two players play a full round on Kāneʻohe Bay and both experiments are stored', async () => {
    rooms.delete('WXYZ');
    const host = client('WXYZ');
    const guest = client('WXYZ');
    await Promise.all([host.open, guest.open]);
    host.send({ t: 'join', name: 'Ana', avatar: AVATARS[0], create: true });
    await host.next((m) => m.t === 'joined');
    guest.send({ t: 'join', name: 'Ben', avatar: AVATARS[1] });
    await guest.next((m) => m.t === 'joined');
    host.send({ t: 'start' });
    await host.state((s) => s.phase === 'briefing');
    host.send({ t: 'start' });
    const building = await guest.state((s) => s.phase === 'building');
    expect(building.reef).toBe('kaneohe');

    host.send({ t: 'lock', design: ridgedTile() });
    guest.send({ t: 'lock', design: { grid: { nx: 1, ny: 1, nz: 1 }, solid: [] } });
    await guest.next((m) => m.t === 'error' && /not valid/.test(m.message));
    guest.send({ t: 'lock', design: flatTile() });
    const results = await host.state((s) => s.phase === 'results');
    // No engine yet: both rates are null, so less material ranks first (flat, 0 voxels).
    expect(results.results!.map((r) => [r.name, r.result?.settlementRate, r.result?.material])).toEqual([
      ['Ben', null, 0],
      ['Ana', null, ridgedTile().solid.length],
    ]);
    const stored = await store.recent('kaneohe', 10);
    expect(stored.filter((e) => e.roomCode === 'WXYZ')).toHaveLength(2);
    expect(new Set(stored.map((e) => e.result.seed)).size).toBe(1);
    host.ws.close();
    guest.ws.close();
  });

  it('solo experiments are validated, stored and exportable', async () => {
    const bad = await app.inject({ method: 'POST', url: '/api/experiments', payload: { reef: 'maldives', design: flatTile(), seed: 1, playerId: 'tester-1' } });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().problems).toContain('that reef is coming next');
    const ok = await app.inject({ method: 'POST', url: '/api/experiments', payload: { reef: 'kaneohe', design: ridgedTile(), seed: 7, playerId: 'tester-1', playerName: 'Ana' } });
    expect(ok.statusCode).toBe(201);
    const { id } = ok.json() as { id: string };
    const record = (await app.inject({ url: `/api/experiments/${id}` })).json();
    expect(record).toMatchObject({ reef: 'kaneohe', playerName: 'Ana', result: { seed: 7, model: 'pending' }, flow: { kind: 'oscillating', provenance: 'published' } });
    expect(record.design.solid).toHaveLength(ridgedTile().solid.length);
  });
});
