import { checkoutSchema, consentSchema, contactSchema, PHOTO_ROLES, quoteSchema } from '@shani/shared';
import { and, asc, eq } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { consentLogs, contactMessages, pageOptions, uploads } from '../db/schema';
import { randomToken, sha256 } from '../lib/crypto';
import { israelAddresses } from '../lib/geo';
import { HttpError, notFound, parse } from '../lib/http';
import { processCustomerPhoto, thumbnail } from '../lib/images';
import { findProduct, getSettings, listProducts, pageOptionDTO, productDTO, settingsDTO } from '../services/catalog';

const limit = (max: number, minutes: number) => ({ rateLimit: { max, timeWindow: minutes * 60_000 } });

export const publicRoutes: FastifyPluginAsync = async (app) => {
  const { db, storage, orders, payments, notifier } = app.ctx;

  app.get('/health', async () => ({ ok: true }));

  app.get('/settings', async () => settingsDTO(await getSettings(db)));

  app.get('/products', async () => (await listProducts(db, true)).map(productDTO));

  app.get<{ Params: { slug: string } }>('/products/:slug', async (req) => {
    const p = await findProduct(db, { slug: req.params.slug });
    if (!p || !p.active) throw notFound('המוצר לא נמצא');
    return productDTO(p);
  });

  app.get('/page-options', async () => {
    const rows = await db.select().from(pageOptions).where(eq(pageOptions.active, true)).orderBy(asc(pageOptions.sortOrder), asc(pageOptions.createdAt));
    return rows.map(pageOptionDTO);
  });

  // Israeli localities & streets for the checkout address dropdowns (official registry, cached by the browser for a day)
  app.get('/geo/cities', async (_req, reply) => {
    reply.header('cache-control', 'public, max-age=86400');
    return israelAddresses().cities;
  });

  app.get<{ Querystring: { city?: string } }>('/geo/streets', async (req, reply) => {
    const code = Number(req.query.city);
    const geo = israelAddresses();
    if (!Number.isInteger(code) || !geo.cityName(code)) throw notFound('יישוב לא נמצא');
    reply.header('cache-control', 'public, max-age=86400');
    return geo.streetsOf(code);
  });

  app.post('/cart/quote', async (req) => {
    const input = parse(quoteSchema, req.body);
    const { pageTitles: _p, ...q } = await orders.quote(input.items, input.delivery);
    return q;
  });

  // Customer photo upload → returns an id + secret token. Only the token holder (and the admin) can see it.
  app.post('/uploads', { config: limit(40, 10) }, async (req) => {
    const file = await req.file();
    if (!file) throw new HttpError(400, 'NO_FILE', 'לא נבחר קובץ');
    const buf = await file.toBuffer();
    const roleField = file.fields.role as { value?: string } | undefined;
    const role = PHOTO_ROLES.find((r) => r === roleField?.value) ?? null;
    const jpg = await processCustomerPhoto(buf);
    const token = randomToken();
    const [up] = await db.insert(uploads).values({ tokenHash: sha256(token), fileKey: 'pending', role }).returning({ id: uploads.id });
    const key = `private/${up!.id}.jpg`;
    await storage.put(key, jpg);
    await db.update(uploads).set({ fileKey: key }).where(eq(uploads.id, up!.id));
    return { uploadId: up!.id, token };
  });

  app.get<{ Params: { id: string }; Querystring: { token?: string } }>('/uploads/:id/thumb', async (req, reply) => {
    const [up] = await db.select().from(uploads).where(eq(uploads.id, req.params.id));
    if (!up || up.deletedAt || !req.query.token || up.tokenHash !== sha256(req.query.token)) throw notFound('התמונה לא נמצאה');
    const buf = await thumbnail(await storage.get(up.fileKey));
    return reply.header('content-type', 'image/jpeg').header('cache-control', 'private, max-age=3600').send(buf);
  });

  app.post('/orders', { config: limit(15, 10) }, async (req) => {
    const input = parse(checkoutSchema, req.body);
    return orders.create(input, payments);
  });

  app.post('/contact', { config: limit(5, 10) }, async (req) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    // honeypot filled → pretend success, send nothing
    if (typeof body.website === 'string' && body.website.length > 0) return { ok: true };
    const input = parse(contactSchema, body);
    const [msg] = await db.insert(contactMessages).values({ subject: input.subject, email: input.email, message: input.message }).returning({ id: contactMessages.id });
    try {
      await notifier.contact(input);
      await db.update(contactMessages).set({ emailed: true }).where(and(eq(contactMessages.id, msg!.id)));
    } catch (err) {
      req.log.error({ err }, 'contact email failed');
      throw new HttpError(502, 'EMAIL_FAILED', 'לא הצלחנו לשלוח את ההודעה כרגע. נסו שוב או פנו אלינו בוואטסאפ.');
    }
    return { ok: true };
  });

  app.post('/consent', { config: limit(30, 1) }, async (req) => {
    const input = parse(consentSchema, req.body);
    await db.insert(consentLogs).values(input);
    return { ok: true };
  });
};
