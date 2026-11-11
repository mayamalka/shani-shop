import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import path from 'node:path';
import pg from 'pg';
import { API_ROOT } from '../config';
import * as schema from './schema';

export type DB = NodePgDatabase<typeof schema>;
/** A db or an open transaction – both can run queries. */
export type Tx = Parameters<Parameters<DB['transaction']>[0]>[0] | DB;

export const MIGRATIONS_DIR = path.join(API_ROOT, 'drizzle');

export function createDb(url: string) {
  const pool = new pg.Pool({ connectionString: url, max: 10 });
  const db = drizzle(pool, { schema });
  return { db, pool };
}

export async function runMigrations(db: DB) {
  await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
}

export { schema };
