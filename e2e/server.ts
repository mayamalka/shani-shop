/**
 * Server for the end-to-end tests: fresh database, seed data, a known admin, and the built
 * website served by the API on one origin (like production). Started by playwright.config.ts.
 */
import { eq } from 'drizzle-orm';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { loadConfig } from '../apps/api/src/config';
import { createDb } from '../apps/api/src/db';
import { resetDatabase } from '../apps/api/src/db/ensure';
import { settings } from '../apps/api/src/db/schema';
import { seed } from '../apps/api/src/db/seed';
import { Secrets } from '../apps/api/src/lib/crypto';
import { LocalStorage } from '../apps/api/src/lib/storage';
import { buildApp } from '../apps/api/src/server';
import { provisionAdmin } from '../apps/api/src/services/auth';
import { E2E } from './constants';

const tmp = path.resolve(import.meta.dirname, '.tmp');
rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });

const url = process.env.E2E_DATABASE_URL ?? 'postgresql://shani:shani@localhost:54329/shani_e2e';
await resetDatabase(url);

const cfg = loadConfig({
  NODE_ENV: 'test',
  DATABASE_URL: url,
  UPLOAD_DIR: path.join(tmp, 'uploads'),
  EMAIL_TRANSPORT: 'file',
  EMAIL_OUTBOX: E2E.outbox,
  WEB_URL: E2E.baseURL,
  API_URL: E2E.baseURL,
  API_PORT: String(E2E.port),
  APP_SECRET: 'e2e-secret-'.padEnd(64, '7'),
  SERVE_WEB: 'true',
  RATE_LIMIT_DISABLED: 'true',
});

const { db, pool } = createDb(url);
await seed(db, new LocalStorage(cfg.UPLOAD_DIR), () => undefined);
await db
  .update(settings)
  .set({
    whatsappNumber: '050-1234567',
    instagramUrl: 'https://www.instagram.com/example',
    tiktokUrl: 'https://www.tiktok.com/@example',
    pickupAddress: 'רחוב הבדיקה 1, חיפה',
    ga4Id: 'G-TEST123',
    metaPixelId: '1234567890',
    tiktokPixelId: 'CTEST123',
  })
  .where(eq(settings.id, 1));
const admin = await provisionAdmin(db, new Secrets(cfg.APP_SECRET), { email: E2E.adminEmail, password: E2E.adminPassword, totpSecret: E2E.totpSecret });
writeFileSync(path.join(tmp, 'backup-codes.json'), JSON.stringify(admin.backupCodes));
await pool.end();

const app = await buildApp({ config: cfg, logger: false });
await app.listen({ port: E2E.port, host: '127.0.0.1' });
console.log(`e2e server on ${E2E.baseURL}`);
