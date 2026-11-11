import { expect, fillPersonalization, test } from './fixtures';

test('custom book: 10–15 pages with tiered price, then into the cart', async ({ page }) => {
  await page.goto('/shop/custom-book');
  await expect(page.getByRole('heading', { level: 1, name: 'ספר בהרכבה אישית' })).toBeVisible();
  const boxes = page.getByTestId('page-option');
  await expect(boxes.first()).toBeAttached();
  expect(await boxes.count()).toBeGreaterThanOrEqual(15);
  const pick = (i: number) => boxes.nth(i).evaluate((el: HTMLInputElement) => el.click());

  await fillPersonalization(page, { child: 'אלה', parent: 'אמא רוני' });
  for (let i = 0; i < 9; i++) await pick(i);
  const summary = page.locator('[aria-labelledby="sum-title"]');
  await expect(summary).toContainText('9');
  await page.getByRole('button', { name: /הוספה לסל/ }).click();
  await expect(page.locator('#error-summary')).toContainText('יש לבחור בין 10 ל־15 עמודים');

  await pick(9);
  await expect(summary).toContainText('300');
  await pick(10);
  await pick(11);
  await expect(summary).toContainText('354'); // 10×30 + 2×27
  await pick(12);
  await pick(13);
  await pick(14);
  await expect(summary).toContainText('431'); // 10×30 + 3×27 + 2×25
  // at 15 the remaining pages can't be added
  await expect(boxes.nth(15)).toBeDisabled();
  await pick(14);
  await pick(13);
  await pick(12);
  await expect(summary).toContainText('354');

  await page.getByRole('button', { name: /הוספה לסל/ }).click();
  await expect(page.getByRole('status').filter({ hasText: 'נוסף לסל' })).toBeVisible();
  await page.goto('/cart');
  await expect(page.getByTestId('cart-item')).toContainText('ספר בהרכבה אישית · 12 עמודים');
  await expect(page.getByTestId('cart-item')).toContainText('עמודים (12)');
  await expect(page.getByTestId('cart-total')).toContainText('384');
});

test('pages can be chosen with the keyboard and filtered by age', async ({ page, isMobile }) => {
  test.skip(isMobile, 'keyboard test runs on desktop');
  await page.goto('/shop/custom-book');
  await page.getByRole('button', { name: '4–5' }).click();
  const visible = page.getByTestId('page-option');
  const n = await visible.count();
  expect(n).toBeGreaterThan(0);
  expect(n).toBeLessThan(17);
  await page.getByRole('button', { name: 'הכל' }).click();
  await visible.first().focus();
  await page.keyboard.press('Space');
  await expect(visible.first()).toBeChecked();
});
