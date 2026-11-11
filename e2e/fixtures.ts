import { test as base, expect, type APIRequestContext, type Page } from '@playwright/test';
import { authenticator } from 'otplib';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { E2E } from './constants';

/**
 * By default every test starts with cookie consent already answered ("necessary only"),
 * so the banner doesn't cover the page. Tests about the banner opt out with test.use({ consent: 'unset' }).
 */
export const test = base.extend<{ consent: 'necessary' | 'unset' }>({
  consent: ['necessary', { option: true }],
  page: async ({ page, consent }, use) => {
    if (consent === 'necessary') {
      await page.addInitScript(() => {
        if (!localStorage.getItem('shani:consent')) {
          localStorage.setItem('shani:consent', JSON.stringify({ decided: true, analytics: false, marketing: false, visitorId: '11111111-1111-4111-8111-111111111111', version: 1 }));
        }
      });
    }
    await use(page);
  },
});
export { expect };

export const fixture = (name: string) => path.join(E2E.fixtures, name);

/** Authenticator code for the test admin (offset in 30s steps). */
export const adminCode = (stepOffset = 0) => authenticator.clone({ epoch: Date.now() + stepOffset * 30_000 }).generate(E2E.totpSecret);
export const backupCodes = (): string[] => JSON.parse(readFileSync(E2E.backupCodesFile, 'utf8'));

/** Emails "sent" by the server (file transport). */
export function outbox(): { to: string; subject: string; text: string }[] {
  try {
    return readdirSync(E2E.outbox)
      .filter((f) => f.endsWith('.json'))
      .sort()
      .map((f) => JSON.parse(readFileSync(path.join(E2E.outbox, f), 'utf8')));
  } catch {
    return [];
  }
}

/** On phones the menu is folded behind ☰ – open it first when needed. */
export async function navTo(page: Page, label: string) {
  const menu = page.getByRole('button', { name: 'פתיחת תפריט' });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole('navigation', { name: 'תפריט ראשי' }).filter({ visible: true }).getByRole('link', { name: label, exact: true }).click();
}

export async function fillPersonalization(page: Page, names = { child: 'נועם', parent: 'מיכל' }) {
  await page.getByLabel('שם הילד/ה', { exact: true }).fill(names.child);
  await page.getByLabel('שם הורה', { exact: true }).fill(names.parent);
  await page.getByTestId('upload-CHILD').setInputFiles(fixture('child.png'));
  await expect(page.getByRole('img', { name: 'תמונת הילד/ה שהועלתה' })).toBeVisible();
  await page.getByTestId('upload-PARENTS').setInputFiles(fixture('parents.png'));
  await expect(page.getByRole('img', { name: 'תמונת ההורים שהועלתה' })).toBeVisible();
  await page.getByRole('checkbox', { name: /אני מאשר\/ת שימוש בתמונות/ }).check();
}

/** City → street (searchable dropdowns from the official list) → house number. */
export async function fillAddress(page: Page, city = 'חיפה', street = 'הרצל', house = '12') {
  const c = page.getByRole('combobox', { name: 'יישוב' });
  await c.fill(city.slice(0, 3));
  await page.getByRole('option', { name: city, exact: true }).click();
  const s = page.getByRole('combobox', { name: 'רחוב' });
  await expect(s).toBeEnabled();
  await s.fill(street);
  await page.getByRole('option', { name: street, exact: true }).click();
  await page.getByLabel('מספר בית', { exact: true }).fill(house);
}

/** Unique, letters-only test name (names may not contain digits). */
export const uniqueName = (prefix: string) => `${prefix} ${Array.from({ length: 6 }, () => 'אבגדהוזחטיכלמנסעפצקרשת'[Math.floor(Math.random() * 22)]).join('')}`;

/** Creates a paid order straight through the API (for admin tests). */
export async function createPaidOrder(request: APIRequestContext, fullName = 'לקוחה בדיקה') {
  const product = await (await request.get('/api/products/preset-1-3')).json();
  const photos = [];
  for (const role of ['CHILD', 'PARENTS'] as const) {
    const r = await request.post('/api/uploads', { multipart: { role, file: { name: `${role}.png`, mimeType: 'image/png', buffer: readFileSync(fixture(role === 'CHILD' ? 'child.png' : 'parents.png')) } } });
    expect(r.ok()).toBeTruthy();
    photos.push({ ...(await r.json()), role });
  }
  const order = await request.post('/api/orders', {
    data: {
      customer: { fullName, phone: '0521112233', email: 'customer@e2e.test' },
      delivery: { method: 'SHIPPING', cityCode: 4000, city: 'חיפה', street: 'הרצל', houseNumber: '5' },
      consents: { terms: true, photos: true, marketing: false },
      items: [{ productId: product.id, quantity: 1, personalization: { childName: 'אורי', parent1Name: 'דנה', parent2Name: '', photos } }],
    },
  });
  expect(order.ok()).toBeTruthy();
  const o = (await order.json()) as { orderId: string; number: number; redirectUrl: string };
  const u = new URL(o.redirectUrl);
  const paid = await request.post(u.pathname, { form: { sig: u.searchParams.get('sig')!, action: 'pay' }, maxRedirects: 0 });
  expect(paid.status()).toBe(303);
  return o;
}
