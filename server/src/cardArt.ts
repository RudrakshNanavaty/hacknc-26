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
import { CARDS, DISTRICT_IDS, districtById, type Card, type CardId } from '@shared';
import type { Gemini } from './ai/gemini';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '.cache', 'card-art');
/** Bump to repaint every card (the look changed). */
const STYLE_VERSION = 'v5';
const CONCURRENCY = 3;
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

const keyFor = (id: CardId, t: ArtTheme) => createHash('sha1').update(`${STYLE_VERSION}|${id}|${t.skin ?? ''}|${t.place ?? ''}|${t.story ?? ''}`).digest('hex').slice(0, 24);

export function registerCardArt(app: FastifyInstance, gemini: Gemini, opts: { dir?: string | null } = {}) {
  const dir = opts.dir === undefined ? DIR : opts.dir;
  const memory = new Map<string, { data: Buffer; mimeType: string }>();
  const inflight = new Map<string, Promise<{ data: Buffer; mimeType: string }>>();
  const failed = new Map<string, number>();
  let running = 0;
  let pausedUntil = 0;
  const waiting: (() => void)[] = [];

  const slot = async <T>(run: () => Promise<T>): Promise<T> => {
    if (running >= CONCURRENCY) await new Promise<void>((resolve) => waiting.push(resolve));
    running++;
    try {
      return await run();
    } finally {
      running--;
      waiting.shift()?.();
    }
  };

  const remember = (key: string, v: { data: Buffer; mimeType: string }) => {
    memory.set(key, v);
    if (memory.size > MEMORY_MAX) memory.delete(memory.keys().next().value!);
  };

  async function paint(id: CardId, theme: ArtTheme, key: string) {
    const hit = memory.get(key);
    if (hit) return hit;
    if (dir) {
      for (const [ext, mimeType] of [['jpg', 'image/jpeg'], ['png', 'image/png']] as const) {
        const disk = await readFile(join(dir, `${key}.${ext}`)).catch(() => null);
        if (disk) {
          const v = { data: disk, mimeType };
          remember(key, v);
          return v;
        }
      }
    }
    const job = inflight.get(key) ?? slot(async () => {
      const img = await gemini.image({ prompt: cardArtPrompt(CARDS[id], theme), aspectRatio: '4:3' });
      const v = { data: img.data, mimeType: img.mimeType };
      remember(key, v);
      if (dir) void mkdir(dir, { recursive: true }).then(() => writeFile(join(dir, `${key}.${img.mimeType === 'image/jpeg' ? 'jpg' : 'png'}`), img.data)).catch(() => {});
      return v;
    });
    inflight.set(key, job);
    try {
      return await job;
    } finally {
      inflight.delete(key);
    }
  }

  app.get<{ Params: { id: string }; Querystring: { skin?: string; place?: string; story?: string } }>('/api/card-art/:id', async (req, reply) => {
    const id = req.params.id as CardId;
    if (!Object.prototype.hasOwnProperty.call(CARDS, id)) return reply.code(404).send({ error: 'unknown card' });
    if (!gemini.ready()) return reply.code(503).send({ error: 'pictures are off' });
    if (Date.now() < pausedUntil) return reply.code(503).header('retry-after', '300').send({ error: 'pictures are paused (quota)' });
    const theme: ArtTheme = { skin: plain(req.query.skin, 40), place: plain(req.query.place, 40), story: plain(req.query.story, 70) };
    const key = keyFor(id, theme);
    const lastFail = failed.get(key);
    if (lastFail && Date.now() - lastFail < FAIL_TTL_MS) return reply.code(503).header('retry-after', '45').send({ error: 'not painted yet' });
    try {
      const v = await paint(id, theme, key);
      failed.delete(key);
      return reply.header('content-type', v.mimeType).header('cache-control', 'public, max-age=3600').send(v.data);
    } catch (err) {
      failed.set(key, Date.now());
      const message = (err as Error).message;
      if (OUT_OF_CREDIT.test(message)) {
        if (Date.now() >= pausedUntil) app.log.warn({ err: message.slice(0, 160) }, `card art paused for ${PAUSE_MS / 60_000} minutes: the Gemini image quota or credits are used up`);
        pausedUntil = Date.now() + PAUSE_MS;
      } else app.log.warn({ err: message.slice(0, 160), card: id }, 'card art not painted');
      return reply.code(503).header('retry-after', '45').send({ error: 'not painted' });
    }
  });
}
