// Plays whole matches against a running server, four scripted players per game, so the Civic Atlas can
// be seen (and tested) on more than a handful of tables. Each player is a persona with tendencies, not a
// random clicker: the activist leans against resort projects, the resort owner towards development, the
// resident towards opposition and deals, the mayor towards backing. Everything goes through the real
// room protocol, so the engine, the scenario desk and the record are exercised exactly as in play.
//
// These are SIMULATED matches (session kind: demo, players named "Sim ..."): they are never community
// data. Point this at a sandbox server (see docs/contributing.md), not at a server holding real sessions.
//
//   cd server && ../node_modules/.bin/tsx scripts/simulate.ts --games 12 --url http://localhost:8788
import WebSocket from 'ws';
import { CARDS, DISTRICT_IDS, PERSONAS, cardEligibility, dealtHand, type CardId, type ClientMsg, type PersonaId, type RoomState, type ServerMsg } from '@shared';

const args = new Map<string, string>();
for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i]!.replace(/^--/, ''), process.argv[i + 1] ?? '');
const URL_BASE = args.get('url') ?? 'http://localhost:8788';
const GAMES = Number(args.get('games') ?? 4);
const PARALLEL = Number(args.get('parallel') ?? 3);
const SEED = Number(args.get('seed') ?? Date.now() % 100000);

function rng(seed: number) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/** How each persona tends to behave. Numbers are probabilities before per-game noise. */
const STYLE: Record<PersonaId, { project: number; oppose: number; back: number; fund: number; accept: number; dislikes: PersonaId[]; likes: PersonaId[] }> = {
  mayor: { project: 0.5, oppose: 0.12, back: 0.55, fund: 0.2, accept: 0.7, dislikes: [], likes: ['resident', 'activist'] },
  activist: { project: 0.35, oppose: 0.5, back: 0.35, fund: 0.1, accept: 0.8, dislikes: ['resort'], likes: ['resident'] },
  resort: { project: 0.6, oppose: 0.15, back: 0.5, fund: 0.3, accept: 0.45, dislikes: ['activist'], likes: ['mayor'] },
  resident: { project: 0.3, oppose: 0.45, back: 0.4, fund: 0.1, accept: 0.65, dislikes: ['resort'], likes: ['mayor', 'activist'] },
};

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

class Player {
  ws!: WebSocket;
  state: RoomState | null = null;
  seat = -1;
  responded = false;
  private acted = new Set<string>();
  private lastBoard = '';

  constructor(
    readonly code: string,
    readonly name: string,
    readonly persona: PersonaId,
    readonly create: boolean,
    private readonly rand: () => number,
    private readonly noise: number,
    private readonly onFinal: () => void,
  ) {}

  private send(m: ClientMsg) {
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m));
  }

  open(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(`${URL_BASE.replace(/^http/, 'ws')}/ws/rooms/${this.code}`);
      this.ws.on('open', () => {
        this.send({ t: 'join', name: this.name, persona: this.persona, create: this.create });
      });
      this.ws.on('message', (raw) => {
        const m = JSON.parse(String(raw)) as ServerMsg;
        if (m.t === 'joined') {
          this.seat = m.seat;
          resolve();
        } else if (m.t === 'state') {
          this.state = m.state;
          this.react(m.state);
        } else if (m.t === 'error' && this.seat < 0) reject(new Error(m.message));
      });
      this.ws.on('error', reject);
    });
  }

  start() {
    this.send({ t: 'start' });
  }

  close() {
    this.ws.close();
  }

  private once(key: string) {
    if (this.acted.has(key)) return false;
    this.acted.add(key);
    return true;
  }

  private react(s: RoomState) {
    const me = s.players.find((p) => p.seat === this.seat);
    if (!me) return;
    const key = `${s.phase}-${s.round}`;
    if (s.phase === 'crisis' && s.crisis && this.once(key)) return void setTimeout(() => this.send({ t: 'done' }), 5);
    if (s.phase === 'reveal' && this.once(key)) return void setTimeout(() => this.send({ t: 'done' }), 5);
    if (s.phase === 'resolve' && this.once(key)) return void setTimeout(() => this.send({ t: 'done' }), 5);
    if (s.phase === 'select' && !s.mine?.selection && this.once(key)) return void this.play(s, me.influence);
    if (s.phase === 'negotiate' && s.board && this.once(key)) return void this.negotiate(s, me.influence);
    if (s.phase === 'final' && this.once(key)) {
      this.onFinal();
      return void setTimeout(() => this.respond(s), 5);
    }
  }

  private pick<T>(xs: T[], weights: number[]): T {
    const total = weights.reduce((a, b) => a + b, 0);
    let r = this.rand() * total;
    for (let i = 0; i < xs.length; i++) {
      r -= weights[i]!;
      if (r <= 0) return xs[i]!;
    }
    return xs.at(-1)!;
  }

  private play(s: RoomState, influence: number) {
    const style = STYLE[this.persona];
    const hand = dealtHand(this.persona, s.round, s.crisis).filter((id) => CARDS[id].cost <= influence);
    const spot = s.crisis?.spotlight ?? [];
    const options: { card: CardId; district: string; w: number }[] = [];
    for (const card of hand) {
      const c = CARDS[card];
      for (const district of DISTRICT_IDS) {
        if (!cardEligibility(card, district).ok) continue;
        let w = c.category === 'project' ? style.project : c.category === 'opposition' ? style.oppose : c.category === 'support' ? style.back : 0.25;
        w *= spot.includes(district) ? 2.2 : 1;
        w *= 0.6 + this.rand() * this.noise;
        options.push({ card, district, w });
      }
    }
    if (!options.length) return void this.send({ t: 'done' });
    const choice = this.pick(options, options.map((o) => o.w));
    this.send({ t: 'select', card: choice.card, district: choice.district });
  }

  private negotiate(s: RoomState, influence: number) {
    const board = s.board!;
    const style = STYLE[this.persona];
    // Deals offered to me as the proposal's owner.
    for (const c of board.compromises) {
      if (c.owner === this.seat && !c.accepted && this.rand() < style.accept * (0.7 + this.rand() * 0.6)) this.send({ t: 'accept', compromiseId: c.id });
    }
    const others = board.proposals.filter((p) => p.seat !== this.seat);
    if (others.length && influence >= 1) {
      const p = this.pick(others, others.map((x) => (style.dislikes.includes(x.persona) ? 1.8 : style.likes.includes(x.persona) ? 1.4 : 1) * (0.5 + this.rand())));
      const oppose = style.oppose * (style.dislikes.includes(p.persona) ? 2 : style.likes.includes(p.persona) ? 0.2 : 1);
      const roll = this.rand();
      const move = roll < oppose ? 'oppose' : roll < oppose + style.back * (style.likes.includes(p.persona) ? 1.4 : 0.7) ? 'back' : influence >= 2 && this.rand() < style.fund ? 'fund' : null;
      if (move) this.send({ t: 'move', move, proposalId: p.id });
    }
    setTimeout(() => this.send({ t: 'done' }), 20);
  }

  private respond(s: RoomState) {
    const all = s.history.flatMap((h) => h.board.proposals).filter((p, i, a) => a.findIndex((x) => x.id === p.id) === i);
    const mine = all.filter((p) => p.seat === this.seat);
    const roll = this.rand();
    let choice = 'none';
    if (all.length) {
      // Most people keep to their own proposal; some switch for a proposal that is not theirs.
      if (roll < 0.5 && mine.length) choice = mine[Math.floor(this.rand() * mine.length)]!.id;
      else if (roll < 0.92) choice = all[Math.floor(this.rand() * all.length)]!.id;
    }
    this.send({ t: 'respond', choice });
    this.responded = true;
  }
}

async function playGame(n: number, rand: () => number): Promise<{ ok: boolean; matchId: string | null; note: string }> {
  const code = Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(rand() * CODE_CHARS.length)]).join('');
  const personas = [...PERSONAS];
  let finals = 0;
  let resolveDone!: () => void;
  const done = new Promise<void>((r) => (resolveDone = r));
  const players = personas.map((persona, i) => new Player(code, `Sim ${'ABCD'[i]}${n}`, persona, i === 0, rand, 0.6 + rand() * 0.8, () => {
    if (++finals === personas.length) setTimeout(resolveDone, 150);
  }));
  try {
    await players[0]!.open();
    await Promise.all(players.slice(1).map((p) => p.open()));
    players[0]!.start();
    const timeout = new Promise<void>((_, rej) => setTimeout(() => rej(new Error('timed out')), 60_000));
    await Promise.race([done, timeout]);
    await new Promise((r) => setTimeout(r, 200));
    const matchId = players[0]!.state?.matchId ?? null;
    return { ok: true, matchId, note: `${code} ${players[0]!.state?.history.length ?? 0} rounds` };
  } catch (err) {
    return { ok: false, matchId: null, note: `${code} ${(err as Error).message}` };
  } finally {
    for (const p of players) p.ws?.close();
  }
}

async function main() {
  const health = await fetch(`${URL_BASE}/api/health`).then((r) => r.json()).catch(() => null);
  if (!health) throw new Error(`no server at ${URL_BASE}`);
  console.log(`simulating ${GAMES} matches against ${URL_BASE} (seed ${SEED}, ${PARALLEL} at a time)`);
  const rand = rng(SEED);
  let next = 0;
  let ok = 0;
  const worker = async () => {
    while (next < GAMES) {
      const n = ++next;
      const r = await playGame(n, rng(Math.floor(rand() * 2 ** 31)));
      if (r.ok) ok++;
      console.log(`  game ${n}: ${r.ok ? 'finished' : 'FAILED'} (${r.note})`);
    }
  };
  await Promise.all(Array.from({ length: PARALLEL }, worker));
  console.log(`${ok} of ${GAMES} matches finished`);
  process.exit(ok === GAMES ? 0 : 1);
}

void main();
