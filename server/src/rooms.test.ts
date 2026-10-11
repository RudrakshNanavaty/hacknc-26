import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import WebSocket from 'ws';
import { SPRINT_MS, SPRINT_STORM_MS, authoredScenario, type PersonaId, type RoomState, type ServerMsg } from '@shared';
import { buildServer } from './app';
import { MemoryStore } from './db/store';
import {
  PING_GAP_MS, RECONNECT_GRACE_MS, RoomError, accept, again, applyScenario, choosePersona, done, getOrCreateRoom, join, move, ping, presence, publicState, respond, rooms, select, setBot, setPace, skip, start, tick,
} from './rooms';

const fresh = (code = 'ABCD') => {
  rooms.delete(code);
  return getOrCreateRoom(code, 0);
};

describe('room state machine', () => {
  it('accepts only the code alphabet', () => {
    expect(() => getOrCreateRoom('AB1D')).toThrow(RoomError);
    expect(() => getOrCreateRoom('ABIO')).toThrow(RoomError);
  });

  it('personas and names are unique; joining closes when the match starts', () => {
    const room = fresh();
    const a = join(room, 'Ana', 'mayor');
    expect(() => join(room, 'Ben', 'mayor')).toThrow(/taken/);
    expect(() => join(room, 'ana', 'activist')).toThrow(/name/);
    expect(() => join(room, 'Ben', 'pirate')).toThrow(/stakeholder/);
    const b = join(room, 'Ben', 'activist');
    expect(() => choosePersona(room, b, 'mayor')).toThrow(/taken/);
    choosePersona(room, b, 'resort');
    expect(() => start(room, b, 1000)).toThrow(/Only the host/);
    start(room, a, 1000);
    applyScenario(room, authoredScenario(null), 1000);
    expect(room.phase).toBe('crisis');
    expect(() => join(room, 'Cy', 'resident')).toThrow(/under way/);
  });

  it('a person takes a bot\'s seat; the room holds four stakeholders', () => {
    const room = fresh();
    const a = join(room, 'Ana', 'mayor');
    setBot(room, a, 'activist', true);
    setBot(room, a, 'resort', true);
    setBot(room, a, 'resident', true);
    expect(room.players.map((p) => p.persona)).toEqual(['mayor', 'activist', 'resort', 'resident']);
    join(room, 'Ben', 'resort');
    expect(room.players.filter((p) => !p.bot).map((p) => p.name)).toEqual(['Ana', 'Ben']);
    expect(room.players).toHaveLength(4);
    expect(new Set(room.players.map((p) => p.seat)).size).toBe(4);
  });

  it('enforces influence and geography on the server, and one card per round', () => {
    const room = fresh();
    const a = join(room, 'Ana', 'resort');
    const b = join(room, 'Ben', 'mayor');
    start(room, a, 0);
    applyScenario(room, authoredScenario(null), 0);
    skip(room, a, 1);
    expect(room.phase).toBe('select');
    expect(() => select(room, a, 'hotel-development', 'north-beach-oceanside', 2)).toThrow(/zoned for hotel/);
    expect(() => select(room, a, 'drainage-upgrade', 'west-avenue', 2)).toThrow(/not in your hand/);
    a.influence = 3;
    expect(() => select(room, a, 'hotel-development', 'collins-mid-beach', 2)).toThrow(/costs 4/);
    a.influence = 5;
    select(room, a, 'hotel-development', 'collins-mid-beach', 2);
    expect(() => select(room, a, 'tourism-campaign', 'collins-mid-beach', 3)).toThrow(/already locked/);
    // Cards stay hidden until everyone is in.
    expect(publicState(room, b, 3).board).toBeNull();
    expect(publicState(room, b, 3).mine!.selection).toBeNull();
    select(room, b, 'emergency-funding', 'collins-mid-beach', 4);
    expect(room.phase).toBe('reveal');
    expect(a.influence).toBe(1);
    expect(room.board!.proposals).toHaveLength(1);
  });

  it('a round resolves once, however often time ticks or the host skips', () => {
    const room = fresh();
    const a = join(room, 'Ana', 'mayor');
    start(room, a, 0);
    applyScenario(room, authoredScenario(null), 0);
    skip(room, a, 1); // select
    select(room, a, 'drainage-upgrade', 'west-avenue', 2); // everyone in: reveal
    skip(room, a, 3); // negotiate
    expect(room.phase).toBe('negotiate');
    done(room, a, 4); // everyone done: resolve
    expect(room.phase).toBe('resolve');
    expect(room.history).toHaveLength(1);
    // There is no clock: however long it ticks, the round waits for the player.
    expect(room.endsAt).toBeNull();
    expect(tick(room, 6)).toBe(false);
    expect(tick(room, 6 + 3_600_000)).toBe(false);
    expect(room.phase).toBe('resolve');
    expect(room.history).toHaveLength(1);
    done(room, a, 7);
    expect(room.round).toBe(2);
    expect(room.phase).toBe('crisis');
    expect(room.history).toHaveLength(1);
  });

  it('turn-based: crisis, reveal and results wait for every present player, bots always ready', () => {
    const room = fresh();
    const a = join(room, 'Ana', 'mayor');
    const b = join(room, 'Ben', 'activist');
    setBot(room, a, 'resort', true);
    start(room, a, 0);
    applyScenario(room, authoredScenario(null), 0);
    expect(room.phase).toBe('crisis');
    const ready = () => publicState(room, a, 1).players.map((p) => p.ready);
    expect(ready()).toEqual([false, false, true]);
    done(room, a, 1);
    expect(room.phase).toBe('crisis');
    expect(tick(room, 3_600_000)).toBe(false);
    done(room, b, 2);
    expect(room.phase).toBe('select');
    // A player who dropped for good stops holding the table.
    presence(room, b, false, 3);
    select(room, a, 'drainage-upgrade', 'west-avenue', 3);
    expect(room.phase).toBe('select');
    expect(tick(room, 3 + RECONNECT_GRACE_MS)).toBe(true);
    expect(room.phase).toBe('reveal');
    done(room, a, 3 + RECONNECT_GRACE_MS + 1);
    expect(room.phase).toBe('negotiate');
  });

  it('sprint: every step has a deadline, a full match fits in under four minutes, ready still moves on early', () => {
    const room = fresh();
    const a = join(room, 'Ana', 'mayor');
    const b = join(room, 'Ben', 'activist');
    expect(() => setPace(room, b, 'sprint')).toThrow(/Only the host/);
    expect(() => setPace(room, a, 'warp')).toThrow(/pace/);
    setPace(room, a, 'sprint');
    start(room, a, 0);
    expect(() => setPace(room, a, 'turns')).toThrow(/before the match/);
    expect(room.record!.pace).toBe('sprint');
    applyScenario(room, authoredScenario(null), 0);
    expect(publicState(room, a, 0).pace).toBe('sprint');
    expect(room.endsAt).toBe(SPRINT_MS.crisis);
    expect(tick(room, SPRINT_MS.crisis - 1)).toBe(false);
    expect(tick(room, SPRINT_MS.crisis)).toBe(true);
    expect(room.phase).toBe('select');
    // Ana plays; Ben never does: the deadline reveals without him.
    let now = SPRINT_MS.crisis;
    select(room, a, 'drainage-upgrade', 'west-avenue', now + 1);
    expect(room.phase).toBe('select');
    now = room.endsAt!;
    expect(tick(room, now)).toBe(true);
    expect(room.phase).toBe('reveal');
    expect(room.board!.proposals).toHaveLength(1);
    // Everyone ready ends a sprint step early.
    done(room, a, now + 1);
    done(room, b, now + 2);
    expect(room.phase).toBe('negotiate');
    // Play the rest of the match on deadlines alone.
    let t = now + 2;
    while (room.phase !== 'final') {
      expect(room.endsAt).not.toBeNull();
      t = room.endsAt!;
      tick(room, t);
    }
    expect(room.history).toHaveLength(3);
    expect(t).toBeLessThan(4 * 60_000);
    // The last result has extra time for the storm.
    expect(SPRINT_MS.crisis + SPRINT_MS.select + SPRINT_MS.reveal + SPRINT_MS.negotiate + SPRINT_MS.resolve).toBe(60_000);
    expect(SPRINT_STORM_MS).toBeGreaterThan(0);
  });

  it('turn-based is the default and never times out', () => {
    const room = fresh();
    const a = join(room, 'Ana', 'mayor');
    expect(publicState(room, a, 0).pace).toBe('turns');
    start(room, a, 0);
    applyScenario(room, authoredScenario(null), 0);
    expect(room.endsAt).toBeNull();
    expect(tick(room, 3_600_000)).toBe(false);
    expect(room.phase).toBe('crisis');
  });

  it('negotiation: one move, influence charged, owner-only compromises, carried into the outcome', () => {
    const room = fresh();
    const resort = join(room, 'Ana', 'resort');
    const resident = join(room, 'Ben', 'resident');
    const mayor = join(room, 'Cy', 'mayor');
    start(room, resort, 0);
    applyScenario(room, authoredScenario(null), 0);
    // The hotel boom (round 2) deals the Public Access Guarantee and Fast-Track.
    for (let t = 1; room.round < 2 || room.phase !== 'select'; t++) skip(room, resort, t);
    select(room, resort, 'hotel-development', 'collins-mid-beach', 20);
    select(room, resident, 'public-access-guarantee', 'collins-mid-beach', 20);
    select(room, mayor, 'fast-track', 'collins-mid-beach', 20);
    skip(room, resort, 21);
    const hotel = room.board!.proposals[0]!;
    const deal = room.board!.compromises[0]!;
    expect(() => accept(room, resident, deal.id, 22)).toThrow(/owner/);
    accept(room, resort, deal.id, 22);
    move(room, resident, 'back', hotel.id, 23);
    expect(resident.influence).toBe(7 - 1 - 1);
    expect(() => move(room, resident, 'back', hotel.id, 23)).toThrow(/already/);
    expect(() => move(room, mayor, 'oppose', 'nope', 23)).toThrow(/not on the table/);
    done(room, resort, 24);
    done(room, resident, 24);
    done(room, mayor, 24);
    const out = room.history[1]!.resolution.outcomes[0]!;
    expect(out.status).toBe('approved');
    expect(out.conditions).toEqual(['Public beach access corridor']);
    expect(room.city.districts['collins-mid-beach']!.features.map((f) => f.kind)).toContain('access-corridor');
  });

  it('pings: negotiation only, real areas and known reactions, rate limited, never stored', () => {
    const room = fresh();
    const a = join(room, 'Ana', 'mayor');
    start(room, a, 0);
    applyScenario(room, authoredScenario(null), 0);
    skip(room, a, 1); // select
    expect(() => ping(room, a, 'west-avenue', '👍', 2)).toThrow(/negotiating table/);
    select(room, a, 'drainage-upgrade', 'west-avenue', 2);
    skip(room, a, 3); // negotiate
    const before = JSON.stringify(publicState(room, a, 4));
    expect(() => ping(room, a, 'atlantis', '👍', 4)).toThrow(/area/);
    expect(() => ping(room, a, 'west-avenue', '💣', 4)).toThrow(/reaction/);
    expect(ping(room, a, 'west-avenue', '👍', 4)).toEqual({ seat: a.seat, district: 'west-avenue', emote: '👍', at: 4 });
    expect(ping(room, a, 'west-avenue', '🤝', 4 + PING_GAP_MS - 1)).toBeNull();
    expect(ping(room, a, 'south-pointe', '❓', 4 + PING_GAP_MS)).not.toBeNull();
    // Relayed, not stored: the room's state and record are unchanged.
    expect(JSON.stringify(publicState(room, a, 4))).toBe(before);
    expect(JSON.stringify(room.record)).not.toContain('❓');
  });

  it('a phase never waits on someone who left', () => {
    const room = fresh();
    const a = join(room, 'Ana', 'mayor');
    const b = join(room, 'Ben', 'activist');
    start(room, a, 0);
    applyScenario(room, authoredScenario(null), 0);
    skip(room, a, 1);
    select(room, a, 'drainage-upgrade', 'west-avenue', 2);
    expect(room.phase).toBe('select');
    presence(room, b, false, 3);
    // A reloading tab gets a moment to come back...
    expect(room.phase).toBe('select');
    expect(tick(room, 3 + RECONNECT_GRACE_MS - 1)).toBe(false);
    // ...then the round goes on without them.
    expect(tick(room, 3 + RECONNECT_GRACE_MS)).toBe(true);
    expect(room.phase).toBe('reveal');
  });

  it('plays three rounds to the end and takes personal preferences', () => {
    const room = fresh();
    const a = join(room, 'Ana', 'mayor');
    for (const p of ['activist', 'resort', 'resident'] as PersonaId[]) setBot(room, a, p, true);
    start(room, a, 0);
    applyScenario(room, authoredScenario(null), 0);
    let now = 0;
    while (room.phase !== 'final') {
      now += 1;
      if (room.phase === 'select' && !a.selection) select(room, a, room.round === 1 ? 'drainage-upgrade' : 'emergency-funding', 'west-avenue', now);
      else if (room.phase === 'negotiate') done(room, a, now);
      else skip(room, a, now);
    }
    expect(room.history).toHaveLength(3);
    expect(room.final!.scores).toHaveLength(4);
    expect(room.record!.rounds).toHaveLength(3);
    expect(room.record!.players.filter((p) => p.participant === 'bot')).toHaveLength(3);
    expect(() => respond(room, a, 'r9-nope', now)).toThrow(/proposals/);
    const pick = room.history[0]!.board.proposals[0]!.id;
    respond(room, a, pick, now);
    respond(room, a, pick, now); // changing your answer replaces it
    expect(room.record!.responses).toHaveLength(1);
    expect(room.record!.responses[0]).toMatchObject({ participant: 'human', persona: 'mayor', choice: pick });
    again(room, a);
    expect(room.phase).toBe('lobby');
  });
});

describe('four browsers over WebSockets', () => {
  const store = new MemoryStore();
  // A narrator, a Game Director and a scenario desk that always fail (and never touch the network):
  // the match must not notice.
  const down = () => Promise.reject(new Error('Gemini is down'));
  const app = buildServer({
    store,
    narrator: { line: down },
    director: { dialogue: down, event: down, hints: down, explain: down },
    // No network in tests: no live readings, and the scenario desk is down too.
    scenario: { live: async () => null, write: down },
  });
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
    const next = (test: (m: ServerMsg) => boolean, from = 0) =>
      new Promise<ServerMsg>((resolve) => {
        const hit = seen.slice(from).find(test);
        if (hit) return resolve(hit);
        waiters.push({ test, done: resolve });
      });
    const state = (test: (s: RoomState) => boolean) => next((m) => m.t === 'state' && test(m.state)).then((m) => (m as { state: RoomState }).state);
    const latest = () => [...seen].reverse().find((m): m is { t: 'state'; state: RoomState } => m.t === 'state')!.state;
    const send = (msg: object) => ws.send(JSON.stringify(msg));
    return { ws, seen, next, state, latest, send, open: new Promise((r) => ws.once('open', r)) };
  }

  it('four players finish a three-round match; every screen agrees; the record lands in Civic Atlas', async () => {
    rooms.delete('WXYZ');
    const personas: PersonaId[] = ['mayor', 'activist', 'resort', 'resident'];
    const c = personas.map(() => client('WXYZ'));
    await Promise.all(c.map((x) => x.open));
    c[0]!.send({ t: 'join', name: 'Mae', persona: 'mayor', create: true });
    await c[0]!.next((m) => m.t === 'joined');
    for (const [i, p] of personas.entries()) {
      if (i === 0) continue;
      c[i]!.send({ t: 'join', name: `P${i}`, persona: p });
      await c[i]!.next((m) => m.t === 'joined');
    }
    const lobby = await c[3]!.state((s) => s.players.length === 4);
    expect(lobby.players.map((p) => p.persona)).toEqual(personas);
    const [mayor, activist, resort, resident] = c as [typeof c[0], typeof c[0], typeof c[0], typeof c[0]];

    mayor.send({ t: 'start' });
    await resident.state((s) => s.phase === 'crisis' && s.round === 1);
    mayor.send({ t: 'skip' });
    await resident.state((s) => s.phase === 'select');

    // Round 1: a living shoreline on West Avenue with emergency funding; the resort cannot build in North Beach.
    resort.send({ t: 'select', card: 'hotel-development', district: 'north-beach-oceanside' });
    await resort.next((m) => m.t === 'error' && /zoned/.test(m.message));
    mayor.send({ t: 'select', card: 'emergency-funding', district: 'west-avenue' });
    activist.send({ t: 'select', card: 'living-shoreline', district: 'west-avenue' });
    resort.send({ t: 'select', card: 'tourism-campaign', district: 'collins-mid-beach' });

    // The resident's tab reloads mid-selection: same seat, and a second play is refused.
    const playerId = (resident.seen.find((m) => m.t === 'joined') as { playerId: string }).playerId;
    resident.ws.close();
    const again1 = client('WXYZ');
    await again1.open;
    again1.send({ t: 'resume', playerId });
    await again1.next((m) => m.t === 'joined');
    again1.send({ t: 'select', card: 'elevate-buildings', district: 'west-avenue' });
    const reveal = await again1.state((s) => s.phase === 'reveal');
    again1.send({ t: 'select', card: 'elevate-buildings', district: 'west-avenue' });
    await again1.next((m) => m.t === 'error' && /selection phase/.test(m.message));
    expect(reveal.board!.proposals.map((p) => p.kind).sort()).toEqual(['elevate', 'shoreline']);

    mayor.send({ t: 'skip' });
    await again1.state((s) => s.phase === 'negotiate');
    const shoreline = reveal.board!.proposals.find((p) => p.kind === 'shoreline')!;
    again1.send({ t: 'move', move: 'back', proposalId: shoreline.id });
    for (const x of [mayor, activist, resort, again1]) x.send({ t: 'done' });
    const r1 = await again1.state((s) => s.phase === 'resolve' && s.round === 1);
    expect(r1.history[0]!.resolution.outcomes.map((o) => [o.kind, o.status])).toEqual([['shoreline', 'approved'], ['elevate', 'approved']]);

    // Rounds 2 and 3: the clash in South Pointe, then let the clock work.
    mayor.send({ t: 'skip' });
    await again1.state((s) => s.phase === 'crisis' && s.round === 2);
    mayor.send({ t: 'skip' });
    await again1.state((s) => s.phase === 'select' && s.round === 2);
    resort.send({ t: 'select', card: 'hotel-development', district: 'south-pointe' });
    activist.send({ t: 'select', card: 'environmental-challenge', district: 'south-pointe' });
    mayor.send({ t: 'select', card: 'fast-track', district: 'south-pointe' });
    again1.send({ t: 'select', card: 'public-access-guarantee', district: 'south-pointe' });
    const reveal2 = await mayor.state((s) => s.phase === 'reveal' && s.round === 2);
    expect(reveal2.board!.compromises.map((x) => x.kind).sort()).toEqual(['access', 'setback']);
    mayor.send({ t: 'skip' });
    await resort.state((s) => s.phase === 'negotiate' && s.round === 2);
    for (const deal of reveal2.board!.compromises) resort.send({ t: 'accept', compromiseId: deal.id });
    for (const x of [mayor, activist, resort, again1]) x.send({ t: 'done' });
    const r2 = await mayor.state((s) => s.phase === 'resolve' && s.round === 2);
    const hotel = r2.history[1]!.resolution.outcomes[0]!;
    expect(hotel.status).toBe('approved');
    expect(hotel.conditions.sort()).toEqual(['Dune setback and elevated design', 'Public beach access corridor']);

    mayor.send({ t: 'skip' });
    await mayor.state((s) => s.phase === 'crisis' && s.round === 3);
    mayor.send({ t: 'skip' });
    await mayor.state((s) => s.phase === 'select' && s.round === 3);
    mayor.send({ t: 'select', card: 'drainage-upgrade', district: 'south-pointe' });
    for (const x of [activist, resort, again1]) x.send({ t: 'select', card: x === activist ? 'living-shoreline' : x === resort ? 'private-investment' : 'neighborhood-petition', district: 'north-beach-oceanside' });
    await mayor.state((s) => s.phase === 'reveal' && s.round === 3);
    mayor.send({ t: 'skip' });
    for (const x of [mayor, activist, resort, again1]) x.send({ t: 'done' });
    await mayor.state((s) => s.phase === 'resolve' && s.round === 3);
    mayor.send({ t: 'skip' });
    const final = await again1.state((s) => s.phase === 'final');
    expect(final.final!.scores).toHaveLength(4);
    expect(final.headline!.source).toBe('template'); // Gemini was down; the match never noticed
    expect(final.history[1]!.resolution.events.length).toBeGreaterThan(0);
    expect(final.bubbles!.list.every((b) => b.source === 'template')).toBe(true);

    // Every screen shows the same city.
    await Promise.all([mayor, activist, resort].map((x) => x.state((s) => s.phase === 'final')));
    const cities = [mayor, activist, resort, again1].map((x) => JSON.stringify(x.latest().city));
    expect(new Set(cities).size).toBe(1);

    // The personal question, then Civic Atlas.
    again1.send({ t: 'respond', choice: shoreline.id });
    await again1.state((s) => s.mine?.responded === shoreline.id);
    await new Promise((r) => setTimeout(r, 50));
    const studio = (await app.inject({ url: '/api/studio' })).json();
    expect(studio.summary.matches).toBe(1);
    expect(studio.summary.completed).toBe(1);
    expect(studio.summary.responses).toBe(1);
    const sp = studio.summary.districts.find((d: { id: string }) => d.id === 'south-pointe');
    expect(sp.contested).toBeGreaterThan(0);
    expect(studio.summary.compromises.find((x: { kind: string }) => x.kind === 'setback').accepted).toBe(1);
    expect(studio.summary.findings.length).toBeGreaterThan(0);

    const csv = (await app.inject({ url: '/api/studio/export.csv' })).body;
    expect(csv.split('\n')[0]).toContain('lon,lat');
    expect(csv).toMatch(/south-pointe,South Pointe,South Beach,-80\.\d+,25\.\d+/);
    expect(csv).toContain('gis.miamibeachfl.gov');
    const geo = (await app.inject({ url: '/api/studio/export.geojson' })).json();
    expect(geo.features[0].geometry.coordinates[0]).toBeLessThan(-80);
    expect(geo.features[0].properties.zoning_object_ids.length).toBeGreaterThan(0);
    // "Why can't I build here?" answers from the rules and the GIS facts even with the Director down.
    const why = (await app.inject({ method: 'POST', url: '/api/explain', payload: { kind: 'eligibility', card: 'hotel-development', district: 'north-beach-oceanside' } })).json();
    expect(why).toMatchObject({ source: 'template', answer: expect.stringMatching(/needs 25%/) });
    expect((await app.inject({ method: 'POST', url: '/api/explain', payload: { kind: 'outcome', code: 'WXYZ', proposalId: shoreline.id } })).json().answer).toMatch(/approved/);
    const json = (await app.inject({ url: '/api/studio/export.json' })).json();
    expect(json.matches[0].dataSources.map((s: { id: string }) => s.id)).toEqual(['zoning', 'planningDistricts', 'floodZones']);

    for (const x of [mayor, activist, resort, again1]) x.ws.close();
  }, 20_000);
});
