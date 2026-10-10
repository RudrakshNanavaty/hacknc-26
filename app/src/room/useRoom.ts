// One WebSocket per page to /ws/rooms/:code (proxied to the server by Vite). Reconnects on its own;
// a page that joined keeps its secret id in localStorage, so a reload resumes the same player.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { AvatarId, ClientMsg, Design, ReefId, RoomState, ServerMsg } from '@shared';

const key = (code: string) => `reefforge.room.${code}`;
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
  /** `create`: open the room (the player hosting it). */
  join: (name: string, avatar: AvatarId, create?: boolean) => void;
  pick: (avatar: AvatarId) => void;
  start: () => void;
  lock: (design: Design) => void;
  again: () => void;
  /** Host, in the lobby: the reef of the next round. */
  reef: (reef: ReefId) => void;
}

export function useRoom(code: string): Room {
  const [state, setState] = useState<RoomState | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
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
    join: useCallback((name, avatar, create) => send({ t: 'join', name, avatar, create }), [send]),
    pick: useCallback((avatar) => send({ t: 'pick', avatar }), [send]),
    start: useCallback(() => send({ t: 'start' }), [send]),
    lock: useCallback((design) => send({ t: 'lock', design }), [send]),
    again: useCallback(() => send({ t: 'again' }), [send]),
    reef: useCallback((reef: ReefId) => send({ t: 'reef', reef }), [send]),
  };
}
