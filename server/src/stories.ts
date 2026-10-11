// Approved, cast civic stories from Snowflake (COASTAL_CLASH.CORPUS.APPROVED_ISSUES), the reviewed
// research corpus. Read through the SQL API with a programmatic access token, refreshed at most every
// ten minutes, and cached on disk so a match still gets real stories when Snowflake is unreachable.
// Without SNOWFLAKE_* in .env the cache (if any) is used; with nothing at all the game falls back
// to its live-readings scenario. Never throws.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { playableStories, type CivicStory } from '@shared';

const CACHE = join(dirname(fileURLToPath(import.meta.url)), '..', '.cache', 'stories.json');
const TTL_MS = 10 * 60 * 1000;
const QUERY = `SELECT ID, TITLE, AREA, SCOPE, CATEGORY, YEARS, SUMMARY, FACTS, SIDES, TENSIONS, CONCERNS, CARD_IDEAS, SOURCES, STORY_CAST
  FROM COASTAL_CLASH.CORPUS.APPROVED_ISSUES WHERE STORY_CAST IS NOT NULL ORDER BY ID`;

export interface StoryFeed {
  stories: CivicStory[];
  source: 'snowflake' | 'cache' | 'none';
  fetchedAt: string | null;
}

const parse = (v: unknown) => (typeof v === 'string' ? JSON.parse(v) : v);

async function fromSnowflake(): Promise<CivicStory[]> {
  const account = process.env.SNOWFLAKE_ACCOUNT?.trim();
  const token = process.env.SNOWFLAKE_TOKEN?.trim();
  if (!account || !token) throw new Error('SNOWFLAKE_ACCOUNT / SNOWFLAKE_TOKEN not set');
  const res = await fetch(`https://${account}.snowflakecomputing.com/api/v2/statements`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'x-snowflake-authorization-token-type': 'PROGRAMMATIC_ACCESS_TOKEN',
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({
      statement: QUERY,
      timeout: 30,
      warehouse: process.env.SNOWFLAKE_WAREHOUSE?.trim() || 'COMPUTE_WH',
      ...(process.env.SNOWFLAKE_ROLE?.trim() ? { role: process.env.SNOWFLAKE_ROLE.trim() } : {}),
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await res.json()) as { message?: string; data?: unknown[][]; statementHandle?: string; resultSetMetaData?: { partitionInfo?: unknown[] } };
  if (!res.ok || !body.data) throw new Error(`Snowflake ${res.status}: ${body.message ?? 'no data'}`);
  // Large results come in partitions: the first arrives with the answer, the rest are fetched by handle.
  const rows = [...body.data];
  const parts = body.resultSetMetaData?.partitionInfo?.length ?? 1;
  for (let i = 1; i < parts; i++) {
    const more = await fetch(`https://${account}.snowflakecomputing.com/api/v2/statements/${body.statementHandle}?partition=${i}`, {
      headers: { authorization: `Bearer ${token}`, 'x-snowflake-authorization-token-type': 'PROGRAMMATIC_ACCESS_TOKEN', accept: 'application/json' },
      signal: AbortSignal.timeout(15_000),
    });
    const page = (await more.json()) as { data?: unknown[][] };
    if (!more.ok || !page.data) throw new Error(`Snowflake partition ${i}: ${more.status}`);
    rows.push(...page.data);
  }
  return rows.map((r) => ({
    id: String(r[0]), title: String(r[1]), area: String(r[2]), scope: r[3] as CivicStory['scope'], category: String(r[4]),
    years: String(r[5]), summary: String(r[6]), facts: parse(r[7]) ?? [], sides: parse(r[8]) ?? [], tensions: parse(r[9]) ?? [],
    concerns: parse(r[10]) ?? [], card_ideas: parse(r[11]) ?? [], sources: parse(r[12]) ?? [], cast: parse(r[13]) ?? null,
  }));
}

let memo: { at: number; feed: StoryFeed } | null = null;
let inflight: Promise<StoryFeed> | null = null;

export function loadStories(log?: { warn: (o: unknown, m: string) => void }, now = Date.now()): Promise<StoryFeed> {
  if (memo && now - memo.at < TTL_MS) return Promise.resolve(memo.feed);
  inflight ??= (async (): Promise<StoryFeed> => {
    try {
      const stories = playableStories(await fromSnowflake());
      const feed: StoryFeed = { stories, source: 'snowflake', fetchedAt: new Date().toISOString() };
      await mkdir(dirname(CACHE), { recursive: true });
      await writeFile(CACHE, JSON.stringify(feed)).catch(() => {});
      memo = { at: Date.now(), feed };
      return feed;
    } catch (err) {
      log?.warn({ err: (err as Error).message }, 'stories: Snowflake unavailable, using the cache');
      try {
        const cached = JSON.parse(await readFile(CACHE, 'utf8')) as StoryFeed;
        const feed: StoryFeed = { ...cached, stories: playableStories(cached.stories), source: 'cache' };
        memo = { at: Date.now(), feed };
        return feed;
      } catch {
        return { stories: [], source: 'none', fetchedAt: null };
      }
    }
  })().finally(() => (inflight = null));
  return inflight;
}
