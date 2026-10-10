// /ws/rooms/:code: the room protocol (shared/src/room.ts) over raw `ws`, on Fastify's server.
// Every locked design is evaluated with buildExperiment (the same checks as POST /api/experiments)
// and saved through the experiment store, so room rounds land in Tiger Data like solo tests.
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer, type WebSocket } from 'ws';
import type { ClientMsg, RoomState, ServerMsg } from '@shared';
import type { ExperimentStore } from './db/store';
import { BadExperiment, buildExperiment } from './experiments';
import {
  RoomError, again, findPlayer, getOrCreateRoom, getRoom, join, lock, pick, presence, publicState, setReef,
  start, sweep, tick, type Evaluator, type Player, type Room,
} from './rooms';

const ROOM_PATH = /^\/ws\/rooms\/([A-Za-z]{4})$/;

interface Conn {
  ws: WebSocket;
  code: string;
  playerId: string | null; // null: a page that has not joined yet
}

export interface RoomServerOptions {
  store: ExperimentStore;
  log: { warn: (obj: unknown, msg: string) => void };
}

export function roomServer({ store, log }: RoomServerOptions) {
  const wss = new WebSocketServer({ noServer: true });
  const conns = new Map<string, Set<Conn>>();

  const send = (ws: WebSocket, msg: ServerMsg) => ws.readyState === ws.OPEN && ws.send(JSON.stringify(msg));
  const broadcast = (room: Room) => {
    const now = Date.now();
    for (const c of conns.get(room.code) ?? []) {
      const viewer = c.playerId ? room.players.find((p) => p.id === c.playerId) ?? null : null;
      const state: RoomState = publicState(room, viewer, now);
      send(c.ws, { t: 'state', state });
    }
  };

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

  /** Evaluate with the server's engine under the room's reef and seed, and save the experiment. */
  const evaluator = (room: Room, player: Player): Evaluator => (design) => {
    let record;
    try {
      record = buildExperiment({ reef: room.reef, design, seed: room.seed, playerId: player.id, playerName: player.name, roomCode: room.code });
    } catch (err) {
      if (err instanceof BadExperiment) throw new RoomError(`That design is not valid: ${err.problems[0]}`);
      throw err;
    }
    store.save(record).catch((e) => log.warn({ err: e, room: room.code }, 'room experiment not saved'));
    return { result: record.result, design: record.design, experimentId: record.id };
  };

  function handle(conn: Conn, msg: ClientMsg) {
    const now = Date.now();
    const room = msg.t === 'join' && msg.create ? getOrCreateRoom(conn.code, now) : getRoom(conn.code);
    if (msg.t === 'look') return send(conn.ws, { t: 'state', state: publicState(room, null, now) });
    if (msg.t === 'join') {
      const player = join(room, msg.name, msg.avatar);
      conn.playerId = player.id;
      send(conn.ws, { t: 'joined', playerId: player.id, seat: player.seat });
      return broadcast(room);
    }
    if (msg.t === 'resume') {
      const player = findPlayer(room, msg.playerId);
      // Newest tab wins: an older socket for the same player stops counting.
      for (const c of conns.get(room.code) ?? []) if (c !== conn && c.playerId === player.id) c.playerId = null;
      conn.playerId = player.id;
      presence(room, player, true);
      send(conn.ws, { t: 'joined', playerId: player.id, seat: player.seat });
      return broadcast(room);
    }
    const player = findPlayer(room, conn.playerId);
    if (msg.t === 'start') start(room, player, now);
    else if (msg.t === 'again') again(room, player);
    else if (msg.t === 'reef') setReef(room, player, msg.reef);
    else if (msg.t === 'pick') pick(room, player, msg.avatar);
    else if (msg.t === 'lock') lock(room, player, msg.design, evaluator(room, player), now);
    else throw new RoomError('Unknown message.');
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
