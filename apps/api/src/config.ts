import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

export const API_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const REPO_ROOT = path.resolve(API_ROOT, '../..');

// Load the repo-level .env (if present) without overriding variables already set.
const envFile = path.join(REPO_ROOT, '.env');
if (existsSync(envFile) && !process.env.SKIP_DOTENV) process.loadEnvFile(envFile);

const bool = z
  .string()
  .optional()
  .transform((v) => v === 'true' || v === '1');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required – copy .env.example to .env'),
  WEB_URL: z.string().url().default('http://localhost:5173'),
  API_URL: z.string().url().default('http://localhost:3001'),
  API_PORT: z.coerce.number().int().default(3001),
  API_HOST: z.string().default('0.0.0.0'),
  APP_SECRET: z.string().min(32, 'APP_SECRET must be at least 32 characters'),
  UPLOAD_DIR: z.string().default('./uploads'),
  EMAIL_TRANSPORT: z.enum(['file', 'smtp']).default('file'),
  EMAIL_OUTBOX: z.string().default('./.outbox'),
  SMTP_HOST: z.string().default('localhost'),
  SMTP_PORT: z.coerce.number().int().default(1025),
  SMTP_USER: z.string().optional().default(''),
  SMTP_PASS: z.string().optional().default(''),
  EMAIL_FROM: z.string().default('הדודה שני <no-reply@hadoda-shani.co.il>'),
  PAYMENT_PROVIDER: z.enum(['mock']).default('mock'),
  COOKIE_SECURE: bool,
  /** serve the built web app (apps/web/dist) from the API – single-server deploys and e2e */
  SERVE_WEB: bool,
  RATE_LIMIT_DISABLED: bool,
});

export type Config = z.infer<typeof schema>;

export function loadConfig(overrides: Partial<Record<keyof Config, string>> = {}): Config {
  const parsed = schema.safeParse({ ...process.env, ...overrides });
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid configuration:\n${msg}`);
  }
  const c = parsed.data;
  if (c.NODE_ENV === 'production' && c.APP_SECRET.startsWith('change-me')) {
    throw new Error('APP_SECRET must be changed in production');
  }
  // relative paths are relative to the repo root, so every workspace agrees
  c.UPLOAD_DIR = path.resolve(REPO_ROOT, c.UPLOAD_DIR);
  c.EMAIL_OUTBOX = path.resolve(REPO_ROOT, c.EMAIL_OUTBOX);
  return c;
}
