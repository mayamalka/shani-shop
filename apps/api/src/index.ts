import { runMigrations } from './db';
import { israelAddresses } from './lib/geo';
import { buildApp } from './server';
import { getSettings } from './services/catalog';

const app = await buildApp();
const { cfg, db, orders } = app.ctx;

// bring the database schema up to date before taking traffic
await runMigrations(db);
israelAddresses(); // load the address list now rather than on the first checkout

await app.listen({ port: cfg.API_PORT, host: cfg.API_HOST });

// Privacy housekeeping: delete customer photos past their retention period, every 6 hours.
const purge = async () => {
  try {
    const s = await getSettings(db);
    const r = await orders.purgePhotos(s.photoRetentionDays);
    if (r.photos) app.log.info(r, 'deleted old customer photos');
  } catch (err) {
    app.log.error({ err }, 'photo purge failed');
  }
};
const timer = setInterval(purge, 6 * 3600_000);
setTimeout(purge, 30_000).unref();

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, async () => {
    clearInterval(timer);
    await app.close();
    process.exit(0);
  });
}
