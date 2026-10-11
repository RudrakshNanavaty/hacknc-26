// Card pictures, painted live: the top of every card is a small Gemini illustration made for this
// round (the card's idea, in the round's story and place). Nothing is stored in the repo: pictures
// are generated on first request, kept in memory and in server/.cache/card-art, and fail soft (a card
// without a picture keeps its drawn placeholder; a game never waits on this).
//
//   GET /api/card-art/:cardId?skin=<story name>&place=<area id>&story=<story title>
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import { CARDS, CARD_ART_STYLE, CARD_IDS, DISTRICT_IDS, districtById, type Card, type CardId } from '@shared';
import type { Gemini } from './ai/gemini';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '.cache', 'card-art');
const CONCURRENCY = 4;
const MEMORY_MAX = 120;
const FAIL_TTL_MS = 45_000;
/** A quota or billing error (402, 429) pauses all painting: every card would only fail the same way. */
const PAUSE_MS = 5 * 60_000;
const OUT_OF_CREDIT = /\b(402|429)\b|RESOURCE_EXHAUSTED|quota|credits/i;

/** One look for every card: the same stage, light and camera, so a hand reads as one set. */
export const HOUSE_STYLE = [
  'Stylized 3D render in the vein of modern mobile card-game art such as Pokemon TCG Pocket and Clash Royale: solid matte and satin materials like painted clay and soft vinyl, chunky friendly proportions, crisp readable shapes.',
  'Absolutely no glass, no jelly, no translucent or gel materials, no soap bubbles and no lens flare.',
  'Stage, identical on every card: ONE small floating diorama tile of Miami Beach ground (a slab of sand with a strip of turquoise water along one edge and a few green palm trees), seen from a slightly elevated three-quarter view, centered, against a plain soft sky-blue gradient with two or three small clay-like clouds. Nothing else in the background: no horizon, no skyline, no wide scenery.',
  'Warm natural sunlight from the upper left with soft grounded shadows. Saturated but natural colors: turquoise water, sandy beach, white and pastel art-deco stucco, green palms.',
].join(' ');

/** What the hero object is, by kind of card: always one simple, readable thing. */
const HERO: Record<Card['category'], string> = {
  project: 'a tidy model of the finished public project itself, built on the tile',
  support: 'one simple symbol of backing and resources standing on the tile, such as a stack of gold coins, a rolled blueprint or a big upward arrow',
  opposition: 'one simple symbol of a firm but peaceful objection standing on the tile, such as a wooden gavel, a blank stop-sign shape or a raised hand',
  negotiation: 'one simple symbol of a deal standing on the tile, such as two hands shaking over a small model of the coast',
};

/** A small accent in the deck's color; the rest of the picture stays in the house palette. */
const ACCENT: Record<Card['persona'], string> = {
  mayor: 'gold',
  activist: 'leaf green',
  resort: 'coral orange',
  resident: 'warm sunrise orange',
};

/** A short, plain phrase from something a player's browser sent: letters, digits and light punctuation only. */
export const plain = (v: unknown, max = 60): string =>
  (typeof v === 'string' ? v : '').normalize('NFKC').replace(/[^\p{L}\p{N} '’&,.-]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

export interface ArtTheme {
  skin?: string;
  place?: string;
  story?: string;
}

/** What to paint. Built here from the authored card; the browser only supplies names it already shows. */
export function cardArtPrompt(card: Card, theme: ArtTheme = {}): string {
  const name = theme.skin || card.name;
  const where = theme.place && (DISTRICT_IDS as readonly string[]).includes(theme.place) ? districtById(theme.place).name : 'the Miami Beach shoreline';
  return [
    HOUSE_STYLE,
    `Hero object: ${HERO[card.category]}, for the card "${name}" (${card.text}). Keep it a single clear object with a bold silhouette, filling about 60 percent of the frame, that reads at thumbnail size.`,
    `Set in ${where}, Miami Beach${theme.story ? `, in the mood of: ${theme.story}` : ''}. A small accent in the deck's color: ${ACCENT[card.persona]}.`,
    'Landscape 4:3, full-bleed edge to edge with no frame, no border, no card edge and no vignette.',
    'Absolutely no text, letters, numbers, captions, logos, watermarks or emoji, and do not write any place or street name. No real people or likenesses. Family-friendly.',
  ].join(' ');
}

const keyFor = (id: CardId, t: ArtTheme) => createHash('sha1').update(`${CARD_ART_STYLE}|${id}|${t.skin ?? ''}|${t.place ?? ''}|${t.story ?? ''}`).digest('hex').slice(0, 24);

export interface ArtItem extends ArtTheme {
  id: CardId;
}

export interface ArtService {
  /** Start painting these in the background (a match's hands, as soon as they are known). Requests from players jump ahead. */
  prefetch(items: ArtItem[]): void;
  /** Paint every card's generic picture once (the lobby's examples); pictures already on disk cost nothing. */
  warmExamples(): void;
}

type Stored = { data: Buffer; mimeType: string };

interface Task {
  key: string;
  /** A player is waiting on it (otherwise it is background work). */
  urgent: boolean;
  started: boolean;
  run: () => Promise<Stored>;
  promise: Promise<Stored>;
  resolve: (v: Stored) => void;
  reject: (e: unknown) => void;
}

export function registerCardArt(app: FastifyInstance, gemini: Gemini, opts: { dir?: string | null } = {}): ArtService {
  const dir = opts.dir === undefined ? DIR : opts.dir;
  const memory = new Map<string, Stored>();
  const tasks = new Map<string, Task>();
  const queue: Task[] = [];
  const failed = new Map<string, number>();
  let running = 0;
  let pausedUntil = 0;

  const remember = (key: string, v: Stored) => {
    memory.set(key, v);
    if (memory.size > MEMORY_MAX) memory.delete(memory.keys().next().value!);
  };

  /** Players' requests first, then background work in the order it was queued. */
  function pump() {
    while (running < CONCURRENCY) {
      const next = queue.find((t) => !t.started && t.urgent) ?? queue.find((t) => !t.started);
      if (!next) return;
      next.started = true;
      queue.splice(queue.indexOf(next), 1);
      running++;
      next.run().then(next.resolve, next.reject).finally(() => {
        running--;
        tasks.delete(next.key);
        pump();
      });
    }
  }

  async function fromDisk(key: string): Promise<Stored | null> {
    if (!dir) return null;
    for (const [ext, mimeType] of [['jpg', 'image/jpeg'], ['png', 'image/png']] as const) {
      const data = await readFile(join(dir, `${key}.${ext}`)).catch(() => null);
      if (data) return { data, mimeType };
    }
    return null;
  }

  /** One picture: from memory, disk, or Gemini. Joins work already queued for the same picture. */
  function paint(id: CardId, theme: ArtTheme, key: string, urgent: boolean): Promise<Stored> {
    const hit = memory.get(key);
    if (hit) return Promise.resolve(hit);
    const queued = tasks.get(key);
    if (queued) {
      queued.urgent ||= urgent;
      return queued.promise;
    }
    let resolve!: Task['resolve'];
    let reject!: Task['reject'];
    const promise = new Promise<Stored>((res, rej) => ((resolve = res), (reject = rej)));
    const task: Task = {
      key, urgent, started: false, promise, resolve, reject,
      run: async () => {
        const disk = await fromDisk(key);
        if (disk) {
          remember(key, disk);
          return disk;
        }
        if (Date.now() < pausedUntil) throw new Error('paused (quota)');
        const img = await gemini.image({ prompt: cardArtPrompt(CARDS[id], theme), aspectRatio: '4:3' });
        const v = { data: img.data, mimeType: img.mimeType };
        remember(key, v);
        if (dir) void mkdir(dir, { recursive: true }).then(() => writeFile(join(dir, `${key}.${img.mimeType === 'image/jpeg' ? 'jpg' : 'png'}`), img.data)).catch(() => {});
        return v;
      },
    };
    tasks.set(key, task);
    queue.push(task);
    pump();
    return promise;
  }

  const noteFailure = (err: unknown, id: CardId) => {
    const message = (err as Error).message;
    if (OUT_OF_CREDIT.test(message)) {
      if (Date.now() >= pausedUntil) app.log.warn({ err: message.slice(0, 160) }, `card art paused for ${PAUSE_MS / 60_000} minutes: the Gemini image quota or credits are used up`);
      pausedUntil = Date.now() + PAUSE_MS;
    } else if (!/paused/.test(message)) app.log.warn({ err: message.slice(0, 160), card: id }, 'card art not painted');
  };

  const theme = (t: ArtTheme): ArtTheme => ({ skin: plain(t.skin, 40), place: plain(t.place, 40), story: plain(t.story, 70) });

  const service: ArtService = {
    prefetch(items) {
      if (!gemini.ready()) return;
      for (const it of items) {
        if (!Object.prototype.hasOwnProperty.call(CARDS, it.id)) continue;
        const t = theme(it);
        const key = keyFor(it.id, t);
        if (memory.has(key) || tasks.has(key)) continue;
        // Background work never poisons the failure memory: a player's own request decides that.
        paint(it.id, t, key, false).catch((err) => noteFailure(err, it.id));
      }
    },
    warmExamples() {
      service.prefetch(CARD_IDS.map((id) => ({ id })));
    },
  };

  app.get<{ Params: { id: string }; Querystring: { skin?: string; place?: string; story?: string } }>('/api/card-art/:id', async (req, reply) => {
    const id = req.params.id as CardId;
    if (!Object.prototype.hasOwnProperty.call(CARDS, id)) return reply.code(404).send({ error: 'unknown card' });
    if (!gemini.ready()) return reply.code(503).send({ error: 'pictures are off' });
    const t = theme(req.query);
    const key = keyFor(id, t);
    // The key includes the style version, so it is the picture's identity: a client that has it is current.
    const etag = `"${key}"`;
    if (req.headers['if-none-match'] === etag) return reply.code(304).header('etag', etag).send();
    const lastFail = failed.get(key);
    if (lastFail && Date.now() - lastFail < FAIL_TTL_MS) return reply.code(503).header('retry-after', '45').send({ error: 'not painted yet' });
    if (Date.now() < pausedUntil && !memory.has(key) && !tasks.has(key) && !(await fromDisk(key))) {
      return reply.code(503).header('retry-after', '300').send({ error: 'pictures are paused (quota)' });
    }
    try {
      const v = await paint(id, t, key, true);
      failed.delete(key);
      return reply.header('content-type', v.mimeType).header('etag', etag).header('cache-control', 'no-cache').send(v.data);
    } catch (err) {
      failed.set(key, Date.now());
      noteFailure(err, id);
      return reply.code(503).header('retry-after', '45').send({ error: 'not painted' });
    }
  });

  return service;
}
