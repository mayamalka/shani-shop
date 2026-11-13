#!/usr/bin/env node
// Runs a real PostgreSQL server from npm (no Docker needed) for local development.
// Data is kept in ./.local-db. Connection: postgresql://shani:shani@localhost:54329/shani
// Usage: npm run db:local          (keeps running until Ctrl+C)
import EmbeddedPostgres from 'embedded-postgres';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = process.env.LOCAL_DB_DIR ?? path.join(root, '.local-db');
const port = Number(process.env.LOCAL_DB_PORT ?? 54329);
const databases = (process.env.LOCAL_DB_NAMES ?? 'shani,shani_test').split(',');

const pg = new EmbeddedPostgres({
  databaseDir: dir,
  user: 'shani',
  password: 'shani',
  port,
  persistent: true,
  // Windows defaults to the WIN1252 code page, which can't store Hebrew – force UTF-8 on first init.
  initdbFlags: ['--encoding=UTF8'],
  onLog: () => {},
});

const fresh = !existsSync(path.join(dir, 'PG_VERSION'));
if (fresh) await pg.initialise();
await pg.start();
for (const db of databases) {
  try {
    await pg.createDatabase(db);
  } catch {
    /* already exists */
  }
}
console.log(`PostgreSQL is running on port ${port} (databases: ${databases.join(', ')})`);
console.log(`DATABASE_URL=postgresql://shani:shani@localhost:${port}/${databases[0]}`);
if (process.env.LOCAL_DB_DETACH === '1') process.exit(0);
console.log('Press Ctrl+C to stop.');
const stop = async () => {
  await pg.stop();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
