import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { contactMessages, orders, orderStatusEvents, uploads } from '../src/db/schema';
import type { EmailMessage } from '../src/lib/email';
import { MockPaymentProvider } from '../src/lib/payments';
import { consents, createAdmin, customer, login, makeApp, payOrder, personalization, placeOrder, productBySlug, shipping } from './helpers';

let app: FastifyInstance;
let emails: EmailMessage[];
let admin: Awaited<ReturnType<typeof login>>;

beforeAll(async () => {
  ({ app, emails } = await makeApp());
  admin = await login(app, await createAdmin(app));
});
afterAll(() => app.close());

describe('placing an order', () => {
  it('charges the server price even if the browser sends other numbers', async () => {
    const preset = await productBySlug(app, 'preset-1-3');
    const r = await app.inject({
      method: 'POST',
      url: '/api/orders',
      payload: { customer, delivery: shipping, consents, items: [{ productId: preset.id, quantity: 2, unitPrice: 1, personalization: await personalization(app) }], total: 1 },
    });
    expect(r.statusCode).toBe(200);
    expect(r.json().total).toBe(2 * 30000 + 3000);
  });

  it('starts as "waiting for payment" and sends the customer to the payment page', async () => {
    const o = await placeOrder(app);
    expect(o.redirectUrl).toMatch(/\/api\/payments\/mock\//);
    const [row] = await app.ctx.db.select().from(orders).where(eq(orders.id, o.orderId));
    expect(row!.status).toBe('PENDING_PAYMENT');
    expect(row!.termsAcceptedAt).toBeInstanceOf(Date);
    expect(row!.photosConsentAt).toBeInstanceOf(Date);
  });

  it('a photo cannot be reused in a second order', async () => {
    const preset = await productBySlug(app, 'preset-1-3');
    const p = await personalization(app);
    const body = { customer, delivery: shipping, consents, items: [{ productId: preset.id, quantity: 1, personalization: p }] };
    expect((await app.inject({ method: 'POST', url: '/api/orders', payload: body })).statusCode).toBe(200);
    const again = await app.inject({ method: 'POST', url: '/api/orders', payload: body });
    expect(again.statusCode).toBe(400);
    expect(again.json().error).toBe('PHOTO_EXPIRED');
  });

  it('requires the photo consent when photos are used', async () => {
    const preset = await productBySlug(app, 'preset-1-3');
    const r = await app.inject({
      method: 'POST',
      url: '/api/orders',
      payload: { customer, delivery: shipping, consents: { terms: true, photos: false, marketing: false }, items: [{ productId: preset.id, quantity: 1, personalization: await personalization(app) }] },
    });
    expect(r.statusCode).toBe(400);
    expect(r.json().details[0].path).toBe('consents.photos');
  });

  it('a custom book order stores the chosen pages', async () => {
    const custom = await productBySlug(app, 'custom-book');
    const pageIds = ((await app.inject({ method: 'GET', url: '/api/page-options' })).json() as { id: string }[]).slice(0, 12).map((p) => p.id);
    const r = await app.inject({
      method: 'POST',
      url: '/api/orders',
      payload: { customer, delivery: { method: 'PICKUP' }, consents, items: [{ productId: custom.id, quantity: 1, pageIds, personalization: await personalization(app) }] },
    });
    expect(r.statusCode).toBe(200);
    expect(r.json().total).toBe(35400);
    const detail = (await app.inject({ method: 'GET', url: `/api/admin/orders/${r.json().orderId}`, ...admin })).json();
    expect(detail.items[0].pages).toHaveLength(12);
    expect(detail.items[0].title).toContain('12 עמודים');
    expect(detail.items[0].photos.map((p: { role: string }) => p.role).sort()).toEqual(['CHILD', 'PARENTS']);
  });
});

describe('delivery address (official locality + street list)', () => {
  it('stores the official names, the house number and the flat', async () => {
    const o = await placeOrder(app, { delivery: { ...shipping, city: 'כל שם שהדפדפן שלח', street: 'הרצל' } });
    const [row] = await app.ctx.db.select().from(orders).where(eq(orders.id, o.orderId));
    expect(row).toMatchObject({ cityCode: 4000, city: 'חיפה', street: 'הרצל', houseNumber: '12', apartment: '4' });
  });

  it('rejects an unknown locality and a street that is not in that locality', async () => {
    const badCity = await app.inject({ method: 'POST', url: '/api/orders', payload: { customer, consents, delivery: { ...shipping, cityCode: 999999 }, items: [] } });
    expect(badCity.statusCode).toBe(400);
    const preset = await productBySlug(app, 'preset-1-3');
    const badStreet = await app.inject({
      method: 'POST',
      url: '/api/orders',
      payload: { customer, consents, delivery: { ...shipping, street: 'רחוב שלא קיים בחיפה' }, items: [{ productId: preset.id, quantity: 1, personalization: await personalization(app) }] },
    });
    expect(badStreet.statusCode).toBe(400);
    expect(badStreet.json().details[0].path).toBe('delivery.street');
  });

  it('house number must be digits', async () => {
    const r = await app.inject({ method: 'POST', url: '/api/orders', payload: { customer, consents, delivery: { ...shipping, houseNumber: '12; DROP' }, items: [] } });
    expect(r.statusCode).toBe(400);
  });

  it('serves the locality list and the streets of a locality', async () => {
    const cities = (await app.inject({ method: 'GET', url: '/api/geo/cities' })).json() as { code: number; name: string }[];
    expect(cities.length).toBeGreaterThan(1200);
    expect(cities).toContainEqual({ code: 4000, name: 'חיפה' });
    const streets = (await app.inject({ method: 'GET', url: '/api/geo/streets?city=4000' })).json() as string[];
    expect(streets).toContain('הרצל');
    expect((await app.inject({ method: 'GET', url: '/api/geo/streets?city=abc' })).statusCode).toBe(404);
  });
});

describe('SQL injection', () => {
  const evil = "'); DROP TABLE orders; --";
  it('names with code are rejected by validation', async () => {
    const r = await app.inject({ method: 'POST', url: '/api/orders', payload: { customer: { ...customer, fullName: evil }, consents, delivery: shipping, items: [] } });
    expect(r.statusCode).toBe(400);
  });
  it('free text (notes, contact message) is stored as plain text and never executed', async () => {
    const o = await placeOrder(app, { delivery: { ...shipping, notes: evil } });
    const [row] = await app.ctx.db.select().from(orders).where(eq(orders.id, o.orderId));
    expect(row!.notes).toBe(evil);
    await app.inject({ method: 'POST', url: '/api/contact', payload: { subject: 'בדיקה', email: 'a@b.co', message: evil, consent: true } });
    const msgs = await app.ctx.db.select().from(contactMessages).where(eq(contactMessages.message, evil));
    expect(msgs).toHaveLength(1);
    // the table is still there
    expect((await app.ctx.db.select().from(orders)).length).toBeGreaterThan(0);
  });
  it('search input is a parameter, not SQL', async () => {
    const r = await app.inject({ method: 'GET', url: `/api/admin/orders?q=${encodeURIComponent("%' OR 1=1 --")}`, ...admin });
    expect(r.statusCode).toBe(200);
    expect(r.json().orders).toHaveLength(0);
  });
});

describe('payment', () => {
  it('mock payment page needs a valid signature', async () => {
    const o = await placeOrder(app);
    const u = new URL(o.redirectUrl);
    expect((await app.inject({ method: 'GET', url: u.pathname + u.search })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: u.pathname + '?sig=bad' })).statusCode).toBe(404);
  });

  it('paying marks the order PAID, redirects to the thank-you page and sends 2 emails', async () => {
    const o = await placeOrder(app);
    const before = emails.length;
    const r = await payOrder(app, o.redirectUrl);
    expect(r.statusCode).toBe(303);
    expect(r.headers.location).toBe(`http://web.test/checkout/success?order=${o.number}`);
    const [row] = await app.ctx.db.select().from(orders).where(eq(orders.id, o.orderId));
    expect(row!.status).toBe('PAID');
    expect(row!.paidAt).toBeInstanceOf(Date);
    const sent = emails.slice(before);
    expect(sent.map((m) => m.to).sort()).toEqual(['michal@example.com', 'shani@example.com']);
    expect(sent.find((m) => m.to === 'michal@example.com')!.subject).toContain(String(o.number));
  });

  it('cancel on the payment page keeps the order unpaid', async () => {
    const o = await placeOrder(app);
    const u = new URL(o.redirectUrl);
    const r = await app.inject({ method: 'POST', url: u.pathname, payload: `sig=${u.searchParams.get('sig')}&action=cancel`, headers: { 'content-type': 'application/x-www-form-urlencoded' } });
    expect(r.headers.location).toBe('http://web.test/checkout/cancelled');
    const [row] = await app.ctx.db.select().from(orders).where(eq(orders.id, o.orderId));
    expect(row!.status).toBe('PENDING_PAYMENT');
  });

  it('webhook: forged notifications are rejected; real ones are applied once', async () => {
    const o = await placeOrder(app);
    const forged = await app.inject({ method: 'POST', url: '/api/payments/webhook/mock', payload: { orderId: o.orderId, outcome: 'PAID', ref: 'X' }, headers: { 'x-mock-signature': 'deadbeef' } });
    expect(forged.statusCode).toBe(401);
    const mock = app.ctx.payments as MockPaymentProvider;
    const body = { orderId: o.orderId, outcome: 'PAID' as const, ref: 'TXN-1' };
    const before = emails.length;
    for (let i = 0; i < 2; i++) {
      const ok = await app.inject({ method: 'POST', url: '/api/payments/webhook/mock', payload: body, headers: { 'x-mock-signature': mock.signWebhook(body), origin: 'https://payments.example' } });
      expect(ok.statusCode).toBe(200);
    }
    expect(emails.length - before).toBe(2); // not 4 – idempotent
    const events = await app.ctx.db.select().from(orderStatusEvents).where(eq(orderStatusEvents.orderId, o.orderId));
    expect(events.filter((e) => e.status === 'PAID')).toHaveLength(1);
  });
});

describe('admin: managing orders', () => {
  it('lists orders with counts per status and filters by status', async () => {
    const o = await placeOrder(app);
    await payOrder(app, o.redirectUrl);
    const all = (await app.inject({ method: 'GET', url: '/api/admin/orders', ...admin })).json();
    expect(all.counts.PAID).toBeGreaterThanOrEqual(1);
    const paid = (await app.inject({ method: 'GET', url: '/api/admin/orders?status=PAID', ...admin })).json();
    expect(paid.orders.every((x: { status: string }) => x.status === 'PAID')).toBe(true);
    expect(paid.orders.some((x: { id: string }) => x.id === o.orderId)).toBe(true);
  });

  it('unfinished checkouts (never paid) are not shown to the admin', async () => {
    const unpaid = await placeOrder(app, { customer: { ...customer, fullName: 'לא שילמה' } });
    const r = (await app.inject({ method: 'GET', url: `/api/admin/orders?q=${unpaid.number}`, ...admin })).json();
    expect(r.orders).toHaveLength(0);
    const all = (await app.inject({ method: 'GET', url: '/api/admin/orders', ...admin })).json();
    expect(all.counts.PENDING_PAYMENT).toBeUndefined();
    expect(all.orders.every((x: { status: string }) => x.status !== 'PENDING_PAYMENT')).toBe(true);
  });

  it('search finds by order number and by name', async () => {
    const o = await placeOrder(app, { customer: { ...customer, fullName: 'זהבה ייחודית' } });
    await payOrder(app, o.redirectUrl);
    const byNum = (await app.inject({ method: 'GET', url: `/api/admin/orders?q=${o.number}`, ...admin })).json();
    expect(byNum.orders.map((x: { id: string }) => x.id)).toContain(o.orderId);
    const byName = (await app.inject({ method: 'GET', url: `/api/admin/orders?q=${encodeURIComponent('ייחודית')}`, ...admin })).json();
    expect(byName.orders).toHaveLength(1);
  });

  it('in progress → out for delivery, with history and an optional customer email', async () => {
    const o = await placeOrder(app);
    await payOrder(app, o.redirectUrl);
    const before = emails.length;
    let r = await app.inject({ method: 'POST', url: `/api/admin/orders/${o.orderId}/status`, payload: { status: 'IN_PROGRESS', notifyCustomer: false }, ...admin });
    expect(r.json().status).toBe('IN_PROGRESS');
    expect(emails.length).toBe(before);
    r = await app.inject({ method: 'POST', url: `/api/admin/orders/${o.orderId}/status`, payload: { status: 'SHIPPED', notifyCustomer: true }, ...admin });
    expect(r.json().status).toBe('SHIPPED');
    expect(r.json().history.map((h: { status: string }) => h.status)).toEqual(['PENDING_PAYMENT', 'PAID', 'IN_PROGRESS', 'SHIPPED']);
    expect(emails.at(-1)!.subject).toContain('יצאה למשלוח');
  });

  it('cannot move an order back to "waiting for payment"', async () => {
    const o = await placeOrder(app);
    const r = await app.inject({ method: 'POST', url: `/api/admin/orders/${o.orderId}/status`, payload: { status: 'PENDING_PAYMENT' }, ...admin });
    expect(r.statusCode).toBe(400);
  });

  it('admin can view and download the customer photos; others cannot', async () => {
    const o = await placeOrder(app);
    const detail = (await app.inject({ method: 'GET', url: `/api/admin/orders/${o.orderId}`, ...admin })).json();
    const url = detail.items[0].photos[0].url as string;
    const ok = await app.inject({ method: 'GET', url: url + '?download=1', ...admin });
    expect(ok.statusCode).toBe(200);
    expect(ok.headers['content-disposition']).toMatch(new RegExp(`order-${o.number}-`));
    expect((await app.inject({ method: 'GET', url })).statusCode).toBe(401);
  });
});

describe('privacy: deleting old photos', () => {
  it('deletes photos of orders shipped more than N days ago, keeps recent ones', async () => {
    const old = await placeOrder(app);
    await payOrder(app, old.redirectUrl);
    await app.ctx.orders.setStatus(old.orderId, 'SHIPPED', false);
    const recent = await placeOrder(app);
    await payOrder(app, recent.redirectUrl);
    await app.ctx.orders.setStatus(recent.orderId, 'SHIPPED', false);
    // pretend the first order shipped 61 days ago
    const longAgo = new Date(Date.now() - 61 * 86_400_000);
    await app.ctx.db.update(orderStatusEvents).set({ createdAt: longAgo }).where(eq(orderStatusEvents.orderId, old.orderId));

    const r = await app.ctx.orders.purgePhotos(60);
    expect(r.photos).toBeGreaterThanOrEqual(2);
    const oldDetail = (await app.inject({ method: 'GET', url: `/api/admin/orders/${old.orderId}`, ...admin })).json();
    expect(oldDetail.photosDeletedAt).not.toBeNull();
    expect(oldDetail.items[0].photos).toHaveLength(0);
    const recentDetail = (await app.inject({ method: 'GET', url: `/api/admin/orders/${recent.orderId}`, ...admin })).json();
    expect(recentDetail.items[0].photos).toHaveLength(2);
  });

  it('deletes unfinished checkouts (and their photos) after 7 days, keeps recent ones', async () => {
    const old = await placeOrder(app);
    const fresh = await placeOrder(app);
    await app.ctx.db.update(orders).set({ createdAt: new Date(Date.now() - 8 * 86_400_000) }).where(eq(orders.id, old.orderId));
    const r = await app.ctx.orders.purgePhotos(60);
    expect(r.abandonedCheckoutsDeleted).toBeGreaterThanOrEqual(1);
    expect(await app.ctx.db.select().from(orders).where(eq(orders.id, old.orderId))).toHaveLength(0);
    expect(await app.ctx.db.select().from(orders).where(eq(orders.id, fresh.orderId))).toHaveLength(1);
  });

  it('deletes uploads that never became an order after 2 days', async () => {
    const { uploadPhoto } = await import('./helpers');
    const up = await uploadPhoto(app, 'CHILD');
    await app.ctx.db.update(uploads).set({ createdAt: new Date(Date.now() - 3 * 86_400_000) }).where(eq(uploads.id, up.uploadId));
    await app.ctx.orders.purgePhotos(60);
    const rows = await app.ctx.db.select().from(uploads).where(eq(uploads.id, up.uploadId));
    expect(rows).toHaveLength(0);
  });
});
