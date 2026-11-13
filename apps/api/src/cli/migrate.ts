/** Apply pending SQL migrations, then exit – used by the Kubernetes migrate Job (node dist/migrate.js). */
import { loadConfig } from '../config';
import { createDb, runMigrations } from '../db';

const cfg = loadConfig();
const { db, pool } = createDb(cfg.DATABASE_URL);
try {
  await runMigrations(db);
  console.log('migrations applied');
} finally {
  await pool.end();
}
