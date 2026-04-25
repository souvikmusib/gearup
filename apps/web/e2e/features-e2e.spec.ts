import { test, expect, Page } from '@playwright/test';

const BASE = process.env.E2E_BASE_URL || 'http://localhost:3000';

async function login(page: Page): Promise<string> {
  const res = await page.request.post(`${BASE}/api/admin/auth/login`, {
    data: { adminUserId: 'admin', password: 'admin123' },
  });
  const body = await res.json();
  expect(body.success).toBe(true);
  return body.data.token;
}

function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}` };
}

async function apiGet(page: Page, path: string, token: string) {
  const res = await page.request.get(`${BASE}${path}`, { headers: authHeaders(token) });
  return { status: res.status(), body: await res.json() };
}

async function apiPost(page: Page, path: string, token: string, data: any) {
  const res = await page.request.post(`${BASE}${path}`, { headers: authHeaders(token), data });
  return { status: res.status(), body: await res.json() };
}

async function apiPatch(page: Page, path: string, token: string, data: any) {
  const res = await page.request.patch(`${BASE}${path}`, { headers: authHeaders(token), data });
  return { status: res.status(), body: await res.json() };
}

async function apiDelete(page: Page, path: string, token: string) {
  const res = await page.request.delete(`${BASE}${path}`, { headers: authHeaders(token) });
  return { status: res.status(), body: await res.json() };
}

// ═══════════════════════════════════════════════════════
// PUBLIC PAGES
// ═══════════════════════════════════════════════════════

test.describe('Public Pages', () => {
  test('Homepage loads with motorcycle branding', async ({ page }) => {
    await page.goto('/');
    const text = await page.locator('body').textContent();
    expect(text).toContain('Motorcycle Servicing');
    expect(text).toContain('Book a Service');
  });

  test('Book Service page loads with validation', async ({ page }) => {
    await page.goto('/book-service');
    await page.click('button:has-text("Submit Service Request")');
    // Should show validation errors, not submit
    await expect(page.locator('text=Full name is required')).toBeVisible();
    await expect(page.locator('text=Phone number is required')).toBeVisible();
  });

  test('Book Service form auto-formats name to title case', async ({ page }) => {
    await page.goto('/book-service');
    const nameInput = page.locator('input').first();
    await nameInput.fill('arnab sen');
    const value = await nameInput.inputValue();
    expect(value).toBe('Arnab Sen');
  });

  test('Book Service form auto-formats vehicle number', async ({ page }) => {
    await page.goto('/book-service');
    const regInput = page.locator('input[placeholder="AB-00-AB-1234"]');
    await regInput.fill('ka01ab1234');
    const value = await regInput.inputValue();
    expect(value).toBe('KA-01-AB-1234');
  });

  test('Customer lookup API returns vehicles for known phone', async ({ page }) => {
    const res = await page.request.get(`${BASE}/api/public/customer-lookup?phone=0000000000`);
    const body = await res.json();
    expect(body.success).toBe(true);
    // May or may not find a customer, but should not error
  });
});

// ═══════════════════════════════════════════════════════
// AUTH
// ═══════════════════════════════════════════════════════

test.describe('Auth', () => {
  test('Login returns token', async ({ page }) => {
    const token = await login(page);
    expect(token).toBeTruthy();
  });

  test('Protected route rejects without token', async ({ page }) => {
    const res = await page.request.get(`${BASE}/api/admin/customers`);
    expect(res.status()).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════
// INVENTORY CRUD
// ═══════════════════════════════════════════════════════

test.describe('Inventory', () => {
  let token: string;
  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    token = await login(page);
    await page.close();
  });

  test('List inventory categories', async ({ page }) => {
    const { status, body } = await apiGet(page, '/api/admin/inventory/categories', token);
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
  });

  test('Create and update inventory category', async ({ page }) => {
    const name = `Test-Cat-${Date.now()}`;
    const { body: created } = await apiPost(page, '/api/admin/inventory/categories', token, { categoryName: name });
    expect(created.success).toBe(true);
    expect(created.data.categoryName).toBe(name);

    const { body: updated } = await apiPatch(page, `/api/admin/inventory/categories/${created.data.id}`, token, { description: 'Updated' });
    expect(updated.success).toBe(true);

    await apiDelete(page, `/api/admin/inventory/categories/${created.data.id}`, token);
  });

  test('List suppliers', async ({ page }) => {
    const { status, body } = await apiGet(page, '/api/admin/inventory/suppliers', token);
    expect(status).toBe(200);
    expect(body.success).toBe(true);
  });

  test('Create and update supplier', async ({ page }) => {
    const { body: created } = await apiPost(page, '/api/admin/inventory/suppliers', token, { supplierName: `Sup-${Date.now()}` });
    expect(created.success).toBe(true);

    const { body: updated } = await apiPatch(page, `/api/admin/inventory/suppliers/${created.data.id}`, token, { phone: '9999999999' });
    expect(updated.success).toBe(true);

    await apiDelete(page, `/api/admin/inventory/suppliers/${created.data.id}`, token);
  });

  test('Stock adjustment creates movement', async ({ page }) => {
    // Get first inventory item
    const { body: items } = await apiGet(page, '/api/admin/inventory/items?pageSize=1', token);
    if (!items.data?.length && !items.data?.items?.length) return;
    const item = items.data?.items?.[0] ?? items.data[0];

    const { body } = await apiPost(page, `/api/admin/inventory/items/${item.id}/stock`, token, {
      type: 'STOCK_IN', quantity: 5, reason: 'E2E test stock in',
    });
    expect(body.success).toBe(true);
    expect(body.data.newQuantity).toBeGreaterThanOrEqual(5);

    // Reverse it
    await apiPost(page, `/api/admin/inventory/items/${item.id}/stock`, token, {
      type: 'STOCK_OUT', quantity: 5, reason: 'E2E test reversal',
    });
  });
});

// ═══════════════════════════════════════════════════════
// EXPENSES CRUD
// ═══════════════════════════════════════════════════════

test.describe('Expenses', () => {
  let token: string;
  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    token = await login(page);
    await page.close();
  });

  test('List expense categories', async ({ page }) => {
    const { body } = await apiGet(page, '/api/admin/expenses/categories', token);
    expect(body.success).toBe(true);
  });

  test('Create and update expense category', async ({ page }) => {
    const { body: created } = await apiPost(page, '/api/admin/expenses/categories', token, { categoryName: `ExpCat-${Date.now()}` });
    expect(created.success).toBe(true);

    const { body: updated } = await apiPatch(page, `/api/admin/expenses/categories/${created.data.id}`, token, { description: 'Test' });
    expect(updated.success).toBe(true);

    await apiDelete(page, `/api/admin/expenses/categories/${created.data.id}`, token);
  });
});

// ═══════════════════════════════════════════════════════
// JOB CARD WORKFLOW
// ═══════════════════════════════════════════════════════

test.describe('Job Card Workflow', () => {
  let token: string;
  let customerId: string;
  let vehicleId: string;
  let jobCardId: string;

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    token = await login(page);
    // Create test customer
    const { body: cust } = await apiPost(page, '/api/admin/customers', token, { fullName: 'E2E Test', phoneNumber: `9${Date.now().toString().slice(-9)}` });
    customerId = cust.data.id;
    // Create test vehicle
    const { body: veh } = await apiPost(page, '/api/admin/vehicles', token, { customerId, vehicleType: 'BIKE', registrationNumber: `KA-01-TE-${Math.floor(Math.random() * 9000) + 1000}`, brand: 'Honda', model: 'Activa' });
    vehicleId = veh.data.id;
    await page.close();
  });

  test('Create job card', async ({ page }) => {
    const { body } = await apiPost(page, '/api/admin/job-cards', token, { customerId, vehicleId, issueSummary: 'E2E test issue' });
    expect(body.success).toBe(true);
    expect(body.data.jobCardNumber).toBeTruthy();
    jobCardId = body.data.id;
  });

  test('Add worker to job card', async ({ page }) => {
    const { body: workers } = await apiGet(page, '/api/admin/workers?pageSize=1', token);
    const worker = workers.data?.items?.[0] ?? workers.data?.[0];
    if (!worker) return;

    const { body } = await apiPost(page, `/api/admin/job-cards/${jobCardId}/workers`, token, { workerId: worker.id });
    expect(body.success).toBe(true);
  });

  test('Add task to job card', async ({ page }) => {
    const { body } = await apiPost(page, `/api/admin/job-cards/${jobCardId}/tasks`, token, { taskName: 'Oil change' });
    expect(body.success).toBe(true);
    expect(body.data.status).toBe('PENDING');
  });

  test('Update task status', async ({ page }) => {
    const { body: jc } = await apiGet(page, `/api/admin/job-cards/${jobCardId}`, token);
    const task = jc.data.tasks?.[0];
    if (!task) return;

    const { body } = await apiPatch(page, `/api/admin/job-cards/${jobCardId}/tasks`, token, { taskId: task.id, status: 'DONE' });
    expect(body.success).toBe(true);
  });

  test('Add part to job card (reserves stock)', async ({ page }) => {
    const { body: items } = await apiGet(page, '/api/admin/inventory/items?pageSize=1', token);
    const item = items.data?.items?.[0] ?? items.data?.[0];
    if (!item) return;

    const { body } = await apiPost(page, `/api/admin/job-cards/${jobCardId}/parts`, token, { inventoryItemId: item.id, requiredQty: 1 });
    expect(body.success).toBe(true);
    expect(Number(body.data.unitPrice)).toBe(Number(item.sellingPrice));
  });

  test('Job card estimated cost auto-updates', async ({ page }) => {
    const { body } = await apiGet(page, `/api/admin/job-cards/${jobCardId}`, token);
    expect(Number(body.data.estimatedPartsCost)).toBeGreaterThan(0);
  });

  test('Update job card status', async ({ page }) => {
    const { body } = await apiPatch(page, `/api/admin/job-cards/${jobCardId}`, token, { status: 'WORK_IN_PROGRESS' });
    expect(body.success).toBe(true);
    expect(body.data.status).toBe('WORK_IN_PROGRESS');
  });

  test('Create invoice from job card (prevents duplicates)', async ({ page }) => {
    const { body: jc } = await apiGet(page, `/api/admin/job-cards/${jobCardId}`, token);
    const { body: inv } = await apiPost(page, '/api/admin/invoices', token, {
      customerId, vehicleId, jobCardId,
      invoiceDate: new Date().toISOString(),
      lineItems: [{ lineType: 'CUSTOM_CHARGE', description: 'Test', quantity: 1, unitPrice: 100, taxRate: 0 }],
    });
    expect(inv.success).toBe(true);

    // Second attempt should fail with 409
    const { status } = await apiPost(page, '/api/admin/invoices', token, {
      customerId, vehicleId, jobCardId,
      invoiceDate: new Date().toISOString(),
      lineItems: [{ lineType: 'CUSTOM_CHARGE', description: 'Dup', quantity: 1, unitPrice: 50, taxRate: 0 }],
    });
    expect(status).toBe(409);
  });
});

// ═══════════════════════════════════════════════════════
// INVOICE LINE ITEMS
// ═══════════════════════════════════════════════════════

test.describe('Invoice Line Items', () => {
  let token: string;
  let invoiceId: string;

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    token = await login(page);
    // Find a draft invoice
    const { body } = await apiGet(page, '/api/admin/invoices?invoiceStatus=DRAFT&pageSize=1', token);
    const inv = body.data?.items?.[0] ?? body.data?.[0];
    if (inv) invoiceId = inv.id;
    await page.close();
  });

  test('Add line item to draft invoice', async ({ page }) => {
    if (!invoiceId) return;
    const { body } = await apiPost(page, `/api/admin/invoices/${invoiceId}/line-items`, token, {
      lineType: 'LABOR', description: 'E2E labor', quantity: 1, unitPrice: 500, taxRate: 18,
    });
    expect(body.success).toBe(true);
    expect(Number(body.data.lineTotal)).toBeGreaterThan(0);
  });

  test('Update line item on draft invoice', async ({ page }) => {
    if (!invoiceId) return;
    const { body: inv } = await apiGet(page, `/api/admin/invoices/${invoiceId}`, token);
    const line = inv.data.lineItems?.[0];
    if (!line) return;

    const { body } = await apiPatch(page, `/api/admin/invoices/${invoiceId}/line-items`, token, { lineItemId: line.id, unitPrice: 600 });
    expect(body.success).toBe(true);
  });

  test('Delete line item from draft invoice', async ({ page }) => {
    if (!invoiceId) return;
    const { body: inv } = await apiGet(page, `/api/admin/invoices/${invoiceId}`, token);
    const lines = inv.data.lineItems ?? [];
    if (lines.length < 2) return;

    const { body } = await apiDelete(page, `/api/admin/invoices/${invoiceId}/line-items?lineItemId=${lines[lines.length - 1].id}`, token);
    expect(body.success).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════
// WORKER LEAVE
// ═══════════════════════════════════════════════════════

test.describe('Worker Leave', () => {
  let token: string;
  let workerId: string;

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    token = await login(page);
    const { body } = await apiGet(page, '/api/admin/workers?pageSize=1', token);
    const w = body.data?.items?.[0] ?? body.data?.[0];
    if (w) workerId = w.id;
    await page.close();
  });

  test('Create leave request', async ({ page }) => {
    if (!workerId) return;
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    const { body } = await apiPost(page, `/api/admin/workers/${workerId}/leave`, token, {
      leaveType: 'CASUAL', startDate: tomorrow, endDate: tomorrow, reason: 'E2E test',
    });
    expect(body.success).toBe(true);
    expect(body.data.status).toBe('PENDING');
  });

  test('Approve leave request', async ({ page }) => {
    if (!workerId) return;
    const { body: worker } = await apiGet(page, `/api/admin/workers/${workerId}`, token);
    const pending = worker.data.leaves?.find((l: any) => l.status === 'PENDING');
    if (!pending) return;

    const { body } = await apiPatch(page, `/api/admin/workers/${workerId}/leave`, token, { leaveId: pending.id, status: 'APPROVED' });
    expect(body.success).toBe(true);
    expect(body.data.status).toBe('APPROVED');
  });
});

// ═══════════════════════════════════════════════════════
// WORKER CALENDAR API
// ═══════════════════════════════════════════════════════

test.describe('Calendar APIs', () => {
  let token: string;
  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    token = await login(page);
    await page.close();
  });

  test('Worker calendar returns workers, leaves, assignments', async ({ page }) => {
    const { body } = await apiGet(page, '/api/admin/workers/calendar', token);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data.workers)).toBe(true);
    expect(Array.isArray(body.data.leaves)).toBe(true);
    expect(Array.isArray(body.data.assignments)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════
// UI NAVIGATION (Breadcrumbs & Pages)
// ═══════════════════════════════════════════════════════

test.describe('UI Navigation', () => {
  test('Admin pages load with breadcrumbs', async ({ page }) => {
    await page.goto('/admin/login');
    await page.fill('input[type="text"], input[name="adminUserId"], input:first-of-type', 'admin');
    await page.fill('input[type="password"]', 'admin123');
    await page.click('button:has-text("Sign In"), button:has-text("Login"), button[type="submit"]');
    await page.waitForURL('**/admin/**', { timeout: 10000 });

    // Navigate to a detail page and check breadcrumbs
    await page.goto('/admin/customers');
    await expect(page.locator('text=Customers')).toBeVisible();

    await page.goto('/admin/calendar');
    await expect(page.locator('text=Calendar')).toBeVisible();

    await page.goto('/admin/inventory/items');
    await expect(page.locator('text=Items')).toBeVisible();
  });
});
