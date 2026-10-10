import pg from 'pg';
import { buildServer } from './app';
import { APP_DIST, registerWeb } from './web';
import { type ExperimentStore, MemoryStore, failSoft } from './db/store';
import { TigerStore, poolConfig, prepareTiger } from './db/tiger';

const port = Number(process.env.PORT || 8787);

// Tiger Data when DATABASE_URL is set and the schema applies; memory otherwise.
let store: ExperimentStore = new MemoryStore();
let storeNote = 'DATABASE_URL not set; experiments are kept in memory';
if (process.env.DATABASE_URL) {
  const pool = new pg.Pool(poolConfig(process.env.DATABASE_URL));
  pool.on('error', () => {}); // idle client errors; queries report their own
  try {
    await prepareTiger(pool);
    store = new TigerStore(pool);
    storeNote = 'Tiger Data ready';
  } catch (err) {
    await pool.end().catch(() => {});
    storeNote = `Tiger Data unavailable (${(err as Error).message}); experiments are kept in memory`;
  }
}

const log = { warn: (obj: unknown, msg: string) => app.log.warn(obj, msg) };
const app = buildServer({ store: store.kind === 'tiger' ? failSoft(store, log) : store });
app.log.info(storeNote);

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
