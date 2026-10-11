// The gameplay timeline: every message a player sends and every phase and headline the table sees,
// as rows of the cc_events hypertable. Writes are buffered and batched, and never block or break a
// game: a database outage drops the oldest events and says so once.
import type pg from 'pg';

export interface GameEvent {
  at: string;
  roomCode: string;
  matchId: string | null;
  round: number | null;
  phase: string | null;
  kind: string;
  seat: number | null;
  persona: string | null;
  bot: boolean | null;
  payload?: unknown;
}

export interface EventLog {
  readonly kind: 'tiger' | 'off';
  record(e: GameEvent): void;
  flush(): Promise<void>;
  close(): Promise<void>;
}

export const noEvents: EventLog = { kind: 'off', record() {}, async flush() {}, async close() {} };

const COLS = ['at', 'room_code', 'match_id', 'round', 'phase', 'kind', 'seat', 'persona', 'bot', 'payload'] as const;
const MAX_BUFFER = 5_000;
const BATCH = 200;

export class TigerEventLog implements EventLog {
  readonly kind = 'tiger';
  private buffer: GameEvent[] = [];
  private timer: ReturnType<typeof setInterval>;
  private flushing: Promise<void> = Promise.resolve();
  private warned = false;

  constructor(private readonly pool: pg.Pool, private readonly log: { warn: (obj: unknown, msg: string) => void }, intervalMs = 1_500) {
    this.timer = setInterval(() => void this.flush(), intervalMs);
    this.timer.unref();
  }

  record(e: GameEvent) {
    this.buffer.push(e);
    if (this.buffer.length > MAX_BUFFER) this.buffer.splice(0, this.buffer.length - MAX_BUFFER);
  }

  flush(): Promise<void> {
    this.flushing = this.flushing.then(() => this.drain()).catch(() => {});
    return this.flushing;
  }

  private async drain() {
    while (this.buffer.length) {
      const batch = this.buffer.splice(0, BATCH);
      const values = batch.map((_, i) => `(${COLS.map((_c, j) => `$${i * COLS.length + j + 1}`).join(', ')})`).join(', ');
      const params = batch.flatMap((e) => [e.at, e.roomCode, e.matchId, e.round, e.phase, e.kind, e.seat, e.persona, e.bot, e.payload === undefined ? null : JSON.stringify(e.payload)]);
      try {
        await this.pool.query(`INSERT INTO cc_events (${COLS.join(', ')}) VALUES ${values}`, params);
        this.warned = false;
      } catch (err) {
        // Put the batch back (bounded by MAX_BUFFER) and try again on the next tick.
        this.buffer.unshift(...batch);
        if (this.buffer.length > MAX_BUFFER) this.buffer.splice(0, this.buffer.length - MAX_BUFFER);
        if (!this.warned) this.log.warn({ err }, 'gameplay events not saved; will retry');
        this.warned = true;
        return;
      }
    }
  }

  async close() {
    clearInterval(this.timer);
    await this.flush();
  }
}
