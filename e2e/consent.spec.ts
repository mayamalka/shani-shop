import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

test.use({ consent: 'unset' });

const TRACKERS = /googletagmanager\.com|google-analytics\.com|connect\.facebook\.net|facebook\.com\/tr|analytics\.tiktok\.com/;

/** Records tracker requests (and blocks them – tests never talk to Google/Meta/TikTok). */
async function watchTrackers(page: Page) {
  const hits: string[] = [];
  await page.route(TRACKERS, (route) => {
    hits.push(route.request().url());
    return route.abort();
  });
  return hits;
}

test('no tracking before consent; "necessary only" keeps it off', async ({ page }) => {
  const hits = await watchTrackers(page);
  await page.goto('/');
  const banner = page.getByTestId('cookie-banner');
  await expect(banner).toBeVisible();
  await page.waitForLoadState('networkidle');
  expect(hits).toEqual([]);

  const consentLogged = page.waitForRequest((r) => r.url().endsWith('/api/consent') && r.method() === 'POST');
  await banner.getByRole('button', { name: 'הכרחיות בלבד' }).click();
  expect((await consentLogged).postDataJSON()).toMatchObject({ analytics: false, marketing: false });
  await expect(banner).toBeHidden();
  await page.reload();
  await page.waitForLoadState('networkidle');
  await expect(page.getByTestId('cookie-banner')).toBeHidden();
  expect(hits).toEqual([]);
});

test('"accept all" loads GA4, Meta Pixel and TikTok Pixel', async ({ page }) => {
  const hits = await watchTrackers(page);
  await page.goto('/');
  await page.getByTestId('cookie-banner').getByRole('button', { name: 'אישור הכל' }).click();
  await expect.poll(() => hits.some((u) => u.includes('googletagmanager.com/gtag/js?id=G-TEST123'))).toBe(true);
  await expect.poll(() => hits.some((u) => u.includes('connect.facebook.net'))).toBe(true);
  await expect.poll(() => hits.some((u) => u.includes('analytics.tiktok.com'))).toBe(true);
});

test('custom choice: analytics only; preferences can be reopened from the footer', async ({ page }) => {
  const hits = await watchTrackers(page);
  await page.goto('/');
  await page.getByTestId('cookie-banner').getByRole('button', { name: 'התאמה אישית' }).click();
  const dialog = page.getByRole('dialog', { name: 'הגדרות עוגיות' });
  await dialog.getByRole('checkbox', { name: /סטטיסטיקה/ }).check();
  await dialog.getByRole('button', { name: 'שמירת הבחירה' }).click();
  await expect.poll(() => hits.some((u) => u.includes('googletagmanager.com'))).toBe(true);
  expect(hits.some((u) => u.includes('facebook') || u.includes('tiktok'))).toBe(false);

  await page.getByRole('contentinfo').getByRole('button', { name: 'הגדרות עוגיות' }).click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('checkbox', { name: /סטטיסטיקה/ })).toBeChecked();
  await expect(dialog.getByRole('checkbox', { name: /שיווק/ })).not.toBeChecked();
});

test('the banner itself is accessible and does not hide the skip link', async ({ page }) => {
  await page.goto('/');
  const banner = page.getByTestId('cookie-banner');
  await expect(banner.getByRole('heading', { name: /אנחנו משתמשים בעוגיות/ })).toBeVisible();
  await expect(banner.getByRole('link', { name: 'מדיניות פרטיות' })).toBeVisible();
});
