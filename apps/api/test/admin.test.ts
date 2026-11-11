import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { consents, cookie, createAdmin, customer, login, makeApp, multipart, personalization, png, productBySlug, shipping, totp } from './helpers';

let app: FastifyInstance;
beforeAll(async () => {
  ({ app } = await makeApp());
});
afterAll(() => app.close());

const post = (url: string, payload: unknown, extra: object = {}) => app.inject({ method: 'POST', url, payload: payload as object, ...extra });

describe('admin login (password + authenticator code)', () => {
  it('every admin route refuses requests without a session', async () => {
    for (const [method, url] of [
      ['GET', '/api/admin/orders'],
      ['GET', '/api/admin/products'],
      ['PUT', '/api/admin/settings'],
      ['POST', '/api/admin/products'],
      ['GET', '/api/admin/uploads/x'],
      ['POST', '/api/admin/maintenance/purge-photos'],
    ] as const) {
      const r = await app.inject({ method, url, payload: method === 'GET' ? undefined : {} });
      expect(r.statusCode, `${method} ${url}`).toBe(401);
    }
  });

  it('wrong password → generic error (does not reveal whether the email exists)', async () => {
    const a = await createAdmin(app);
    const wrong = await post('/api/admin/auth/login', { email: a.email, password: 'nope-nope-nope' });
    const nobody = await post('/api/admin/auth/login', { email: 'ghost@test.co', password: 'nope-nope-nope' });
    expect(wrong.statusCode).toBe(401);
    expect(nobody.statusCode).toBe(401);
    expect(wrong.json().message).toBe(nobody.json().message);
  });

  it('a correct password alone does NOT log you in', async () => {
    const a = await createAdmin(app);
    const l = await post('/api/admin/auth/login', { email: a.email, password: a.password });
    expect(l.json()).toEqual({ step: 'totp' });
    expect(cookie(l, 'sid')).toBeUndefined();
    const pl = cookie(l, 'pl')!;
    expect(pl.httpOnly).toBe(true);
    expect(pl.sameSite).toBe('Strict');
    // pending cookie is not a session
    expect((await app.inject({ method: 'GET', url: '/api/admin/orders', cookies: { sid: pl.value } })).statusCode).toBe(401);
  });

  it('password + valid code → httpOnly session cookie + CSRF token', async () => {
    const a = await createAdmin(app);
    const l = await post('/api/admin/auth/login', { email: a.email, password: a.password });
    const v = await post('/api/admin/auth/verify', { code: totp(a.secret) }, { cookies: { pl: cookie(l, 'pl')!.value } });
    expect(v.statusCode).toBe(200);
    const sid = cookie(v, 'sid')!;
    expect(sid.httpOnly).toBe(true);
    expect(sid.sameSite).toBe('Strict');
    expect(sid.path).toBe('/api');
    const me = await app.inject({ method: 'GET', url: '/api/admin/auth/me', cookies: { sid: sid.value } });
    expect(me.json().email).toBe(a.email);
  });

  it('the same 6-digit code cannot be used twice', async () => {
    const a = await createAdmin(app);
    const code = totp(a.secret);
    const l1 = await post('/api/admin/auth/login', { email: a.email, password: a.password });
    expect((await post('/api/admin/auth/verify', { code }, { cookies: { pl: cookie(l1, 'pl')!.value } })).statusCode).toBe(200);
    const l2 = await post('/api/admin/auth/login', { email: a.email, password: a.password });
    const replay = await post('/api/admin/auth/verify', { code }, { cookies: { pl: cookie(l2, 'pl')!.value } });
    expect(replay.statusCode).toBe(401);
  });

  it('a backup code works exactly once', async () => {
    const a = await createAdmin(app);
    const code = a.backupCodes[0]!;
    const l1 = await post('/api/admin/auth/login', { email: a.email, password: a.password });
    expect((await post('/api/admin/auth/verify', { backupCode: code.toLowerCase() }, { cookies: { pl: cookie(l1, 'pl')!.value } })).statusCode).toBe(200);
    const l2 = await post('/api/admin/auth/login', { email: a.email, password: a.password });
    expect((await post('/api/admin/auth/verify', { backupCode: code }, { cookies: { pl: cookie(l2, 'pl')!.value } })).statusCode).toBe(401);
  });

  it('5 wrong passwords lock the account for 15 minutes (even the right password)', async () => {
    const a = await createAdmin(app);
    for (let i = 0; i < 5; i++) await post('/api/admin/auth/login', { email: a.email, password: 'wrong-password-' + i });
    const r = await post('/api/admin/auth/login', { email: a.email, password: a.password });
    expect(r.statusCode).toBe(423);
    expect(r.json().message).toMatch(/נעול/);
  });

  it('wrong codes also count towards the lock', async () => {
    const a = await createAdmin(app);
    const l = await post('/api/admin/auth/login', { email: a.email, password: a.password });
    const pl = cookie(l, 'pl')!.value;
    for (let i = 0; i < 5; i++) await post('/api/admin/auth/verify', { code: '000000' }, { cookies: { pl } });
    expect((await post('/api/admin/auth/login', { email: a.email, password: a.password })).statusCode).toBe(423);
  });

  it('changes need the CSRF token; logout ends the session on the server', async () => {
    const a = await createAdmin(app);
    const s = await login(app, a);
    const noCsrf = await app.inject({ method: 'PUT', url: '/api/admin/settings', payload: {}, cookies: s.cookies });
    expect(noCsrf.statusCode).toBe(403);
    expect((await app.inject({ method: 'GET', url: '/api/admin/settings', cookies: s.cookies })).statusCode).toBe(200);
    await app.inject({ method: 'POST', url: '/api/admin/auth/logout', cookies: s.cookies });
    expect((await app.inject({ method: 'GET', url: '/api/admin/settings', cookies: s.cookies })).statusCode).toBe(401);
  });
});

describe('admin: products', () => {
  let s: Awaited<ReturnType<typeof login>>;
  beforeAll(async () => {
    s = await login(app, await createAdmin(app));
  });

  it('a discount shows to shoppers and is what the cart charges', async () => {
    const p = await productBySlug(app, 'preset-3-5');
    const full = (await app.inject({ method: 'GET', url: `/api/admin/products/${p.id}`, ...s })).json();
    const r = await app.inject({ method: 'PUT', url: `/api/admin/products/${p.id}`, ...s, payload: { ...full, discountPrice: 27000, discountEndsAt: null } });
    expect(r.statusCode).toBe(200);
    const pub = (await app.inject({ method: 'GET', url: '/api/products/preset-3-5' })).json();
    expect(pub).toMatchObject({ price: 30000, discountPrice: 27000 });
    const q = (await post('/api/cart/quote', { delivery: 'PICKUP', items: [{ productId: p.id, quantity: 1 }] })).json();
    expect(q.lines[0]).toMatchObject({ unitPrice: 27000, regularUnitPrice: 30000 });
    // remove the discount again
    await app.inject({ method: 'PUT', url: `/api/admin/products/${p.id}`, ...s, payload: { ...full, discountPrice: null, discountEndsAt: null } });
    expect((await app.inject({ method: 'GET', url: '/api/products/preset-3-5' })).json().discountPrice).toBeNull();
  });

  it('discount must be lower than the price', async () => {
    const p = await productBySlug(app, 'preset-3-5');
    const full = (await app.inject({ method: 'GET', url: `/api/admin/products/${p.id}`, ...s })).json();
    const r = await app.inject({ method: 'PUT', url: `/api/admin/products/${p.id}`, ...s, payload: { ...full, discountPrice: 35000 } });
    expect(r.statusCode).toBe(400);
    expect(r.json().details[0].path).toBe('discountPrice');
  });

  it('creates a simple product, adds/reorders/deletes photos, hides and deletes it', async () => {
    const created = await app.inject({ method: 'POST', url: '/api/admin/products', ...s, payload: { title: 'מחזיק מוצץ', description: 'מלבד', price: 6000, discountPrice: null, discountEndsAt: null, active: true } });
    expect(created.statusCode).toBe(200);
    const prod = created.json();
    expect(prod.type).toBe('SIMPLE');

    for (const color of ['#ff0000', '#00ff00']) {
      const body = multipart({ alt: `תמונה ${color}` }, { name: 'a.png', type: 'image/png', data: await png(color) });
      const up = await app.inject({ method: 'POST', url: `/api/admin/products/${prod.id}/images`, ...body, cookies: s.cookies, headers: { ...body.headers, ...s.headers } });
      expect(up.statusCode).toBe(200);
    }
    let detail = (await app.inject({ method: 'GET', url: `/api/admin/products/${prod.id}`, ...s })).json();
    expect(detail.images).toHaveLength(2);
    expect((await app.inject({ method: 'GET', url: detail.images[0].url })).statusCode).toBe(200);

    const reversed = [...detail.images].reverse().map((i: { id: string }) => i.id);
    detail = (await app.inject({ method: 'PUT', url: `/api/admin/products/${prod.id}/images/order`, ...s, payload: { imageIds: reversed } })).json();
    expect(detail.images.map((i: { id: string }) => i.id)).toEqual(reversed);

    detail = (await app.inject({ method: 'DELETE', url: `/api/admin/images/${reversed[0]}`, ...s })).json();
    expect(detail.images).toHaveLength(1);

    expect((await app.inject({ method: 'GET', url: `/api/products/${prod.slug}` })).statusCode).toBe(200);
    await app.inject({ method: 'PUT', url: `/api/admin/products/${prod.id}`, ...s, payload: { ...detail, active: false } });
    expect((await app.inject({ method: 'GET', url: `/api/products/${prod.slug}` })).statusCode).toBe(404);

    expect((await app.inject({ method: 'DELETE', url: `/api/admin/products/${prod.id}`, ...s })).statusCode).toBe(200);
  });

  it('the custom book cannot be deleted (only hidden)', async () => {
    const p = await productBySlug(app, 'custom-book');
    expect((await app.inject({ method: 'DELETE', url: `/api/admin/products/${p.id}`, ...s })).statusCode).toBe(400);
  });

  it('a new product can ask for names + photos (personalized), and it can be switched later', async () => {
    const base = { title: 'ספר חיות אישי', description: 'ספר חדש', price: 25000, discountPrice: null, discountEndsAt: null, active: true };
    const created = (await app.inject({ method: 'POST', url: '/api/admin/products', ...s, payload: { ...base, personalized: true } })).json();
    expect(created.type).toBe('PRESET');
    // shoppers must now give names and photos for it
    const noNames = await app.inject({
      method: 'POST',
      url: '/api/orders',
      payload: { customer, delivery: shipping, consents, items: [{ productId: created.id, quantity: 1 }] },
    });
    expect(noNames.statusCode).toBe(400);
    expect(noNames.json().message).toMatch(/התאמה אישית/);
    const ok = await app.inject({
      method: 'POST',
      url: '/api/orders',
      payload: { customer, delivery: shipping, consents, items: [{ productId: created.id, quantity: 1, personalization: await personalization(app) }] },
    });
    expect(ok.statusCode).toBe(200);
    // switch to a plain product
    const plain = (await app.inject({ method: 'PUT', url: `/api/admin/products/${created.id}`, ...s, payload: { ...base, personalized: false } })).json();
    expect(plain.type).toBe('SIMPLE');
    // without the flag a new product is plain; personalized products can be deleted too
    expect((await app.inject({ method: 'POST', url: '/api/admin/products', ...s, payload: base })).json().type).toBe('SIMPLE');
    expect((await app.inject({ method: 'DELETE', url: `/api/admin/products/${created.id}`, ...s })).statusCode).toBe(200);
  });

  it('the custom book stays personalized whatever is sent', async () => {
    const p = await productBySlug(app, 'custom-book');
    const full = (await app.inject({ method: 'GET', url: `/api/admin/products/${p.id}`, ...s })).json();
    const r = (await app.inject({ method: 'PUT', url: `/api/admin/products/${p.id}`, ...s, payload: { ...full, personalized: false } })).json();
    expect(r.type).toBe('CUSTOM');
  });

  it('custom-book price tiers: validated, and drive the shop price', async () => {
    const p = await productBySlug(app, 'custom-book');
    const gap = await app.inject({ method: 'PUT', url: `/api/admin/products/${p.id}/pricing`, ...s, payload: { minPages: 10, maxPages: 15, tiers: [{ fromPage: 1, toPage: 10, pricePerPage: 3000 }, { fromPage: 12, toPage: 15, pricePerPage: 2500 }] } });
    expect(gap.statusCode).toBe(400);
    const ok = await app.inject({
      method: 'PUT',
      url: `/api/admin/products/${p.id}/pricing`,
      ...s,
      payload: { minPages: 8, maxPages: 16, tiers: [{ fromPage: 1, toPage: 8, pricePerPage: 3200 }, { fromPage: 9, toPage: 16, pricePerPage: 2600 }] },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().price).toBe(8 * 3200);
    expect(ok.json().pricing).toMatchObject({ minPages: 8, maxPages: 16 });
    // restore the original tiers
    await app.inject({
      method: 'PUT',
      url: `/api/admin/products/${p.id}/pricing`,
      ...s,
      payload: { minPages: 10, maxPages: 15, tiers: [{ fromPage: 1, toPage: 10, pricePerPage: 3000 }, { fromPage: 11, toPage: 13, pricePerPage: 2700 }, { fromPage: 14, toPage: 15, pricePerPage: 2500 }] },
    });
  });

  it('page catalog: add, edit, hide, delete', async () => {
    const created = await app.inject({ method: 'POST', url: '/api/admin/page-options', ...s, payload: { title: 'עמוד בדיקה', summary: 'תיאור', minAge: 2, maxAge: 4, active: true } });
    expect(created.statusCode).toBe(200);
    const id = created.json().id;
    expect((await app.inject({ method: 'GET', url: '/api/page-options' })).json().some((p: { id: string }) => p.id === id)).toBe(true);
    await app.inject({ method: 'PUT', url: `/api/admin/page-options/${id}`, ...s, payload: { title: 'עמוד בדיקה', summary: 'תיאור', minAge: 2, maxAge: 4, active: false } });
    expect((await app.inject({ method: 'GET', url: '/api/page-options' })).json().some((p: { id: string }) => p.id === id)).toBe(false);
    const bad = await app.inject({ method: 'PUT', url: `/api/admin/page-options/${id}`, ...s, payload: { title: 'x2', summary: 'yy', minAge: 5, maxAge: 2, active: true } });
    expect(bad.statusCode).toBe(400);
    expect((await app.inject({ method: 'DELETE', url: `/api/admin/page-options/${id}`, ...s })).statusCode).toBe(200);
  });

  it('About page: title/text edited in place, picture uploaded and removed', async () => {
    let r = await app.inject({ method: 'PATCH', url: '/api/admin/about', ...s, payload: { aboutTitle: 'נעים מאוד, אני שני' } });
    expect(r.statusCode).toBe(200);
    r = await app.inject({ method: 'PATCH', url: '/api/admin/about', ...s, payload: { aboutText: 'טקסט חדש על העסק ועל שני.' } });
    expect((await app.inject({ method: 'GET', url: '/api/settings' })).json()).toMatchObject({ aboutTitle: 'נעים מאוד, אני שני', aboutText: 'טקסט חדש על העסק ועל שני.' });
    expect((await app.inject({ method: 'PATCH', url: '/api/admin/about', ...s, payload: {} })).statusCode).toBe(400);
    expect((await app.inject({ method: 'PATCH', url: '/api/admin/about', payload: { aboutTitle: 'פריצה' } })).statusCode).toBe(401);

    const body = multipart({}, { name: 'shani.png', type: 'image/png', data: await png('#f8c33a') });
    const up = await app.inject({ method: 'POST', url: '/api/admin/about/image', ...body, cookies: s.cookies, headers: { ...body.headers, ...s.headers } });
    expect(up.statusCode).toBe(200);
    const url = up.json().aboutImageUrl as string;
    expect(url).toMatch(/^\/media\//);
    expect((await app.inject({ method: 'GET', url })).statusCode).toBe(200);
    const del = await app.inject({ method: 'DELETE', url: '/api/admin/about/image', ...s });
    expect(del.json().aboutImageUrl).toBeNull();
    expect((await app.inject({ method: 'GET', url })).statusCode).toBe(404);
  });

  it('settings: validated and public', async () => {
    const cur = (await app.inject({ method: 'GET', url: '/api/admin/settings', ...s })).json();
    const bad = await app.inject({ method: 'PUT', url: '/api/admin/settings', ...s, payload: { ...cur, ga4Id: 'UA-123' } });
    expect(bad.statusCode).toBe(400);
    const ok = await app.inject({ method: 'PUT', url: '/api/admin/settings', ...s, payload: { ...cur, shippingFee: 3500, taxStatus: 'MURSHE', whatsappNumber: '0501234567' } });
    expect(ok.statusCode).toBe(200);
    const pub = (await app.inject({ method: 'GET', url: '/api/settings' })).json();
    expect(pub).toMatchObject({ shippingFee: 3500, taxStatus: 'MURSHE', whatsappNumber: '0501234567' });
    const preset = await productBySlug(app, 'preset-1-3');
    const q = (await post('/api/cart/quote', { delivery: 'SHIPPING', items: [{ productId: preset.id, quantity: 1 }] })).json();
    expect(q.total).toBe(33500);
    expect(q.vatIncluded).toBe(Math.round(33500 - 33500 / 1.18));
    await app.inject({ method: 'PUT', url: '/api/admin/settings', ...s, payload: cur });
  });
});
