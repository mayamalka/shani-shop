import AxeBuilder from '@axe-core/playwright';
import { expect, navTo, outbox, test } from './fixtures';

test.describe('client-side navigation', () => {
  test('menu links switch pages without reloading, move focus to the new heading and update the title', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => ((window as unknown as { __marker: number }).__marker = 42));
    await navTo(page, 'אודות');
    await expect(page).toHaveURL(/\/about$/);
    await expect(page).toHaveTitle(/אודות/);
    await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
    await expect(page.getByTestId('route-announcer')).toContainText('אודות');
    await navTo(page, 'צור קשר');
    await expect(page).toHaveURL(/\/contact$/);
    expect(await page.evaluate(() => (window as unknown as { __marker?: number }).__marker)).toBe(42); // same page load
    await page.goBack();
    await expect(page).toHaveURL(/\/about$/);
  });

  test('deep links and refresh work on every page', async ({ page }) => {
    for (const path of ['/shop/custom-book', '/contact', '/accessibility', '/admin/login']) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await page.reload();
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    }
  });

  test('unknown address shows a friendly 404', async ({ page }) => {
    await page.goto('/no-such-page');
    await expect(page.getByRole('heading', { level: 1, name: 'העמוד לא נמצא' })).toBeVisible();
  });

  test('"skip to content" is the first thing the keyboard reaches', async ({ page, isMobile }) => {
    test.skip(isMobile, 'keyboard test runs on desktop');
    await page.goto('/shop');
    await page.keyboard.press('Tab');
    const skip = page.getByRole('link', { name: 'דילוג לתוכן הראשי' });
    await expect(skip).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('main')).toBeFocused();
  });

  test('the menu underline slides to the new page', async ({ page, isMobile }) => {
    test.skip(isMobile, 'desktop menu only');
    await page.goto('/');
    const bar = page.getByTestId('nav-indicator');
    await expect(bar).toHaveCSS('opacity', '1');
    const before = await bar.boundingBox();
    expect(await bar.evaluate((el) => getComputedStyle(el).transitionProperty)).toContain('left');
    await page.getByRole('navigation', { name: 'תפריט ראשי' }).getByRole('link', { name: 'צור קשר', exact: true }).click();
    await expect.poll(async () => (await bar.boundingBox())!.x).not.toBe(before!.x);
    const link = await page.getByRole('navigation', { name: 'תפריט ראשי' }).getByRole('link', { name: 'צור קשר', exact: true }).boundingBox();
    await expect.poll(async () => Math.abs((await bar.boundingBox())!.x - link!.x - 8)).toBeLessThan(2);
  });

  test('admin login is reachable from the footer', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('contentinfo').getByRole('link', { name: 'כניסת מנהלת' }).click();
    await expect(page).toHaveURL(/\/admin\/login$/);
  });

  test('the cart is in the top-left corner', async ({ page }) => {
    await page.goto('/');
    const box = await page.getByTestId('cart-link').boundingBox();
    const vw = page.viewportSize()!.width;
    expect(box!.x).toBeLessThan(vw / 2);
    expect(box!.y).toBeLessThan(100);
  });
});

test.describe('contact page', () => {
  test('form sends an email to the business', async ({ page }) => {
    await page.goto('/contact');
    await page.getByRole('button', { name: /שליחה/ }).click();
    await expect(page.locator('#error-summary')).toBeVisible();
    const subject = `שאלה ${Date.now()}`;
    await page.getByLabel('נושא הפנייה').fill(subject);
    await page.getByLabel('אימייל לחזרה').fill('dana@example.com');
    await page.getByLabel('תוכן הפנייה').fill('היי שני, אפשר להכין ספר לתאומים?');
    await page.getByRole('checkbox', { name: /פרטיי ישמשו למענה/ }).check();
    await page.getByRole('button', { name: /שליחה/ }).click();
    await expect(page.getByRole('heading', { name: 'ההודעה נשלחה ✓' })).toBeVisible();
    await expect.poll(() => outbox().find((m) => m.subject.includes(subject))?.to).toBe('shani@example.com');
  });

  test('WhatsApp opens with a ready message; Instagram and TikTok links exist', async ({ page }) => {
    await page.goto('/contact');
    const wa = page.getByTestId('whatsapp-link');
    await expect(wa).toHaveAttribute('href', /^https:\/\/wa\.me\/972501234567\?text=/);
    expect(decodeURIComponent((await wa.getAttribute('href'))!.split('text=')[1]!)).toContain('היי שני');
    await expect(wa).toHaveAttribute('target', '_blank');
    await expect(page.getByRole('link', { name: /אינסטגרם/ })).toHaveAttribute('href', 'https://www.instagram.com/example');
    await expect(page.getByRole('link', { name: /טיקטוק/ })).toHaveAttribute('href', 'https://www.tiktok.com/@example');
  });
});

test.describe('accessibility (axe: WCAG 2.1 A/AA)', () => {
  const pages = ['/', '/about', '/shop', '/shop/preset-1-3', '/shop/custom-book', '/cart', '/contact', '/terms', '/privacy', '/accessibility', '/shipping', '/checkout/cancelled', '/admin/login', '/no-such-page'];
  for (const path of pages) {
    test(`no serious violations on ${path}`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await page.waitForLoadState('networkidle');
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      const bad = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
      expect(bad.map((v) => `${v.id}: ${v.help} → ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
    });
  }

  test('accessibility menu: bigger text, high contrast; remembered after reload', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('a11y-button').click();
    const dialog = page.getByRole('dialog', { name: 'נגישות' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'גדול מאוד' }).click();
    await dialog.getByRole('button', { name: /ניגודיות גבוהה/ }).click();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await page.reload();
    await expect(page.locator('html')).toHaveClass(/a11y-contrast/);
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--text-scale').trim())).toBe('1.3');
  });

  test('page is usable at 320px width (no horizontal scroll)', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 700 });
    for (const path of ['/', '/shop/custom-book', '/contact']) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, path).toBeLessThanOrEqual(1);
    }
  });
});
