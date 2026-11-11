import AxeBuilder from '@axe-core/playwright';
import { devices } from '@playwright/test';
import { E2E } from './constants';
import { backupCodes, createPaidOrder, expect, fixture, outbox, test, uniqueName } from './fixtures';

test.describe('login protection', () => {
  test('admin pages redirect to the login when not logged in', async ({ page }) => {
    await page.goto('/admin/orders');
    await expect(page).toHaveURL(/\/admin\/login\?next=%2Fadmin%2Forders/);
    await expect(page.getByRole('link', { name: 'הזמנות' })).toHaveCount(0); // no admin menu for visitors
  });

  test('a wrong authenticator code is refused', async ({ page }) => {
    await page.goto('/admin/login');
    await page.getByLabel('אימייל', { exact: true }).fill(E2E.adminEmail);
    await page.getByLabel('סיסמה', { exact: true }).fill(E2E.adminPassword);
    await page.getByRole('button', { name: 'המשך' }).click();
    await page.getByLabel('קוד אימות', { exact: true }).fill('000000');
    await page.getByRole('button', { name: 'כניסה', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('הקוד שגוי');
    await expect(page).toHaveURL(/\/admin\/login/);
  });

  test('lost phone: log in with a one-time backup code', async ({ page }) => {
    await page.goto('/admin/login?next=/admin/settings');
    await page.getByLabel('אימייל', { exact: true }).fill(E2E.adminEmail);
    await page.getByLabel('סיסמה', { exact: true }).fill(E2E.adminPassword);
    await page.getByRole('button', { name: 'המשך' }).click();
    await page.getByRole('button', { name: /כניסה עם קוד גיבוי/ }).click();
    await page.getByLabel('קוד גיבוי', { exact: true }).fill(backupCodes()[0]!);
    await page.getByRole('button', { name: 'כניסה', exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/settings/);
    // logout ends the session
    await page.getByRole('button', { name: 'יציאה מניהול' }).click();
    await page.goto('/admin/orders');
    await expect(page).toHaveURL(/\/admin\/login/);
  });
});

test.describe('logged-in admin', () => {
  test.use({ storageState: E2E.authFile });

  test('incoming orders: list + selected order side by side; in progress → out for delivery; filter by status', async ({ page, request }) => {
    const name = uniqueName('לקוחה');
    const order = await createPaidOrder(request, name);
    const list = page.locator('[data-orders-list]');
    const orderLink = () => list.getByRole('link', { name: new RegExp(`(^|#)${order.number}(\\s|$)`) });
    const panel = page.getByTestId('order-panel');

    await page.goto('/admin/orders');
    await expect(page.getByRole('navigation', { name: 'תפריט ראשי' }).first().getByRole('link', { name: 'הזמנות' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'תפריט ראשי' }).first().getByRole('link', { name: 'ניהול מוצרים' })).toHaveCount(0);
    await orderLink().click();
    await expect(page).toHaveURL(new RegExp(`/admin/orders/${order.orderId}`));
    // the list stays on screen next to the order
    await expect(list).toBeVisible();
    await expect(orderLink()).toHaveAttribute('aria-current', 'true');
    await expect(panel.getByRole('heading', { level: 2 })).toContainText(`הזמנה #${order.number}`);
    await expect(panel.getByRole('heading', { level: 2 })).toBeFocused();
    await expect(panel.getByText(name)).toBeVisible();
    await expect(panel.getByText('אורי (ילד/ה)')).toBeVisible();
    await expect(panel.getByRole('img', { name: 'תמונת אורי' })).toBeVisible();
    await expect(panel.getByRole('img', { name: 'תמונת ההורים' })).toBeVisible();

    await panel.getByRole('checkbox', { name: 'לשלוח ללקוח/ה מייל עדכון' }).uncheck();
    await panel.getByRole('button', { name: 'סימון "בטיפול"' }).click();
    await expect(panel.getByRole('status').filter({ hasText: 'בטיפול' })).toBeVisible();
    await expect(panel.getByRole('heading', { level: 2 })).toContainText('בטיפול');

    // filter while the order stays open
    await page.getByTestId('tab-IN_PROGRESS').click();
    await expect(orderLink()).toBeVisible();
    await expect(panel).toBeVisible();
    await page.getByTestId('tab-PAID').click();
    await expect(orderLink()).toHaveCount(0);
    await expect(page.getByTestId('tab-PENDING_PAYMENT')).toHaveCount(0);

    await page.getByTestId('tab-IN_PROGRESS').click();
    await panel.getByRole('checkbox', { name: 'לשלוח ללקוח/ה מייל עדכון' }).check();
    await panel.getByRole('button', { name: 'סימון "יצאה למשלוח"' }).click();
    await expect(panel.getByRole('heading', { level: 2 })).toContainText('יצאה למשלוח');
    await expect.poll(() => outbox().some((m) => m.to === 'customer@e2e.test' && m.subject.includes(String(order.number)) && m.subject.includes('יצאה למשלוח'))).toBe(true);
  });

  test('switching between orders keeps the list and the filters', async ({ page, request }) => {
    const a = await createPaidOrder(request, uniqueName('ראשונה'));
    const b = await createPaidOrder(request, uniqueName('שנייה'));
    const list = page.locator('[data-orders-list]');
    await page.goto('/admin/orders?status=PAID');
    await list.getByRole('link', { name: new RegExp(`(^|#)${a.number}(\\s|$)`) }).click();
    await expect(page.getByTestId('order-panel')).toContainText(`הזמנה #${a.number}`);
    await list.getByRole('link', { name: new RegExp(`(^|#)${b.number}(\\s|$)`) }).click();
    await expect(page.getByTestId('order-panel')).toContainText(`הזמנה #${b.number}`);
    await expect(page).toHaveURL(/status=PAID/);
    await expect(page.getByTestId('tab-PAID')).toHaveAttribute('aria-pressed', 'true');
  });

  test('search orders by customer name', async ({ page, request }) => {
    const name = uniqueName('מחפשת');
    const order = await createPaidOrder(request, name);
    await page.goto('/admin/orders');
    await page.getByRole('searchbox', { name: 'חיפוש הזמנה' }).fill(name);
    await expect(page.getByTestId('order-row')).toHaveCount(1);
    await expect(page.getByTestId('order-row')).toContainText(String(order.number));
  });

  test('new simple product with photo and a discount → red strikethrough in the shop, discount price charged', async ({ page }) => {
    const title = `מחזיק מוצץ ${Date.now()}`;
    await page.goto('/shop');
    await page.getByRole('link', { name: '+ הוספת מוצר' }).click();
    await page.getByLabel('כותרת').fill(title);
    await page.getByLabel('תיאור').fill('מחזיק מוצץ מלבד, בעבודת יד');
    await page.getByLabel('מחיר רגיל (₪)').fill('60');
    await page.getByRole('radio', { name: /לא – מוצר רגיל/ }).check();
    // photos are chosen in the "new product" form itself, before saving
    await page.getByTestId('new-product-images').setInputFiles([fixture('child.png'), fixture('parents.png')]);
    await page.getByLabel('תיאור לנגישות').first().fill('מחזיק מוצץ צהוב');
    await page.getByRole('button', { name: 'שמירה' }).click();
    await expect(page).toHaveURL(/\/admin\/products\/[\w-]+$/);
    await expect(page.getByRole('img', { name: 'מחזיק מוצץ צהוב' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'גלריית תמונות' }).locator('..').getByRole('img')).toHaveCount(2);

    await page.getByLabel('מחיר מבצע (₪)').fill('50');
    await page.getByRole('button', { name: 'שמירה' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'נשמר' })).toBeVisible();

    await page.goto('/shop');
    const card = page.getByRole('article').filter({ hasText: title });
    await expect(card.locator('s')).toContainText('60');
    await expect(card.locator('s')).toHaveCSS('color', 'rgb(198, 40, 40)');
    await expect(card.getByText('מבצע', { exact: true })).toBeVisible();

    await card.getByRole('link', { name: title, exact: true }).click();
    await page.getByRole('button', { name: /הוספה לסל/ }).click();
    await page.goto('/cart');
    await expect(page.getByTestId('cart-total')).toContainText('80'); // 50 + 30 shipping
  });

  test('new product with names + photos: shoppers are asked for them', async ({ page }) => {
    const title = uniqueName('ספר חיות');
    await page.goto('/admin/products/new');
    await expect(page.getByRole('radio', { name: /לא – מוצר רגיל/ })).toBeChecked(); // default
    await page.getByLabel('כותרת').fill(title);
    await page.getByLabel('מחיר רגיל (₪)').fill('250');
    await page.getByRole('radio', { name: /כן – עם שמות ותמונות/ }).check();
    await page.getByTestId('new-product-images').setInputFiles(fixture('child.png'));
    await page.getByRole('button', { name: 'שמירה' }).click();
    await expect(page).toHaveURL(/\/admin\/products\/[\w-]+$/);
    await expect(page.getByRole('radio', { name: /כן – עם שמות ותמונות/ })).toBeChecked();

    await page.goto('/shop');
    await page.getByRole('article').filter({ hasText: title }).getByRole('link', { name: title, exact: true }).click();
    await expect(page.getByLabel('שם הילד/ה', { exact: true })).toBeVisible();
    await expect(page.getByTestId('upload-CHILD')).toBeAttached();
    await expect(page.getByTestId('upload-PARENTS')).toBeAttached();
  });

  test('custom-book pages: add a new page and it appears for shoppers', async ({ page }) => {
    const title = `עמוד חדש ${Date.now()}`;
    await page.goto('/admin/pages');
    await page.getByRole('button', { name: '+ עמוד חדש' }).click();
    const form = page.getByRole('form', { name: 'עמוד חדש' });
    await form.getByLabel('שם העמוד').fill(title);
    await form.getByLabel(/תקציר/).fill('משחק התאמה בצבעים');
    await form.getByLabel('מגיל').fill('2');
    await form.getByLabel('עד גיל').fill('4');
    await form.getByRole('button', { name: 'הוספת עמוד' }).click();
    await expect(page.getByRole('heading', { name: title })).toBeVisible();
    await page.goto('/shop/custom-book');
    await expect(page.getByText(title)).toBeVisible();
  });

  test('settings: shipping fee change shows in the cart', async ({ page }) => {
    await page.goto('/admin/settings');
    await page.getByLabel('עלות משלוח (₪)').fill('25');
    await page.getByRole('button', { name: 'שמירת הגדרות' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'ההגדרות נשמרו' })).toBeVisible();
    await page.goto('/shop/preset-3-5');
    await page.evaluate(async () => {
      const p = (await (await fetch('/api/products/preset-3-5')).json()) as { id: string; slug: string; title: string; price: number };
      localStorage.setItem('shani:cart:v1', JSON.stringify([{ key: 'k1', productId: p.id, slug: p.slug, type: 'SIMPLE', title: p.title, imageUrl: null, quantity: 1, unitPrice: p.price }]));
    });
    await page.goto('/cart');
    await expect(page.getByTestId('cart-total')).toContainText('325');
    // restore
    await page.goto('/admin/settings');
    await page.getByLabel('עלות משלוח (₪)').fill('30');
    await page.getByRole('button', { name: 'שמירת הגדרות' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'ההגדרות נשמרו' })).toBeVisible();
  });

  test('products are edited from the shop: pencil on each product, hidden products visible to the admin only', async ({ page, browser }) => {
    await page.goto('/shop');
    await expect(page.getByRole('link', { name: 'עריכת המוצר ספר מוכן לגילאי 1–3' })).toBeVisible();
    await page.getByRole('link', { name: 'עריכת המוצר ספר מוכן לגילאי 1–3' }).click();
    await expect(page).toHaveURL(/\/admin\/products\/[\w-]+$/);
    await page.getByRole('link', { name: 'חזרה לחנות' }).click();
    await page.getByRole('link', { name: 'ספר מוכן לגילאי 3–5', exact: true }).click();
    await page.getByRole('link', { name: 'עריכת המוצר ספר מוכן לגילאי 3–5' }).click();
    await expect(page.getByLabel('כותרת')).toHaveValue('ספר מוכן לגילאי 3–5');
    // shoppers never see pencils
    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const visitor = await ctx.newPage();
    await visitor.goto('/shop');
    await expect(visitor.getByRole('article').first()).toBeVisible();
    await expect(visitor.getByTestId('edit-product')).toHaveCount(0);
    await ctx.close();
  });

  test('About page: edit title and text in place, change the picture', async ({ page }) => {
    await page.goto('/about');
    await page.getByRole('button', { name: 'עריכת הכותרת' }).click();
    const title = page.getByRole('textbox', { name: 'כותרת עמוד אודות' });
    await expect(title).toBeFocused();
    await title.fill('נעים מאוד, אני שני');
    await page.getByRole('button', { name: 'שמירה' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'נעים מאוד, אני שני' })).toBeVisible();

    await page.getByRole('button', { name: 'עריכת הטקסט' }).click();
    await page.getByRole('textbox', { name: 'טקסט עמוד אודות' }).fill('פסקה ראשונה על העסק.\n\nפסקה שנייה על שני.');
    await page.getByRole('button', { name: 'שמירה' }).click();
    await expect(page.getByText('פסקה שנייה על שני.')).toBeVisible();

    await page.getByTestId('about-image-input').setInputFiles(fixture('parents.png'));
    await expect(page.getByRole('img', { name: /תמונה/ })).toHaveAttribute('src', /\/media\//);
    await expect(page.getByRole('button', { name: 'הסרה' })).toBeVisible();

    // settings no longer hold the About text
    await page.goto('/admin/settings');
    await expect(page.getByText('עמוד אודות')).toHaveCount(0);
  });

  for (const path of ['/admin/orders', '/shop', '/about', '/admin/pages', '/admin/settings']) {
    test(`admin page ${path} has no serious accessibility violations`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await page.waitForLoadState('networkidle');
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      const bad = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
      expect(bad.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
    });
  }

  test('orders list works on a phone', async ({ browser, request }) => {
    const order = await createPaidOrder(request);
    const ctx = await browser.newContext({ ...devices['Pixel 7'], storageState: E2E.authFile });
    const page = await ctx.newPage();
    await page.goto('/admin/orders');
    await page.getByRole('link', { name: new RegExp(`#${order.number}`) }).click();
    // on a phone the order opens full-screen, with a way back to the list
    await expect(page.getByTestId('order-panel')).toBeVisible();
    await expect(page.locator('[data-orders-list]')).toBeHidden();
    await page.getByRole('link', { name: /חזרה לרשימת ההזמנות/ }).click();
    await expect(page.locator('[data-orders-list]')).toBeVisible();
    await ctx.close();
  });
});
