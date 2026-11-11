/**
 * Applies the SQL migrations in apps/api/drizzle to DATABASE_URL.
 *   npm run db:migrate            – apply pending migrations
 *   npm run db:reset              – DELETE ALL DATA, re-create tables, then seed (development only)
 */
import { sql } from 'drizzle-orm';
import { loadConfig } from '../config';
import { createDb, runMigrations } from './index';

const cfg = loadConfig();
const { db, pool } = createDb(cfg.DATABASE_URL);
try {
  if (process.argv.includes('--reset')) {
    if (cfg.NODE_ENV === 'production') throw new Error('Refusing to reset a production database');
    await db.execute(sql`drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;`);
    console.log('database wiped');
  }
  await runMigrations(db);
  console.log('migrations applied');
} finally {
  await pool.end();
}
