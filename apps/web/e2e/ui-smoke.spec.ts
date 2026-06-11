import { test, expect, type Page } from '@playwright/test';

/**
 * Browser-driven smoke over the critical admin UI, against a freshly seeded
 * test app (admin / admin123). This is the gate that proves a UI change loads
 * and functions before it can be pushed.
 *
 * Auth is done through the real login form (same-origin, exactly as a user
 * does it); the resulting session persists in the page context, so subsequent
 * navigations in the same test are authenticated.
 */
async function loginViaForm(page: Page): Promise<void> {
  await page.goto('/admin/login');
  await page.locator('input:not([type="password"])').first().fill('admin');
  await page.locator('input[type="password"]').fill('admin123');
  await page.getByRole('button', { name: /sign in|login/i }).click();
  // Dev mode compiles the login route + dashboard on first hit — be patient.
  await expect(page).not.toHaveURL(/\/admin\/login$/, { timeout: 60000 });
}

test('public landing page renders', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('body')).toBeVisible();
});

test('public booking page renders a form', async ({ page }) => {
  await page.goto('/book-service');
  await expect(page.locator('body')).toContainText(/book|service|name|phone/i);
});

test('wrong password keeps you on the login screen', async ({ page }) => {
  await page.goto('/admin/login');
  await page.locator('input:not([type="password"])').first().fill('admin');
  await page.locator('input[type="password"]').fill('definitely-wrong');
  await page.getByRole('button', { name: /sign in|login/i }).click();
  await expect(page).toHaveURL(/\/admin\/login/);
  await expect(page.locator('body')).toContainText(/sign in to manage your garage/i);
});

test('authenticated admin journey: login → dashboard → customers → inventory → revenue', async ({ page }) => {
  await loginViaForm(page);

  // Dashboard
  await page.goto('/admin/dashboard');
  await expect(page).toHaveURL(/\/admin\/dashboard/);
  await expect(page.locator('body')).not.toContainText(/sign in to manage your garage/i);

  // Customers
  await page.goto('/admin/customers');
  await expect(page.locator('body')).toContainText(/customer/i);
  await expect(page.locator('body')).not.toContainText(/sign in to manage your garage/i);

  // Inventory items (the 368-item module)
  await page.goto('/admin/inventory/items');
  await expect(page.locator('body')).toContainText(/inventory|item|stock|sku/i);
  await expect(page.locator('body')).not.toContainText(/^404/);

  // Revenue report (report-wiring regression)
  await page.goto('/admin/reports/revenue');
  await expect(page.locator('body')).toContainText(/revenue/i);
});
