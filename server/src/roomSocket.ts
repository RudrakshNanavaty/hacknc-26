// /ws/rooms/:code: the room protocol (shared/src/room.ts) over raw `ws`, on Fastify's server.
// After every change it drains the room's effects: save the match record (Tiger Data or memory)
// and ask the narrator for a broadcast line, which replaces the template line only if it is still
// the current moment when it arrives.
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer, type WebSocket } from 'ws';
import { type CivicStory, EVENT_RULES, TOTAL_ROUNDS, authoredScenario, combosInReach, crisisFor, dealtHand, narrationFacts, type ClientMsg, type LiveConditions, type RoomState, type ServerMsg } from '@shared';
import type { MatchStore } from './db/store';
import type { Narrator } from './ai/narrator';
import type { ScenarioWriter } from './ai/scenario';
import type { CivicRecord } from './solana/civic';
import { type EventLog, noEvents } from './db/events';
import type { ArtService } from './cardArt';
import { directorFacts, type Director } from './ai/director';
import {
  RoomError, accept, again, applyDialogue, applyHints, applyScenario, choosePersona, done, findPlayer, getOrCreateRoom, getRoom, join, mapRoles, move,
  ping, presence, proposeEarlyEvent, proposeEvent, publicState, respond, select, setBot, setSession, skip, start, sweep, tick, type Room,
} from './rooms';

const ROOM_PATH = /^\/ws\/rooms\/([A-Za-z]{4})$/;

/** What a message adds to the timeline: the choice itself, nothing typed by a person. */
function messagePayload(msg: ClientMsg): unknown {
  switch (msg.t) {
    case 'select': return { card: msg.card, district: msg.district };
    case 'move': return { move: msg.move, proposalId: msg.proposalId };
    case 'accept': return { compromiseId: msg.compromiseId };
    case 'respond': return { choice: msg.choice };
    case 'bot': return { persona: msg.persona, on: msg.on };
    case 'persona': return { persona: msg.persona };
    case 'session': return { kind: msg.kind };
    default: return undefined;
  }
}

interface Conn {
  ws: WebSocket;
  code: string;
  playerId: string | null; // null: a page that has not joined yet
}

export interface RoomServerOptions {
  store: MatchStore;
  narrator: Narrator | null;
  /** Writes each match's scenario; the authored one stands in when it fails. */
  scenario: { live: () => Promise<LiveConditions | null>; write: ScenarioWriter; pick?: () => Promise<CivicStory[]> };
  /** The Gemini Game Director (null: templates only). */
  director?: Director | null;
  /** The civic record on Solana: every finished match is fingerprinted and anchored (null: off). */
  civic?: CivicRecord | null;
  /** The gameplay timeline (every message, phase and headline); off by default. */
  events?: EventLog;
  /** Starts painting the match's card pictures as soon as its hands are known. */
  art?: ArtService | null;
  log: { warn: (obj: unknown, msg: string) => void; info?: (msg: string) => void };
}

export function roomServer({ store, narrator, scenario, director = null, civic = null, events = noEvents, art = null, log }: RoomServerOptions) {
  const wss = new WebSocketServer({ noServer: true });
  const conns = new Map<string, Set<Conn>>();

  const send = (ws: WebSocket, msg: ServerMsg) => ws.readyState === ws.OPEN && ws.send(JSON.stringify(msg));
  /** One row on the gameplay timeline. Never throws. */
  const emit = (room: Room, kind: string, player: { seat: number; persona: string; bot: boolean } | null, payload?: unknown, at = Date.now()) => {
    try {
      events.record({
        at: new Date(at).toISOString(), roomCode: room.code, matchId: room.matchId, round: room.round || null, phase: room.phase, kind,
        seat: player?.seat ?? null, persona: player?.persona ?? null, bot: player?.bot ?? null, payload,
      });
    } catch {}
  };
  /** What a table sees change: the phase, and the line the news desk is saying. */
  const seen = new Map<string, { phase: string; round: number; headline: string | null }>();
  function observe(room: Room) {
    const was = seen.get(room.code);
    const key = room.headline ? `${room.headline.key}:${room.headline.source}` : null;
    if (!was || was.phase !== room.phase || was.round !== room.round) emit(room, 'phase', null, { phase: room.phase, round: room.round });
    if (key && was?.headline !== key) emit(room, 'headline', null, { text: room.headline!.text, source: room.headline!.source, key: room.headline!.key });
    seen.set(room.code, { phase: room.phase, round: room.round, headline: key });
  }
  const broadcast = (room: Room) => {
    observe(room);
    drain(room);
    const now = Date.now();
    for (const c of conns.get(room.code) ?? []) {
      const viewer = c.playerId ? room.players.find((p) => p.id === c.playerId) ?? null : null;
      const state: RoomState = publicState(room, viewer, now);
      send(c.ws, { t: 'state', state });
    }
  };

  function narrate(room: Room, key: string, facts: unknown) {
    if (!narrator) return;
    narrator.line(facts).then(
      (text) => {
        if (room.headline?.key !== key) return; // the moment has passed
        room.headline = { text, source: 'gemini', key };
        broadcast(room);
      },
      (err) => log.warn({ err: (err as Error).message, room: room.code }, 'narrator: template line kept'),
    );
  }

  /**
   * Every round's crisis (and so every card each player will be dealt, under its story name, in its
   * place) is known the moment the scenario is written: paint round 1 first, then 2 and 3, behind the
   * crisis the players are reading. Bots never show a card, so only people's hands are painted.
   */
  function prefetchArt(room: Room) {
    if (!art || !room.scenario) return;
    const people = room.players.filter((p) => !p.bot);
    art.prefetch(
      room.scenario.crises.flatMap((crisis, i) =>
        people.flatMap((p) =>
          dealtHand(p.persona, i + 1, crisis).map((id) => ({ id, skin: crisis.skins?.[id]?.name, place: crisis.spotlight[0], story: crisis.story?.title })),
        ),
      ),
    );
  }

  /**
   * In the lobby: choose this match's stories now (and keep them for Start) and paint round 1 for the
   * personas people have taken, so by the time the host presses Start the first hand is usually done.
   * Only round 1 and only seated humans, so an abandoned lobby costs a handful of pictures.
   */
  const prepared = new WeakMap<Room, CivicStory[]>();
  const preparing = new WeakMap<Room, Promise<CivicStory[]>>();
  async function warmLobby(room: Room) {
    if (!art || !scenario.pick || room.phase !== 'lobby') return;
    let stories = prepared.get(room);
    if (!stories) {
      let pending = preparing.get(room);
      if (!pending) {
        pending = scenario.pick().catch(() => []);
        preparing.set(room, pending);
      }
      stories = await pending;
      preparing.delete(room);
      if (stories.length < 3) return;
      if (!prepared.has(room)) prepared.set(room, stories);
      stories = prepared.get(room)!;
    }
    if (room.phase !== 'lobby') return;
    const first = stories[0]!;
    art.prefetch(
      room.players.filter((p) => !p.bot).flatMap((p) => (first.cast?.hands[p.persona] ?? []).map((id) => ({ id, skin: first.cast!.skins[id]?.name, place: first.cast!.district, story: first.title }))),
    );
  }

  /** The same items as prefetchArt, from the chosen stories alone (their cast carries each hand, skin and area). */
  function prefetchStories(room: Room, stories: CivicStory[]) {
    if (!art) return;
    const people = room.players.filter((p) => !p.bot);
    art.prefetch(
      stories.slice(0, 3).flatMap((s) =>
        people.flatMap((p) =>
          (s.cast?.hands[p.persona] ?? []).map((id) => ({ id, skin: s.cast!.skins[id]?.name, place: s.cast!.district, story: s.title })),
        ),
      ),
    );
  }

  function writeScenario(room: Room) {
    const matchId = room.matchId;
    void (async () => {
      // The stories decide every hand, name and place, so painting can start the moment they are
      // chosen: before the live readings are fetched and before the headlines are written.
      const picked = prepared.get(room) ?? (await scenario.pick?.().catch(() => [])) ?? [];
      prepared.delete(room);
      if (picked.length >= 3) prefetchStories(room, picked);
      const live = await scenario.live().catch(() => null);
      const written = await scenario.write(live, picked).catch((err) => {
        log.warn({ err: (err as Error).message, room: room.code }, 'scenario desk: authored scenario stands in');
        return authoredScenario(live);
      });
      if (room.matchId !== matchId) return; // a new match started meanwhile
      applyScenario(room, written, Date.now());
      prefetchArt(room);
      broadcast(room);
    })();
  }

  /** Ask the Director for something; apply it only through the room's validators; a failure keeps the template. */
  function direct(room: Room, what: string, ask: () => Promise<unknown>, apply: (raw: unknown) => unknown) {
    ask().then(
      (raw) => {
        if (apply(raw)) broadcast(room);
        else drain(room); // nothing to show, but a logged verdict may need saving
      },
      (err) => log.warn({ err: (err as Error).message, room: room.code, what }, 'director: template kept'),
    );
  }

  function directMoment(room: Room, key: string) {
    if (!director) return;
    const facts = directorFacts(publicState(room, null, Date.now()));
    direct(room, `dialogue ${key}`, () => director.dialogue(facts, mapRoles(room), key), (raw) => applyDialogue(room, key, Array.isArray(raw) ? raw : [], facts, Date.now()));
  }

  function drain(room: Room) {
    const effects = room.effects.splice(0);
    let save = false;
    for (const e of effects) {
      if (e.t === 'crisis' || e.t === 'reveal' || e.t === 'resolved' || e.t === 'final') directMoment(room, e.key);
      // Prefetch the next round's twist while everyone reads the resolution.
      if (e.t === 'resolved' && director && e.round < TOTAL_ROUNDS && (EVENT_RULES.rounds as readonly number[]).includes(e.round + 1)) {
        // The match's own next crisis (the scenario desk wrote it), else the authored one.
        const next = room.scenario?.crises[e.round] ?? crisisFor(e.round + 1);
        const facts = { ...directorFacts(publicState(room, null, Date.now())), round: e.round + 1, crisis: { title: next.title, text: next.text, spotlight: next.spotlight } };
        const fired = [...room.firedEvents];
        direct(room, `event early ${e.round + 1}`, () => director.event(facts, e.round + 1, fired), (raw) => {
          proposeEarlyEvent(room, e.round + 1, raw);
          return false; // nothing to show until the crisis starts
        });
      }
      // No prefetched proposal reached this crisis: ask now (it still lands if it arrives before play starts).
      if (e.t === 'crisis' && director && room.event?.source === 'template') {
        const facts = directorFacts(publicState(room, null, Date.now()));
        const fired = [...room.firedEvents];
        direct(room, `event ${e.key}`, () => director.event(facts, e.round, fired), (raw) => proposeEvent(room, e.key, raw, Date.now()));
      }
      if (e.t === 'negotiate' && director && room.hints && room.board) {
        const facts = directorFacts(publicState(room, null, Date.now()));
        const hints = room.hints.list;
        const reach = combosInReach(room.board);
        if (hints.length) direct(room, `hints ${e.key}`, () => director.hints(facts, hints, reach), (raw) => applyHints(room, e.key, raw as { suggestions?: unknown[]; combos?: unknown[] }, facts, Date.now()));
      }
      if (e.t === 'record') save = true;
      else if (e.t === 'scenario') writeScenario(room);
      else if (e.t === 'reveal' && room.board) narrate(room, e.key, narrationFacts('reveal', room.board));
      else if (e.t === 'resolved') {
        const h = room.history.find((x) => x.round === e.round);
        if (h) narrate(room, e.key, narrationFacts('resolution', h.board, h.resolution));
      } else if (e.t === 'final' && room.final) {
        narrate(room, e.key, {
          city: 'Miami Beach, Florida', event: 'end of the planning session', cityStillViable: room.final.viable,
          winners: room.final.winners, finalScores: Object.fromEntries(room.final.scores.map((s) => [s.persona, s.total])),
          approvedProjects: room.history.flatMap((h) => h.resolution.outcomes.filter((o) => o.status === 'approved').map((o) => `${o.kind} in ${o.district}`)),
        });
      }
    }
    if (save && room.record) {
      const snapshot = structuredClone(room.record);
      store.save(snapshot).catch((err) => log.warn({ err, room: room.code }, 'match record not saved'));
      // A finished match goes on the public record once (later preference answers do not change its fingerprint).
      if (snapshot.final && civic) civic.recordMatch(snapshot).catch((err) => log.warn({ err, room: room.code }, 'civic record failed'));
    }
  }

  const timer = setInterval(() => {
    const now = Date.now();
    for (const code of conns.keys()) {
      try {
        const room = getRoom(code);
        if (tick(room, now)) broadcast(room);
      } catch {}
    }
    sweep(now);
  }, 250);
  timer.unref();

  function handle(conn: Conn, msg: ClientMsg) {
    const now = Date.now();
    const room = msg.t === 'join' && msg.create ? getOrCreateRoom(conn.code, now) : getRoom(conn.code);
    if (msg.t === 'look') return send(conn.ws, { t: 'state', state: publicState(room, null, now) });
    if (msg.t === 'join') {
      const player = join(room, msg.name, msg.persona);
      conn.playerId = player.id;
      emit(room, 'join', player, { persona: msg.persona, create: !!msg.create }, now);
      void warmLobby(room);
      send(conn.ws, { t: 'joined', playerId: player.id, seat: player.seat });
      return broadcast(room);
    }
    if (msg.t === 'resume') {
      const player = findPlayer(room, msg.playerId);
      // Newest tab wins: an older socket for the same player stops counting.
      for (const c of conns.get(room.code) ?? []) if (c !== conn && c.playerId === player.id) c.playerId = null;
      conn.playerId = player.id;
      presence(room, player, true, now);
      emit(room, 'resume', player, undefined, now);
      send(conn.ws, { t: 'joined', playerId: player.id, seat: player.seat });
      return broadcast(room);
    }
    const player = findPlayer(room, conn.playerId);
    switch (msg.t) {
      case 'persona': choosePersona(room, player, msg.persona); break;
      case 'bot': setBot(room, player, msg.persona, !!msg.on); break;
      case 'session': setSession(room, player, msg.kind); break;
      case 'start': start(room, player, now); break;
      case 'skip': skip(room, player, now); break;
      case 'select': select(room, player, msg.card, msg.district, now); break;
      case 'move': move(room, player, msg.move, msg.proposalId, now); break;
      case 'accept': accept(room, player, msg.compromiseId, now); break;
      case 'done': done(room, player, now); break;
      case 'respond': respond(room, player, msg.choice, now); break;
      case 'again': again(room, player); break;
      case 'ping': {
        // Relayed to the room as it happens; no state changes, so no state broadcast.
        const p = ping(room, player, msg.district, msg.emote, now);
        if (p) for (const c of conns.get(room.code) ?? []) send(c.ws, { t: 'ping', ping: p });
        return;
      }
      default: throw new RoomError('Unknown message.');
    }
    emit(room, msg.t, player, messagePayload(msg), now);
    if (msg.t === 'persona' || msg.t === 'bot') void warmLobby(room);
    broadcast(room);
  }

  function onUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer) {
    const match = ROOM_PATH.exec(new URL(req.url ?? '/', 'http://localhost').pathname);
    if (!match) return socket.destroy();
    wss.handleUpgrade(req, socket, head, (ws) => {
      const conn: Conn = { ws, code: match[1]!.toUpperCase(), playerId: null };
      if (!conns.has(conn.code)) conns.set(conn.code, new Set());
      conns.get(conn.code)!.add(conn);
      ws.on('message', (raw) => {
        let msg: ClientMsg;
        try {
          msg = JSON.parse(String(raw)) as ClientMsg;
          if (typeof msg?.t !== 'string') throw new Error();
        } catch {
          return send(ws, { t: 'error', message: 'Bad message.' });
        }
        try {
          handle(conn, msg);
        } catch (err) {
          if (!(err instanceof RoomError)) log.warn({ err }, 'room message failed');
          send(ws, { t: 'error', message: err instanceof RoomError ? err.message : 'Something went wrong.' });
        }
      });
      ws.on('close', () => {
        conns.get(conn.code)?.delete(conn);
        if (!conns.get(conn.code)?.size) conns.delete(conn.code);
        const room = (() => {
          try {
            return getRoom(conn.code);
          } catch {
            return null;
          }
        })();
        const player = room && conn.playerId ? room.players.find((p) => p.id === conn.playerId) : null;
        const stillHere = player && [...(conns.get(conn.code) ?? [])].some((c) => c.playerId === player.id);
        if (room && player && !stillHere) {
          presence(room, player, false);
          emit(room, 'leave', player);
          broadcast(room);
        }
      });
    });
  }

  async function close() {
    clearInterval(timer);
    for (const c of wss.clients) c.terminate();
    await new Promise<void>((resolve) => wss.close(() => resolve()));
  }

  return { onUpgrade, close };
}
