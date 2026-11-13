import { runMigrations } from './db';
import { israelAddresses } from './lib/geo';
import { purgeOnce } from './jobs';
import { buildApp } from './server';

const app = await buildApp();
const { cfg, db } = app.ctx;

// bring the database schema up to date before taking traffic (Kubernetes: the migrate Job does this instead)
if (cfg.RUN_MIGRATIONS) await runMigrations(db);
israelAddresses(); // load the address list now rather than on the first checkout

await app.listen({ port: cfg.API_PORT, host: cfg.API_HOST });

// Privacy housekeeping every 6 hours (Kubernetes: a CronJob runs dist/purge.js instead).
const purge = () => purgeOnce(app.ctx, app.log).catch((err) => app.log.error({ err }, 'photo purge failed'));
const timer = cfg.PURGE_TIMER ? setInterval(purge, 6 * 3600_000) : undefined;
if (cfg.PURGE_TIMER) setTimeout(purge, 30_000).unref();

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, async () => {
    clearInterval(timer);
    await app.close();
    process.exit(0);
  });
}
