import pg from 'pg';
import { buildServer } from './app';
import { APP_DIST, registerWeb } from './web';
import { type MatchStore, FileStore, failSoft } from './db/store';
import { TigerStore, poolConfig, prepareTiger } from './db/tiger';
import { type Persist, localPersist, tigerPersist } from './db/persist';

const port = Number(process.env.PORT || 8787);
const RETRY_MS = 15_000;

const log = { warn: (obj: unknown, msg: string) => app.log.warn(obj, msg) };

// With DATABASE_URL (Tiger Data) every record is stored there and in a local file as well; without it
// matches live in the file only. The database may be unreachable at start (venue wifi): the server
// does not wait for it, it keeps retrying and backfills what was kept locally.
const local = new FileStore();
let store: MatchStore = local;
let persist: Persist = localPersist();
let connecting: (() => void) | null = null;

if (process.env.DATABASE_URL) {
  const pool = new pg.Pool(poolConfig(process.env.DATABASE_URL));
  pool.on('error', () => {}); // idle client errors; queries report their own
  const resilient = failSoft(new TigerStore(pool), log, local);
  store = resilient;
  persist = tigerPersist(pool, log);
  let attempts = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const connect = async () => {
    attempts++;
    try {
      await prepareTiger(pool);
      const n = await resilient.sync();
      app.log.info(`Tiger Data ready (attempt ${attempts}): schema applied, ${n} locally kept matches written`);
    } catch (err) {
      app.log.warn({ err: (err as Error).message }, `Tiger Data unreachable (attempt ${attempts}); playing on local files, retrying in ${RETRY_MS / 1000}s`);
      timer = setTimeout(() => void connect(), RETRY_MS);
      timer.unref();
    }
  };
  connecting = () => void connect();
}

const app = buildServer({ store, persist });
if (process.env.DATABASE_URL) app.log.info('Tiger Data: connecting (matches, gameplay timeline, summaries, city snapshots, studio history and the civic record are stored there)');
else app.log.info('DATABASE_URL not set; matches are kept in server/.cache/matches.json');
connecting?.();

// Production: serve the built app from this server too (one origin for the game, /api and /ws).
registerWeb(app)
  .then((web) => {
    if (web) app.log.info(`serving the app from ${APP_DIST}`);
    return app.listen({ port, host: '0.0.0.0' });
  })
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
