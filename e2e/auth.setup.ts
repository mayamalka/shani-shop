import { E2E } from './constants';
import { adminCode, expect, test } from './fixtures';

// Logs the admin in once through the real login screen (password + authenticator code) and saves the session.
test('admin logs in with password + authenticator code', async ({ page }) => {
  await page.goto('/admin/login');
  await page.getByLabel('אימייל', { exact: true }).fill(E2E.adminEmail);
  await page.getByLabel('סיסמה', { exact: true }).fill(E2E.adminPassword);
  await page.getByRole('button', { name: 'המשך' }).click();
  await expect(page.getByRole('heading', { name: /שלב 2 מתוך 2/ })).toBeVisible();
  await page.getByLabel('קוד אימות', { exact: true }).fill(adminCode());
  await page.getByRole('button', { name: 'כניסה', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/orders/);
  await expect(page.getByRole('heading', { level: 1, name: 'הזמנות' })).toBeVisible();
  await page.context().storageState({ path: E2E.authFile });
});
