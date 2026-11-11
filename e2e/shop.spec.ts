import { expect, fillAddress, fillPersonalization, navTo, outbox, test } from './fixtures';

test('buy a personalized book: shop → product → cart → checkout → payment → thank you', async ({ page }) => {
  await page.goto('/');
  await navTo(page, 'חנות');
  await expect(page).toHaveURL(/\/shop$/);
  await page.getByRole('link', { name: 'ספר מוכן לגילאי 1–3' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'ספר מוכן לגילאי 1–3' })).toBeVisible();

  // nothing filled → clear errors
  await page.getByRole('button', { name: /הוספה לסל/ }).click();
  const summary = page.locator('#error-summary');
  await expect(summary).toBeVisible();
  await expect(summary).toContainText('שם הילד');
  await expect(summary).toContainText('תמונה');

  await fillPersonalization(page);
  await page.getByRole('button', { name: /הוספה לסל/ }).click();
  await expect(page.getByRole('status').filter({ hasText: 'נוסף לסל' })).toBeVisible();
  await expect(page.getByTestId('cart-link')).toHaveAttribute('aria-label', 'סל הקניות, 1 פריטים');

  // cart shows what was chosen; quantity can be changed
  await page.getByRole('link', { name: 'מעבר לסל הקניות' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('סל הקניות');
  const item = page.getByTestId('cart-item');
  await expect(item).toContainText('נועם · מיכל');
  await expect(item.getByRole('img', { name: 'תמונת הילד/ה' })).toBeVisible();
  await expect(page.getByTestId('cart-total')).toContainText('330');
  await item.getByRole('button', { name: 'הוספת יחידה' }).click();
  await expect(page.getByTestId('cart-total')).toContainText('630');

  await page.getByRole('button', { name: /המשך לתשלום/ }).click();
  await expect(page).toHaveURL(/\/checkout$/);

  // checkout: try without details first
  await page.getByRole('button', { name: /מעבר לתשלום מאובטח/ }).click();
  await expect(page.locator('#error-summary')).toContainText('תקנון');
  await page.getByLabel('שם מלא').fill('מיכל כהן');
  await page.getByLabel('טלפון נייד').fill('0501234567');
  await page.getByLabel('אימייל').fill('michal@example.com');
  await page.getByRole('radio', { name: /איסוף עצמי/ }).check();
  await expect(page.getByTestId('checkout-total')).toContainText('600');
  await page.getByRole('checkbox', { name: /קראתי ואני מסכים/ }).check();
  await page.getByRole('checkbox', { name: /אני מאשר\/ת שימוש בתמונות/ }).check();
  await page.getByRole('button', { name: /מעבר לתשלום מאובטח/ }).click();

  // the payment provider's page (mock in tests)
  await expect(page.getByRole('heading', { name: 'עמוד תשלום מאובטח' })).toBeVisible();
  await expect(page.getByLabel('סכום לתשלום')).toContainText('600');
  await page.getByRole('button', { name: 'אישור תשלום' }).click();

  await expect(page).toHaveURL(/\/checkout\/success\?order=\d+/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('ההזמנה התקבלה');
  const number = await page.getByTestId('order-number').textContent();
  await expect(page.getByTestId('cart-link')).toHaveAttribute('aria-label', 'סל הקניות, ריק');

  // confirmation email to the customer + alert to the business
  await expect.poll(() => outbox().filter((m) => m.subject.includes(String(number))).map((m) => m.to).sort()).toEqual(['michal@example.com', 'shani@example.com']);
});

test('cancelling on the payment page keeps the cart', async ({ page }) => {
  await page.goto('/shop/preset-3-5');
  await fillPersonalization(page, { child: 'רוני', parent: 'אבא גיל' });
  await page.getByRole('button', { name: /הוספה לסל/ }).click();
  await page.goto('/checkout');
  await page.getByLabel('שם מלא').fill('גיל לוי');
  await page.getByLabel('טלפון נייד').fill('0541234567');
  await page.getByLabel('אימייל').fill('gil@example.com');
  await fillAddress(page, 'חדרה', 'הגפן', '3');
  await page.getByRole('checkbox', { name: /קראתי ואני מסכים/ }).check();
  await page.getByRole('checkbox', { name: /אני מאשר\/ת שימוש בתמונות/ }).check();
  await page.getByRole('button', { name: /מעבר לתשלום מאובטח/ }).click();
  await page.getByRole('button', { name: 'ביטול וחזרה לאתר' }).click();
  await expect(page).toHaveURL(/\/checkout\/cancelled/);
  await expect(page.getByTestId('cart-link')).toHaveAttribute('aria-label', 'סל הקניות, 1 פריטים');
});

test('remove an item from the cart – and undo it', async ({ page }) => {
  await page.goto('/shop/preset-1-3');
  await fillPersonalization(page);
  await page.getByRole('button', { name: /הוספה לסל/ }).click();
  await page.goto('/cart');
  await page.getByRole('button', { name: /הסרה של ספר מוכן/ }).click();
  await expect(page.getByText('הסל ריק כרגע')).toBeVisible();
  const toast = page.getByTestId('undo-toast');
  await expect(toast).toContainText('הוסר מהסל');
  await toast.getByRole('button', { name: /ביטול ההסרה/ }).click();
  await expect(page.getByTestId('cart-item')).toContainText('נועם · מיכל');
  await expect(toast).toBeHidden();
  // without undo the notice goes away by itself
  await page.getByRole('button', { name: /הסרה של ספר מוכן/ }).click();
  await expect(toast).toBeVisible();
  await expect(toast).toBeHidden({ timeout: 12_000 });
  await expect(page.getByText('הסל ריק כרגע')).toBeVisible();
});

test('checkout fields: names take letters only, phone and house number take digits only, city/street come from the official list', async ({ page }) => {
  await page.goto('/shop/preset-1-3');
  const child = page.getByLabel('שם הילד/ה', { exact: true });
  await child.pressSequentially('נועם1;<>');
  await expect(child).toHaveValue('נועם');
  await expect(page.getByText('אפשר להשתמש באותיות בלבד').first()).toBeVisible();
  await child.fill('');
  await child.pressSequentially('אוריאל-חיים בן דוד');
  await expect(child).toHaveValue('אוריאל-חיים בן דוד');

  await fillPersonalization(page);
  await page.getByRole('button', { name: /הוספה לסל/ }).click();
  await page.goto('/checkout');
  const name = page.getByLabel('שם מלא');
  await name.pressSequentially("מיכל כהן'); DROP TABLE orders;--");
  await expect(name).toHaveValue("מיכל כהן' DROP TABLE orders--");
  const phone = page.getByLabel('טלפון נייד');
  await phone.pressSequentially('050-12a34567');
  await expect(phone).toHaveValue('0501234567');

  // street is disabled until a city is chosen; city comes before street
  await expect(page.getByRole('combobox', { name: 'רחוב' })).toBeDisabled();
  const city = page.getByRole('combobox', { name: 'יישוב' });
  await city.fill('פרדס חנה כרכור');
  await expect(page.getByRole('option', { name: 'פרדס חנה-כרכור' })).toBeVisible();
  await city.press('Enter');
  await expect(city).toHaveValue('פרדס חנה-כרכור');
  await page.getByRole('combobox', { name: 'רחוב' }).fill('שבזבזבז');
  await expect(page.getByRole('option', { name: 'לא נמצאו תוצאות' }).or(page.getByText('לא נמצאו תוצאות'))).toBeVisible();
  const house = page.getByLabel('מספר בית', { exact: true });
  await house.pressSequentially('12א');
  await expect(house).toHaveValue('12');
});

test('edit the personalization from the cart', async ({ page }) => {
  await page.goto('/shop/preset-1-3');
  await fillPersonalization(page, { child: 'שירה', parent: 'אמא טל' });
  await page.getByRole('button', { name: /הוספה לסל/ }).click();
  await page.goto('/cart');
  await page.getByRole('link', { name: /עריכת ההתאמה האישית/ }).click();
  await expect(page.getByLabel('שם הילד/ה', { exact: true })).toHaveValue('שירה');
  await page.getByLabel('שם הילד/ה', { exact: true }).fill('שירה בת');
  await page.getByRole('button', { name: 'שמירת השינויים' }).click();
  await expect(page).toHaveURL(/\/cart$/);
  await expect(page.getByTestId('cart-item')).toContainText('שירה בת');
  await expect(page.getByTestId('cart-item')).toHaveCount(1);
});

test('checkout with the keyboard only', async ({ page, isMobile }) => {
  test.skip(isMobile, 'keyboard test runs on desktop');
  await page.goto('/shop/preset-1-3');
  await fillPersonalization(page);
  await page.getByRole('button', { name: /הוספה לסל/ }).click();
  await page.goto('/checkout');
  await page.getByLabel('שם מלא').focus();
  await page.keyboard.type('דנה כהן');
  await page.keyboard.press('Tab');
  await page.keyboard.type('0501234567');
  await page.keyboard.press('Tab');
  await page.keyboard.type('dana@example.com');
  await page.keyboard.press('Tab'); // shipping radio group
  await page.keyboard.press('ArrowDown'); // → pickup
  await expect(page.getByRole('radio', { name: /איסוף עצמי/ })).toBeChecked();
  await page.keyboard.press('Tab'); // notes
  await page.keyboard.press('Tab'); // terms
  await page.keyboard.press('Space');
  await page.keyboard.press('Tab'); // terms link
  await page.keyboard.press('Tab'); // privacy link
  await page.keyboard.press('Tab'); // photos consent
  await page.keyboard.press('Space');
  await expect(page.getByRole('checkbox', { name: /קראתי ואני מסכים/ })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: /אני מאשר\/ת שימוש בתמונות/ })).toBeChecked();
  await page.getByRole('button', { name: /מעבר לתשלום מאובטח/ }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'עמוד תשלום מאובטח' })).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'אישור תשלום' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/checkout\/success/);
});
