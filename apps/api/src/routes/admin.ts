import {
  aboutSchema,
  customBookPrice,
  imageOrderSchema,
  ORDER_STATUSES,
  pageOptionSchema,
  PricingError,
  pricingSchema,
  productUpdateSchema,
  settingsSchema,
  statusUpdateSchema,
  validateTiers,
  type OrderStatus,
} from '@shani/shared';
import { asc, eq } from 'drizzle-orm';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { pageOptions, pricingTiers, productImages, products, settings } from '../db/schema';
import { HttpError, notFound, parse } from '../lib/http';
import { processPublicImage } from '../lib/images';
import { findProduct, getSettings, listProducts, pageOptionDTO, productDTO, settingsDTO } from '../services/catalog';
import { requireAdmin } from './auth';

async function readImage(req: FastifyRequest) {
  const file = await req.file();
  if (!file) throw new HttpError(400, 'NO_FILE', 'לא נבחר קובץ');
  const buf = await processPublicImage(await file.toBuffer());
  const alt = (file.fields.alt as { value?: string } | undefined)?.value?.slice(0, 200) ?? '';
  return { buf, alt };
}

const newKey = () => `public/${Date.now().toString(36)}${randomBytes(6).toString('hex')}.webp`;

export const adminRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requireAdmin);
  const { db, storage, orders } = app.ctx;

  const loadProduct = async (id: string) => {
    const p = await findProduct(db, { id });
    if (!p) throw notFound('המוצר לא נמצא');
    return p;
  };
  const loadPage = async (id: string) => {
    const [o] = await db.select().from(pageOptions).where(eq(pageOptions.id, id));
    if (!o) throw notFound('העמוד לא נמצא');
    return o;
  };

  // ---------------- products ----------------
  app.get('/products', async () => (await listProducts(db, false)).map(productDTO));

  app.get<{ Params: { id: string } }>('/products/:id', async (req) => productDTO(await loadProduct(req.params.id)));

  // New product: with personalization (names + photos, like the preset books) or a plain product
  app.post('/products', async (req) => {
    const { personalized, ...input } = parse(productUpdateSchema, req.body);
    const [p] = await db
      .insert(products)
      .values({
        ...input,
        discountEndsAt: input.discountEndsAt ? new Date(input.discountEndsAt) : null,
        type: personalized ? 'PRESET' : 'SIMPLE',
        slug: `item-${randomBytes(4).toString('hex')}`,
      })
      .returning({ id: products.id });
    return productDTO(await loadProduct(p!.id));
  });

  app.put<{ Params: { id: string } }>('/products/:id', async (req) => {
    const existing = await loadProduct(req.params.id);
    const input = parse(productUpdateSchema, req.body);
    // the custom book's price comes from the page price tiers, not from a fixed price
    const priceFields =
      existing.type === 'CUSTOM'
        ? {}
        : { price: input.price, discountPrice: input.discountPrice, discountEndsAt: input.discountEndsAt ? new Date(input.discountEndsAt) : null };
    // personalization can be switched on/off for any product except the custom book (always personalized)
    const typeField = existing.type !== 'CUSTOM' && input.personalized !== undefined ? { type: input.personalized ? ('PRESET' as const) : ('SIMPLE' as const) } : {};
    await db
      .update(products)
      .set({ title: input.title, description: input.description, ageLabel: input.ageLabel, active: input.active, sortOrder: input.sortOrder, ...priceFields, ...typeField })
      .where(eq(products.id, existing.id));
    return productDTO(await loadProduct(existing.id));
  });

  app.delete<{ Params: { id: string } }>('/products/:id', async (req) => {
    const p = await loadProduct(req.params.id);
    if (p.type === 'CUSTOM') throw new HttpError(400, 'NOT_DELETABLE', 'הספר בהרכבה אישית לא נמחק – אפשר להסתיר אותו מהחנות');
    for (const img of p.images) await storage.remove(img.fileKey);
    await db.delete(products).where(eq(products.id, p.id));
    return { ok: true };
  });

  app.post<{ Params: { id: string } }>('/products/:id/images', async (req) => {
    const p = await loadProduct(req.params.id);
    const { buf, alt } = await readImage(req);
    const key = newKey();
    await storage.put(key, buf);
    await db.insert(productImages).values({ productId: p.id, fileKey: key, alt, sortOrder: p.images.length });
    return productDTO(await loadProduct(p.id));
  });

  app.put<{ Params: { id: string } }>('/products/:id/images/order', async (req) => {
    const p = await loadProduct(req.params.id);
    const { imageIds } = parse(imageOrderSchema, req.body);
    const own = new Set(p.images.map((i) => i.id));
    if (imageIds.length !== own.size || imageIds.some((id) => !own.has(id))) throw new HttpError(400, 'BAD_ORDER', 'רשימת תמונות לא תקינה');
    await db.transaction(async (tx) => {
      for (const [i, id] of imageIds.entries()) await tx.update(productImages).set({ sortOrder: i }).where(eq(productImages.id, id));
    });
    return productDTO(await loadProduct(p.id));
  });

  app.patch<{ Params: { imageId: string } }>('/images/:imageId', async (req) => {
    const { alt } = parse(z.object({ alt: z.string().trim().max(200) }), req.body);
    const [img] = await db.update(productImages).set({ alt }).where(eq(productImages.id, req.params.imageId)).returning();
    if (!img) throw notFound('התמונה לא נמצאה');
    return productDTO(await loadProduct(img.productId));
  });

  app.delete<{ Params: { imageId: string } }>('/images/:imageId', async (req) => {
    const [img] = await db.delete(productImages).where(eq(productImages.id, req.params.imageId)).returning();
    if (!img) throw notFound('התמונה לא נמצאה');
    await storage.remove(img.fileKey);
    return productDTO(await loadProduct(img.productId));
  });

  app.put<{ Params: { id: string } }>('/products/:id/pricing', async (req) => {
    const p = await loadProduct(req.params.id);
    if (p.type !== 'CUSTOM') throw new HttpError(400, 'NOT_CUSTOM', 'מדרגות מחיר קיימות רק לספר בהרכבה אישית');
    const input = parse(pricingSchema, req.body);
    try {
      validateTiers(input);
    } catch (e) {
      if (e instanceof PricingError) throw new HttpError(400, 'VALIDATION', e.message);
      throw e;
    }
    await db.transaction(async (tx) => {
      await tx.delete(pricingTiers).where(eq(pricingTiers.productId, p.id));
      await tx.insert(pricingTiers).values(input.tiers.map((t) => ({ ...t, productId: p.id })));
      // "from" price shown in the shop = price of the minimum book
      await tx
        .update(products)
        .set({ minPages: input.minPages, maxPages: input.maxPages, price: customBookPrice(input.minPages, input) })
        .where(eq(products.id, p.id));
    });
    return productDTO(await loadProduct(p.id));
  });

  // ---------------- custom-book page catalog ----------------
  app.get('/page-options', async () => {
    const rows = await db.select().from(pageOptions).orderBy(asc(pageOptions.sortOrder), asc(pageOptions.createdAt));
    return rows.map(pageOptionDTO);
  });

  app.post('/page-options', async (req) => {
    const [o] = await db.insert(pageOptions).values(parse(pageOptionSchema, req.body)).returning();
    return pageOptionDTO(o!);
  });

  app.put<{ Params: { id: string } }>('/page-options/:id', async (req) => {
    const data = parse(pageOptionSchema, req.body);
    const [o] = await db.update(pageOptions).set(data).where(eq(pageOptions.id, req.params.id)).returning();
    if (!o) throw notFound('העמוד לא נמצא');
    return pageOptionDTO(o);
  });

  app.delete<{ Params: { id: string } }>('/page-options/:id', async (req) => {
    const o = await loadPage(req.params.id);
    if (o.imageKey) await storage.remove(o.imageKey);
    await db.delete(pageOptions).where(eq(pageOptions.id, o.id));
    return { ok: true };
  });

  app.post<{ Params: { id: string } }>('/page-options/:id/image', async (req) => {
    const o = await loadPage(req.params.id);
    const { buf } = await readImage(req);
    const key = newKey();
    await storage.put(key, buf);
    if (o.imageKey) await storage.remove(o.imageKey);
    const [updated] = await db.update(pageOptions).set({ imageKey: key }).where(eq(pageOptions.id, o.id)).returning();
    return pageOptionDTO(updated!);
  });

  // ---------------- orders ----------------
  app.get<{ Querystring: { status?: string; q?: string; page?: string } }>('/orders', async (req) => {
    const status = ORDER_STATUSES.find((s) => s === req.query.status) as OrderStatus | undefined;
    return orders.list({ status, q: req.query.q, page: Number(req.query.page) || 1 });
  });

  app.get<{ Params: { id: string } }>('/orders/:id', async (req) => orders.detail(req.params.id));

  app.post<{ Params: { id: string } }>('/orders/:id/status', async (req) => {
    const { status, notifyCustomer } = parse(statusUpdateSchema, req.body);
    await orders.setStatus(req.params.id, status, notifyCustomer);
    return orders.detail(req.params.id);
  });

  // customer photo (admin only); ?download=1 to save it
  app.get<{ Params: { id: string }; Querystring: { download?: string } }>('/uploads/:id', async (req, reply) => {
    const up = await db.query.uploads.findFirst({
      where: (u, { eq: e }) => e(u.id, req.params.id),
      with: { orderItem: { with: { order: { columns: { number: true } } } } },
    });
    if (!up || up.deletedAt) throw notFound('התמונה לא נמצאה או נמחקה');
    const buf = await storage.get(up.fileKey);
    reply.header('content-type', 'image/jpeg').header('cache-control', 'private, no-store');
    if (req.query.download) {
      const n = up.orderItem?.order.number ?? 'photo';
      const role = up.role === 'PARENTS' ? 'parents' : 'child';
      reply.header('content-disposition', `attachment; filename="order-${n}-${role}-${up.id.slice(-6)}.jpg"`);
    }
    return reply.send(buf);
  });

  // ---------------- settings & maintenance ----------------
  app.get('/settings', async () => settingsDTO(await getSettings(db)));

  app.put('/settings', async (req) => {
    const data = parse(settingsSchema, req.body);
    await getSettings(db);
    const [s] = await db.update(settings).set(data).where(eq(settings.id, 1)).returning();
    return settingsDTO(s!);
  });

  // About page – edited in place on the page itself
  app.patch('/about', async (req) => {
    const data = parse(aboutSchema, req.body);
    await getSettings(db);
    const [s] = await db.update(settings).set(data).where(eq(settings.id, 1)).returning();
    return settingsDTO(s!);
  });

  app.post('/about/image', async (req) => {
    const current = await getSettings(db);
    const { buf } = await readImage(req);
    const key = newKey();
    await storage.put(key, buf);
    if (current.aboutImageKey) await storage.remove(current.aboutImageKey);
    const [s] = await db.update(settings).set({ aboutImageKey: key }).where(eq(settings.id, 1)).returning();
    return settingsDTO(s!);
  });

  app.delete('/about/image', async () => {
    const current = await getSettings(db);
    if (current.aboutImageKey) await storage.remove(current.aboutImageKey);
    const [s] = await db.update(settings).set({ aboutImageKey: null }).where(eq(settings.id, 1)).returning();
    return settingsDTO(s!);
  });

  app.post('/maintenance/purge-photos', async () => {
    const s = await getSettings(db);
    return orders.purgePhotos(s.photoRetentionDays);
  });
};
