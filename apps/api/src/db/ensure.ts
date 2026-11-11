import { sql } from 'drizzle-orm';
import pg from 'pg';
import { createDb, runMigrations } from './index';

/** Creates the database in the URL if it doesn't exist yet (tests / e2e). */
export async function ensureDatabase(url: string) {
  const u = new URL(url);
  const name = u.pathname.slice(1);
  if (!/^[\w-]+$/.test(name)) throw new Error('bad database name');
  u.pathname = '/postgres';
  const client = new pg.Client({ connectionString: u.toString() });
  await client.connect();
  try {
    const r = await client.query('select 1 from pg_database where datname = $1', [name]);
    if (r.rowCount === 0) await client.query(`create database "${name}"`);
  } finally {
    await client.end();
  }
}

/** Empty database with the current schema. Never used on production data. */
export async function resetDatabase(url: string) {
  await ensureDatabase(url);
  const { db, pool } = createDb(url);
  try {
    await db.execute(sql`drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;`);
    await runMigrations(db);
  } finally {
    await pool.end();
  }
}
