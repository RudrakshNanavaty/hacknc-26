// /ws/rooms/:code: the room protocol (shared/src/room.ts) over raw `ws`, on Fastify's server.
// After every change it drains the room's effects: save the match record (Tiger Data or memory)
// and ask the narrator for a broadcast line, which replaces the template line only if it is still
// the current moment when it arrives.
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer, type WebSocket } from 'ws';
import { EVENT_RULES, TOTAL_ROUNDS, combosInReach, crisisFor, narrationFacts, type ClientMsg, type RoomState, type ServerMsg } from '@shared';
import type { MatchStore } from './db/store';
import type { Narrator } from './ai/narrator';
import { directorFacts, type Director } from './ai/director';
import {
  RoomError, accept, again, applyDialogue, applyHints, choosePersona, done, findPlayer, getOrCreateRoom, getRoom, join, mapRoles, move, presence,
  proposeEarlyEvent, proposeEvent, publicState, respond, select, setBot, setPace, setSession, skip, start, sweep, tick, type Room,
} from './rooms';

const ROOM_PATH = /^\/ws\/rooms\/([A-Za-z]{4})$/;

interface Conn {
  ws: WebSocket;
  code: string;
  playerId: string | null; // null: a page that has not joined yet
}

export interface RoomServerOptions {
  store: MatchStore;
  narrator: Narrator | null;
  /** The Gemini Game Director (null: templates only). */
  director?: Director | null;
  log: { warn: (obj: unknown, msg: string) => void; info?: (msg: string) => void };
}

export function roomServer({ store, narrator, director = null, log }: RoomServerOptions) {
  const wss = new WebSocketServer({ noServer: true });
  const conns = new Map<string, Set<Conn>>();

  const send = (ws: WebSocket, msg: ServerMsg) => ws.readyState === ws.OPEN && ws.send(JSON.stringify(msg));
  const broadcast = (room: Room) => {
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

  /** Ask the Director for something; apply it only through the room's validators; a failure keeps the template. */
  function direct(room: Room, what: string, ask: () => Promise<unknown>, apply: (raw: unknown) => unknown) {
    ask().then(
      (raw) => {
        if (apply(raw)) broadcast(room);
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
      if (e.t !== 'record' && e.t !== 'negotiate') directMoment(room, e.key);
      // Prefetch the next round's twist while everyone reads the resolution.
      if (e.t === 'resolved' && director && e.round < TOTAL_ROUNDS && (EVENT_RULES.rounds as readonly number[]).includes(e.round + 1)) {
        const next = crisisFor(e.round + 1);
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
      send(conn.ws, { t: 'joined', playerId: player.id, seat: player.seat });
      return broadcast(room);
    }
    if (msg.t === 'resume') {
      const player = findPlayer(room, msg.playerId);
      // Newest tab wins: an older socket for the same player stops counting.
      for (const c of conns.get(room.code) ?? []) if (c !== conn && c.playerId === player.id) c.playerId = null;
      conn.playerId = player.id;
      presence(room, player, true, now);
      send(conn.ws, { t: 'joined', playerId: player.id, seat: player.seat });
      return broadcast(room);
    }
    const player = findPlayer(room, conn.playerId);
    switch (msg.t) {
      case 'persona': choosePersona(room, player, msg.persona); break;
      case 'bot': setBot(room, player, msg.persona, !!msg.on); break;
      case 'pace': setPace(room, player, msg.pace); break;
      case 'session': setSession(room, player, msg.kind); break;
      case 'start': start(room, player, now); break;
      case 'skip': skip(room, player, now); break;
      case 'select': select(room, player, msg.card, msg.district, now); break;
      case 'move': move(room, player, msg.move, msg.proposalId, now); break;
      case 'accept': accept(room, player, msg.compromiseId, now); break;
      case 'done': done(room, player, now); break;
      case 'respond': respond(room, player, msg.choice, now); break;
      case 'again': again(room, player); break;
      default: throw new RoomError('Unknown message.');
    }
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
