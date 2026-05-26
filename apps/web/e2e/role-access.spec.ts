import { test, expect, Page } from '@playwright/test';

const BASE = process.env.E2E_BASE_URL || 'https://gearup.sgnk.ai';

async function loginAs(page: Page, adminUserId: string): Promise<string> {
  const res = await page.request.post(`${BASE}/api/admin/auth/login`, {
    data: { adminUserId, password: 'admin123' },
  });
  const body = await res.json();
  expect(body.success).toBe(true);
  return body.data.token;
}

async function getMe(page: Page, token: string) {
  const res = await page.request.get(`${BASE}/api/admin/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await res.json();
  expect(body.success).toBe(true);
  return body.data;
}

async function loginAndNavigate(page: Page, adminUserId: string) {
  const token = await loginAs(page, adminUserId);
  // Set token in localStorage and navigate to dashboard
  await page.goto(`${BASE}/admin/login`);
  await page.evaluate((t) => {
    localStorage.setItem('gearup_token', t);
  }, token);
  await page.goto(`${BASE}/admin/dashboard`);
  await page.waitForSelector('nav');
}

// ═══════════════════════════════════════════════════════
// SECTION 1: API-level permission verification
// ═══════════════════════════════════════════════════════

test.describe('Role-Based Access — API', () => {
  test('Admin has all permissions', async ({ page }) => {
    const token = await loginAs(page, 'admin');
    const me = await getMe(page, token);
    expect(me.roles).toContain('SUPER_ADMIN');
    expect(me.permissions).toContain('dashboard.view');
    expect(me.permissions).toContain('settings.manage');
    expect(me.permissions).toContain('expenses.manage');
    expect(me.permissions).toContain('logs.view');
  });

  test('Receptionist has correct permissions', async ({ page }) => {
    const token = await loginAs(page, 'receptionist');
    const me = await getMe(page, token);
    expect(me.roles).toContain('RECEPTIONIST');
    // Should have
    expect(me.permissions).toContain('dashboard.view');
    expect(me.permissions).toContain('customers.view');
    expect(me.permissions).toContain('customers.edit');
    expect(me.permissions).toContain('appointments.view');
    expect(me.permissions).toContain('appointments.confirm');
    expect(me.permissions).toContain('invoices.view');
    expect(me.permissions).toContain('payments.record');
    expect(me.permissions).toContain('notifications.view');
    // Should NOT have
    expect(me.permissions).not.toContain('workers.manage');
    expect(me.permissions).not.toContain('inventory.view');
    expect(me.permissions).not.toContain('expenses.view');
    expect(me.permissions).not.toContain('reports.view');
    expect(me.permissions).not.toContain('logs.view');
    expect(me.permissions).not.toContain('settings.manage');
  });

  test('Mechanic has correct permissions', async ({ page }) => {
    const token = await loginAs(page, 'mechanic');
    const me = await getMe(page, token);
    expect(me.roles).toContain('MECHANIC');
    // Should have
    expect(me.permissions).toContain('dashboard.view');
    expect(me.permissions).toContain('vehicles.view');
    expect(me.permissions).toContain('job-cards.view-own');
    expect(me.permissions).toContain('job-cards.update-status');
    expect(me.permissions).toContain('inventory.view');
    // Should NOT have
    expect(me.permissions).not.toContain('customers.view');
    expect(me.permissions).not.toContain('invoices.view');
    expect(me.permissions).not.toContain('expenses.view');
    expect(me.permissions).not.toContain('reports.view');
    expect(me.permissions).not.toContain('settings.manage');
    expect(me.permissions).not.toContain('workers.manage');
    expect(me.permissions).not.toContain('payments.record');
  });
});

// ═══════════════════════════════════════════════════════
// SECTION 2: UI sidebar visibility per role
// ═══════════════════════════════════════════════════════

test.describe('Role-Based Access — Sidebar UI', () => {
  test('Admin sees all sidebar items', async ({ page }) => {
    await loginAndNavigate(page, 'admin');
    const nav = page.locator('nav');
    await expect(nav.getByText('Dashboard')).toBeVisible();
    await expect(nav.getByText('Service Requests')).toBeVisible();
    await expect(nav.getByText('Workers')).toBeVisible();
    await expect(nav.getByText('Inventory')).toBeVisible();
    await expect(nav.getByText('Expenses')).toBeVisible();
    await expect(nav.getByText('Reports')).toBeVisible();
    await expect(nav.getByText('Activity Logs')).toBeVisible();
    await expect(nav.getByText('Settings')).toBeVisible();
  });

  test('Receptionist sees only permitted sidebar items', async ({ page }) => {
    await loginAndNavigate(page, 'receptionist');
    const nav = page.locator('nav');
    // Should see
    await expect(nav.getByText('Dashboard')).toBeVisible();
    await expect(nav.getByText('Service Requests')).toBeVisible();
    await expect(nav.getByText('Appointments')).toBeVisible();
    await expect(nav.getByText('Job Cards')).toBeVisible();
    await expect(nav.getByText('Customers')).toBeVisible();
    await expect(nav.getByText('Vehicles')).toBeVisible();
    await expect(nav.getByText('Invoices')).toBeVisible();
    await expect(nav.getByText('Payments')).toBeVisible();
    await expect(nav.getByText('Notifications')).toBeVisible();
    // Should NOT see
    await expect(nav.getByText('Workers')).not.toBeVisible();
    await expect(nav.getByText('Inventory')).not.toBeVisible();
    await expect(nav.getByText('Expenses')).not.toBeVisible();
    await expect(nav.getByText('Reports')).not.toBeVisible();
    await expect(nav.getByText('Activity Logs')).not.toBeVisible();
    await expect(nav.getByText('Settings')).not.toBeVisible();
  });

  test('Mechanic sees only permitted sidebar items', async ({ page }) => {
    await loginAndNavigate(page, 'mechanic');
    const nav = page.locator('nav');
    // Should see
    await expect(nav.getByText('Dashboard')).toBeVisible();
    await expect(nav.getByText('Vehicles')).toBeVisible();
    await expect(nav.getByText('Job Cards')).toBeVisible();
    await expect(nav.getByText('Inventory')).toBeVisible();
    await expect(nav.getByText('Appointments')).toBeVisible();
    // Should NOT see
    await expect(nav.getByText('Service Requests')).not.toBeVisible();
    await expect(nav.getByText('Customers')).not.toBeVisible();
    await expect(nav.getByText('Workers')).not.toBeVisible();
    await expect(nav.getByText('Invoices')).not.toBeVisible();
    await expect(nav.getByText('Payments')).not.toBeVisible();
    await expect(nav.getByText('Expenses')).not.toBeVisible();
    await expect(nav.getByText('Reports')).not.toBeVisible();
    await expect(nav.getByText('Activity Logs')).not.toBeVisible();
    await expect(nav.getByText('Settings')).not.toBeVisible();
    await expect(nav.getByText('Notifications')).not.toBeVisible();
  });
});

// ═══════════════════════════════════════════════════════
// SECTION 3: Direct URL access denied for unauthorized roles
// ═══════════════════════════════════════════════════════

test.describe('Role-Based Access — API route protection', () => {
  test('Mechanic cannot access expenses API', async ({ page }) => {
    const token = await loginAs(page, 'mechanic');
    const res = await page.request.get(`${BASE}/api/admin/expenses`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status()).toBe(403);
  });

  test('Receptionist cannot access settings API', async ({ page }) => {
    const token = await loginAs(page, 'receptionist');
    const res = await page.request.get(`${BASE}/api/admin/settings`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status()).toBe(403);
  });
});
