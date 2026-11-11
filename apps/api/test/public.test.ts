import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { EmailMessage } from '../src/lib/email';
import { makeApp, multipart, personalization, productBySlug, uploadPhoto } from './helpers';

let app: FastifyInstance;
let emails: EmailMessage[];

beforeAll(async () => {
  ({ app, emails } = await makeApp());
});
afterAll(() => app.close());

describe('catalog', () => {
  it('lists the 3 seeded products, custom book with its price tiers', async () => {
    const r = await app.inject({ method: 'GET', url: '/api/products' });
    expect(r.statusCode).toBe(200);
    const list = r.json() as { slug: string; type: string; price: number; pricing?: { minPages: number; maxPages: number } }[];
    const slugs = list.map((p) => p.slug);
    expect(slugs).toEqual(expect.arrayContaining(['preset-1-3', 'preset-3-5', 'custom-book']));
    const custom = list.find((p) => p.slug === 'custom-book')!;
    expect(custom.pricing).toMatchObject({ minPages: 10, maxPages: 15 });
    expect(list.find((p) => p.slug === 'preset-1-3')!.price).toBe(30000);
  });

  it('unknown product → 404 with a Hebrew message', async () => {
    const r = await app.inject({ method: 'GET', url: '/api/products/nope' });
    expect(r.statusCode).toBe(404);
    expect(r.json().message).toMatch(/לא נמצא/);
  });

  it('page catalog has at least 15 pages with age ranges', async () => {
    const pages = (await app.inject({ method: 'GET', url: '/api/page-options' })).json() as { minAge: number; maxAge: number }[];
    expect(pages.length).toBeGreaterThanOrEqual(15);
    expect(pages.every((p) => p.minAge <= p.maxAge)).toBe(true);
  });

  it('public settings never include secrets', async () => {
    const s = (await app.inject({ method: 'GET', url: '/api/settings' })).json();
    expect(s).toHaveProperty('taxStatus', 'PATUR');
    expect(JSON.stringify(s)).not.toMatch(/password|secret|token/i);
  });
});

describe('quote – the server decides the price', () => {
  it('custom book: 10 → ₪300, 13 → ₪381, 15 → ₪431 (+ ₪30 shipping)', async () => {
    const custom = await productBySlug(app, 'custom-book');
    const pages = ((await app.inject({ method: 'GET', url: '/api/page-options' })).json() as { id: string }[]).map((p) => p.id);
    for (const [n, price] of [
      [10, 30000],
      [13, 38100],
      [15, 43100],
    ] as const) {
      const q = (await app.inject({ method: 'POST', url: '/api/cart/quote', payload: { delivery: 'SHIPPING', items: [{ productId: custom.id, quantity: 1, pageIds: pages.slice(0, n) }] } })).json();
      expect(q.problems).toEqual([]);
      expect(q.subtotal).toBe(price);
      expect(q.total).toBe(price + 3000);
    }
  });

  it('reports a problem for fewer than 10 or duplicated pages', async () => {
    const custom = await productBySlug(app, 'custom-book');
    const pages = ((await app.inject({ method: 'GET', url: '/api/page-options' })).json() as { id: string }[]).map((p) => p.id);
    const few = (await app.inject({ method: 'POST', url: '/api/cart/quote', payload: { items: [{ productId: custom.id, quantity: 1, pageIds: pages.slice(0, 9) }] } })).json();
    expect(few.problems[0].message).toMatch(/10/);
    const dup = (await app.inject({ method: 'POST', url: '/api/cart/quote', payload: { items: [{ productId: custom.id, quantity: 1, pageIds: [...pages.slice(0, 9), pages[0]] }] } })).json();
    expect(dup.problems[0].message).toMatch(/פעמיים/);
  });

  it('pickup is free; unknown product is reported, not charged', async () => {
    const preset = await productBySlug(app, 'preset-1-3');
    const q = (await app.inject({ method: 'POST', url: '/api/cart/quote', payload: { delivery: 'PICKUP', items: [{ productId: preset.id, quantity: 2 }, { productId: 'ghost', quantity: 1 }] } })).json();
    expect(q.total).toBe(60000);
    expect(q.shipping).toBe(0);
    expect(q.problems).toEqual([{ index: 1, message: expect.stringMatching(/אינו זמין/) }]);
  });
});

describe('customer photo uploads', () => {
  it('accepts an image and returns a private id + token', async () => {
    const up = await uploadPhoto(app, 'CHILD');
    expect(up.token).toHaveLength(64);
    const ok = await app.inject({ method: 'GET', url: `/api/uploads/${up.uploadId}/thumb?token=${up.token}` });
    expect(ok.statusCode).toBe(200);
    expect(ok.headers['content-type']).toBe('image/jpeg');
    expect(String(ok.headers['cache-control'])).toMatch(/private/);
  });

  it('thumbnail needs the right token', async () => {
    const up = await uploadPhoto(app, 'CHILD');
    expect((await app.inject({ method: 'GET', url: `/api/uploads/${up.uploadId}/thumb` })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: `/api/uploads/${up.uploadId}/thumb?token=${'0'.repeat(64)}` })).statusCode).toBe(404);
  });

  it('rejects a non-image disguised as .jpg', async () => {
    const body = multipart({ role: 'CHILD' }, { name: 'x.jpg', type: 'image/jpeg', data: Buffer.from('#!/bin/sh\necho pwned') });
    const r = await app.inject({ method: 'POST', url: '/api/uploads', ...body });
    expect(r.statusCode).toBe(415);
    expect(r.json().message).toMatch(/JPG/);
  });

  it('customer photos are never served from /media', async () => {
    const up = await uploadPhoto(app, 'CHILD');
    expect((await app.inject({ method: 'GET', url: `/media/../private/${up.uploadId}.jpg` })).statusCode).not.toBe(200);
    expect((await app.inject({ method: 'GET', url: `/media/${up.uploadId}.jpg` })).statusCode).toBe(404);
  });
});

describe('contact form', () => {
  it('sends the message to the business email with reply-to the customer', async () => {
    const before = emails.length;
    const r = await app.inject({ method: 'POST', url: '/api/contact', payload: { subject: 'שאלה על ספר', email: 'dana@example.com', message: 'אפשר ספר לתאומים?', consent: true } });
    expect(r.statusCode).toBe(200);
    const mail = emails.at(-1)!;
    expect(emails.length).toBe(before + 1);
    expect(mail.to).toBe('shani@example.com');
    expect(mail.replyTo).toBe('dana@example.com');
    expect(mail.subject).toContain('שאלה על ספר');
  });

  it('escapes HTML in the message', async () => {
    await app.inject({ method: 'POST', url: '/api/contact', payload: { subject: 'x<script>', email: 'a@b.co', message: '<img src=x onerror=alert(1)>', consent: true } });
    expect(emails.at(-1)!.html).not.toContain('<img src=x');
  });

  it('honeypot: bots get "ok" but nothing is sent', async () => {
    const before = emails.length;
    const r = await app.inject({ method: 'POST', url: '/api/contact', payload: { subject: 'buy', email: 'bot@spam.co', message: 'spam spam', consent: true, website: 'http://spam' } });
    expect(r.statusCode).toBe(200);
    expect(emails.length).toBe(before);
  });

  it('requires consent and valid fields', async () => {
    const r = await app.inject({ method: 'POST', url: '/api/contact', payload: { subject: 'a', email: 'not-an-email', message: '', consent: false } });
    expect(r.statusCode).toBe(400);
    expect(r.json().details.map((d: { path: string }) => d.path)).toEqual(expect.arrayContaining(['subject', 'email', 'message', 'consent']));
  });
});

describe('cookie consent log', () => {
  it('stores an anonymous consent record', async () => {
    const r = await app.inject({ method: 'POST', url: '/api/consent', payload: { visitorId: crypto.randomUUID(), analytics: true, marketing: false } });
    expect(r.statusCode).toBe(200);
  });
});

describe('security basics', () => {
  it('blocks POSTs coming from another website (Origin check)', async () => {
    const r = await app.inject({ method: 'POST', url: '/api/contact', headers: { origin: 'https://evil.example' }, payload: {} });
    expect(r.statusCode).toBe(403);
  });
  it('sends security headers', async () => {
    const r = await app.inject({ method: 'GET', url: '/api/health' });
    expect(r.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(r.headers['x-content-type-options']).toBe('nosniff');
  });
  it('orders validate before touching the database', async () => {
    const r = await app.inject({ method: 'POST', url: '/api/orders', payload: { items: [] } });
    expect(r.statusCode).toBe(400);
  });
  it('a personalized order needs photos the customer actually uploaded', async () => {
    const preset = await productBySlug(app, 'preset-1-3');
    const p = await personalization(app);
    p.photos[0]!.token = 'f'.repeat(64);
    const r = await app.inject({
      method: 'POST',
      url: '/api/orders',
      payload: {
        customer: { fullName: 'אבי', phone: '0521234567', email: 'a@b.co' },
        delivery: { method: 'PICKUP' },
        consents: { terms: true, photos: true, marketing: false },
        items: [{ productId: preset.id, quantity: 1, personalization: p }],
      },
    });
    expect(r.statusCode).toBe(400);
    expect(r.json().error).toBe('PHOTO_EXPIRED');
  });
});
