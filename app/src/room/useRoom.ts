// One WebSocket per page to /ws/rooms/:code (proxied to the server by Vite). Reconnects on its own;
// a player who joined keeps their secret id in localStorage, so a reload resumes the same seat.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { CardId, ClientMsg, GameMode, NegotiationMove, Pace, PersonaId, Ping, PingEmote, RoomState, ServerMsg, SessionKind } from '@shared';

/** How long a reaction stays on the map. */
const PING_MS = 2600;

const key = (code: string) => `coastal-clash.room.${code}`;
export const savedPlayer = (code: string): string | null => {
  try {
    return localStorage.getItem(key(code));
  } catch {
    return null;
  }
};
const savePlayer = (code: string, id: string | null) => {
  try {
    if (id) localStorage.setItem(key(code), id);
    else localStorage.removeItem(key(code));
  } catch {}
};

export interface Room {
  state: RoomState | null;
  connected: boolean;
  error: string | null;
  clearError: () => void;
  /** Server clock minus ours (ms): add to Date.now() to compare with server times. */
  offset: number;
  join: (name: string, persona: PersonaId, create?: boolean) => void;
  persona: (persona: PersonaId) => void;
  bot: (persona: PersonaId, on: boolean) => void;
  session: (kind: SessionKind) => void;
  pace: (pace: Pace) => void;
  mode: (mode: GameMode) => void;
  start: () => void;
  skip: () => void;
  select: (card: CardId, district: string) => void;
  move: (move: NegotiationMove, proposalId: string) => void;
  accept: (compromiseId: string) => void;
  done: () => void;
  respond: (choice: string, stance?: 'yes' | 'no' | 'unsure') => void;
  again: () => void;
  /** Reactions on the map right now (negotiation), newest last. */
  pings: Ping[];
  ping: (district: string, emote: PingEmote) => void;
}

export function useRoom(code: string): Room {
  const [state, setState] = useState<RoomState | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [pings, setPings] = useState<Ping[]>([]);
  const ws = useRef<WebSocket | null>(null);

  useEffect(() => {
    let closed = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let wait = 500;
    const connect = () => {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      const sock = new WebSocket(`${proto}://${location.host}/ws/rooms/${code}`);
      ws.current = sock;
      sock.onopen = () => {
        wait = 500;
        setConnected(true);
        const id = savedPlayer(code);
        if (id) sock.send(JSON.stringify({ t: 'resume', playerId: id } satisfies ClientMsg));
        else sock.send(JSON.stringify({ t: 'look' } satisfies ClientMsg));
      };
      sock.onmessage = (ev) => {
        const msg = JSON.parse(String(ev.data)) as ServerMsg;
        if (msg.t === 'state') {
          setOffset(msg.state.serverNow - Date.now());
          setState(msg.state);
        } else if (msg.t === 'ping') {
          const p = msg.ping;
          setPings((list) => [...list.slice(-11), p]);
          setTimeout(() => setPings((list) => list.filter((x) => x !== p)), PING_MS);
        } else if (msg.t === 'joined') savePlayer(code, msg.playerId);
        else if (msg.t === 'error') {
          // A stale id (the server restarted, or the room expired): forget it and show the join form.
          if (/not in this room/.test(msg.message) && savedPlayer(code)) {
            savePlayer(code, null);
            ws.current?.send(JSON.stringify({ t: 'look' } satisfies ClientMsg));
          }
          setError(msg.message);
        }
      };
      sock.onclose = () => {
        setConnected(false);
        if (!closed) retry = setTimeout(connect, (wait = Math.min(wait * 2, 5000)));
      };
    };
    connect();
    return () => {
      closed = true;
      clearTimeout(retry);
      ws.current?.close();
    };
  }, [code]);

  const send = useCallback((msg: ClientMsg) => {
    setError(null);
    if (ws.current?.readyState === WebSocket.OPEN) ws.current.send(JSON.stringify(msg));
    else setError('Reconnecting to the room. Try again in a moment.');
  }, []);

  return {
    state,
    connected,
    error,
    clearError: useCallback(() => setError(null), []),
    offset,
    join: useCallback((name, persona, create) => send({ t: 'join', name, persona, create }), [send]),
    persona: useCallback((persona) => send({ t: 'persona', persona }), [send]),
    bot: useCallback((persona, on) => send({ t: 'bot', persona, on }), [send]),
    session: useCallback((kind) => send({ t: 'session', kind }), [send]),
    pace: useCallback((pace) => send({ t: 'pace', pace }), [send]),
    mode: useCallback((mode) => send({ t: 'mode', mode }), [send]),
    start: useCallback(() => send({ t: 'start' }), [send]),
    skip: useCallback(() => send({ t: 'skip' }), [send]),
    select: useCallback((card, district) => send({ t: 'select', card, district }), [send]),
    move: useCallback((move, proposalId) => send({ t: 'move', move, proposalId }), [send]),
    accept: useCallback((compromiseId) => send({ t: 'accept', compromiseId }), [send]),
    done: useCallback(() => send({ t: 'done' }), [send]),
    respond: useCallback((choice, stance) => send({ t: 'respond', choice, ...(stance ? { stance } : {}) }), [send]),
    again: useCallback(() => send({ t: 'again' }), [send]),
    pings,
    ping: useCallback((district, emote) => send({ t: 'ping', district, emote }), [send]),
  };
}
