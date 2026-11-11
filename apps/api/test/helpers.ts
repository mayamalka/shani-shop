import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { authenticator } from 'otplib';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { inject } from 'vitest';
import { loadConfig } from '../src/config';
import { seed } from '../src/db/seed';
import type { EmailMessage } from '../src/lib/email';
import { buildApp } from '../src/server';
import { provisionAdmin } from '../src/services/auth';

export const WEB = 'http://web.test';

export async function makeApp() {
  const cfg = loadConfig({
    NODE_ENV: 'test',
    DATABASE_URL: inject('dbUrl'),
    UPLOAD_DIR: mkdtempSync(path.join(tmpdir(), 'shani-uploads-')),
    APP_SECRET: 'integration-test-secret-'.padEnd(64, '0'),
    WEB_URL: WEB,
    API_URL: 'http://api.test',
    RATE_LIMIT_DISABLED: 'true',
    COOKIE_SECURE: 'false',
  });
  const emails: EmailMessage[] = [];
  const app = await buildApp({ config: cfg, email: { send: async (m) => void emails.push(m) }, logger: false });
  await seed(app.ctx.db, app.ctx.storage, () => undefined);
  return { app, emails, cfg };
}

/** Next valid TOTP code (step offset avoids "already used" when logging in twice within 30s). */
export function totp(secret: string, stepOffset = 0) {
  return authenticator.clone({ epoch: Date.now() + stepOffset * 30_000 }).generate(secret);
}

export const cookie = (res: LightMyRequestResponse, name: string) => res.cookies.find((c) => c.name === name);

export async function createAdmin(app: FastifyInstance) {
  const secret = authenticator.generateSecret(20);
  const email = `admin-${Math.random().toString(36).slice(2, 8)}@test.co`;
  const password = 'correct horse battery staple';
  const r = await provisionAdmin(app.ctx.db, app.ctx.secrets, { email, password, totpSecret: secret });
  return { email, password, secret, backupCodes: r.backupCodes };
}

export async function login(app: FastifyInstance, admin: { email: string; password: string; secret: string }, stepOffset = 0) {
  const l = await app.inject({ method: 'POST', url: '/api/admin/auth/login', payload: { email: admin.email, password: admin.password } });
  if (l.statusCode !== 200) throw new Error(`login failed: ${l.body}`);
  const v = await app.inject({ method: 'POST', url: '/api/admin/auth/verify', payload: { code: totp(admin.secret, stepOffset) }, cookies: { pl: cookie(l, 'pl')!.value } });
  if (v.statusCode !== 200) throw new Error(`verify failed: ${v.body}`);
  return { cookies: { sid: cookie(v, 'sid')!.value }, headers: { 'x-csrf-token': v.json().csrfToken as string } };
}

export async function png(color = '#f28c28', w = 120, h = 90) {
  return sharp({ create: { width: w, height: h, channels: 3, background: color } }).png().toBuffer();
}

/** Builds a multipart/form-data body for app.inject */
export function multipart(fields: Record<string, string>, file?: { name: string; type: string; data: Buffer }) {
  const boundary = '----shani' + Math.random().toString(16).slice(2);
  const parts: Buffer[] = [];
  for (const [k, v] of Object.entries(fields)) {
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
  }
  if (file) {
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${file.name}"\r\nContent-Type: ${file.type}\r\n\r\n`));
    parts.push(file.data, Buffer.from('\r\n'));
  }
  parts.push(Buffer.from(`--${boundary}--\r\n`));
  return { payload: Buffer.concat(parts), headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } };
}

export async function uploadPhoto(app: FastifyInstance, role: 'CHILD' | 'PARENTS') {
  const body = multipart({ role }, { name: 'p.png', type: 'image/png', data: await png(role === 'CHILD' ? '#4a90c8' : '#e8573c') });
  const r = await app.inject({ method: 'POST', url: '/api/uploads', ...body });
  if (r.statusCode !== 200) throw new Error(r.body);
  const { uploadId, token } = r.json() as { uploadId: string; token: string };
  return { uploadId, token, role };
}

export async function productBySlug(app: FastifyInstance, slug: string) {
  return (await app.inject({ method: 'GET', url: `/api/products/${slug}` })).json() as { id: string; price: number; type: string };
}

export async function personalization(app: FastifyInstance) {
  return {
    childName: 'נועם',
    parent1Name: 'מיכל',
    parent2Name: 'יואב',
    photos: [await uploadPhoto(app, 'CHILD'), await uploadPhoto(app, 'PARENTS')],
  };
}

export const customer = { fullName: 'מיכל כהן', phone: '050-1234567', email: 'michal@example.com' };
export const shipping = { method: 'SHIPPING', cityCode: 4000, city: 'חיפה', street: 'הרצל', houseNumber: '12', apartment: '4', notes: '' };
export const consents = { terms: true, photos: true, marketing: false };

export async function placeOrder(app: FastifyInstance, extra: Record<string, unknown> = {}) {
  const preset = await productBySlug(app, 'preset-1-3');
  const res = await app.inject({
    method: 'POST',
    url: '/api/orders',
    payload: { customer, delivery: shipping, consents, items: [{ productId: preset.id, quantity: 1, personalization: await personalization(app) }], ...extra },
  });
  if (res.statusCode !== 200) throw new Error(res.body);
  return res.json() as { orderId: string; number: number; total: number; redirectUrl: string };
}

export async function payOrder(app: FastifyInstance, redirectUrl: string) {
  const u = new URL(redirectUrl);
  return app.inject({ method: 'POST', url: u.pathname, payload: `sig=${u.searchParams.get('sig')}&action=pay`, headers: { 'content-type': 'application/x-www-form-urlencoded' } });
}
