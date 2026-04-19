import { test, expect, Page } from '@playwright/test';

const BASE = 'https://gearup.sgnk.ai';

// ─── Helper: Login and get auth token ───
async function login(page: Page): Promise<string> {
  const res = await page.request.post(`${BASE}/api/admin/auth/login`, {
    data: { adminUserId: 'admin', password: 'admin123' },
  });
  const body = await res.json();
  expect(body.success).toBe(true);
  return body.data.token;
}

// ─── Helper: Auth GET ───
async function authGet(page: Page, path: string, token: string) {
  const res = await page.request.get(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return { status: res.status(), body: await res.json() };
}

// ─── Helper: Auth POST ───
async function authPost(page: Page, path: string, token: string, data: any) {
  const res = await page.request.post(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    data,
  });
  return { status: res.status(), body: await res.json() };
}

// ─── Helper: Auth PATCH ───
async function authPatch(page: Page, path: string, token: string, data: any) {
  const res = await page.request.patch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    data,
  });
  return { status: res.status(), body: await res.json() };
}

// ═══════════════════════════════════════════════════════
// SECTION 1: PUBLIC PAGES
// ═══════════════════════════════════════════════════════

test.describe('1. Public Pages', () => {
  test('1.1 Homepage loads', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/GearUp/);
    expect(await page.locator('body').textContent()).toBeTruthy();
  });

  test('1.2 Book Service page loads', async ({ page }) => {
    await page.goto('/book-service');
    await expect(page).toHaveTitle(/GearUp/);
  });

  test('1.3 Track page loads', async ({ page }) => {
    await page.goto('/track');
    await expect(page).toHaveTitle(/GearUp/);
  });

  test('1.4 Contact page loads', async ({ page }) => {
    await page.goto('/contact');
    await expect(page).toHaveTitle(/GearUp/);
  });
});

// ═══════════════════════════════════════════════════════
// SECTION 2: PUBLIC API ENDPOINTS
// ═══════════════════════════════════════════════════════

test.describe('2. Public API', () => {
  test('2.1 Health check', async ({ page }) => {
    const res = await page.request.get(`${BASE}/api/health`);
    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(body.db).toBe('connected');
  });

  test('2.2 Available slots', async ({ page }) => {
    const res = await page.request.get(`${BASE}/api/public/available-slots?date=2026-04-21`);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.slots).toBeDefined();
  });

  test('2.3 Submit service request', async ({ page }) => {
    const res = await page.request.post(`${BASE}/api/public/service-requests`, {
      data: { fullName: 'PW Test', phoneNumber: '4444444444', vehicleType: 'CAR', brand: 'Test', model: 'Car', registrationNumber: 'PW-TEST-001', serviceCategory: 'Test', issueDescription: 'Playwright E2E test' },
    });
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.referenceId).toMatch(/^GU-/);
  });

  test('2.4 Track service request', async ({ page }) => {
    // First create one
    const create = await page.request.post(`${BASE}/api/public/service-requests`, {
      data: { fullName: 'Track Test', phoneNumber: '3333333333', vehicleType: 'BIKE', brand: 'Honda', model: 'Shine', registrationNumber: 'PW-TRACK-01', serviceCategory: 'Test', issueDescription: 'Track test' },
    });
    const ref = (await create.json()).data.referenceId;

    const res = await page.request.post(`${BASE}/api/public/track`, {
      data: { referenceId: ref, phoneNumber: '3333333333' },
    });
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.serviceRequestStatus).toBe('SUBMITTED');
  });
});

// ═══════════════════════════════════════════════════════
// SECTION 3: AUTH
// ═══════════════════════════════════════════════════════

test.describe('3. Authentication', () => {
  test('3.1 Login with valid credentials', async ({ page }) => {
    const token = await login(page);
    expect(token).toBeTruthy();
    expect(token.split('.').length).toBe(3); // JWT format
  });

  test('3.2 Login with wrong password', async ({ page }) => {
    const res = await page.request.post(`${BASE}/api/admin/auth/login`, {
      data: { adminUserId: 'admin', password: 'wrongpassword' },
    });
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  test('3.3 Me endpoint', async ({ page }) => {
    const token = await login(page);
    const { body } = await authGet(page, '/api/admin/auth/me', token);
    expect(body.success).toBe(true);
    expect(body.data.adminUserId).toBe('admin');
    expect(body.data.roles).toContain('SUPER_ADMIN');
    expect(body.data.permissions.length).toBeGreaterThan(30);
  });

  test('3.4 Invalid token rejected', async ({ page }) => {
    const { status, body } = await authGet(page, '/api/admin/customers', 'invalid-token');
    expect(status).toBe(401);
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  test('3.5 Missing token rejected', async ({ page }) => {
    const res = await page.request.get(`${BASE}/api/admin/customers`);
    expect(res.status()).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════
// SECTION 4: ADMIN PAGE NAVIGATION
// ═══════════════════════════════════════════════════════

test.describe('4. Admin Page Navigation', () => {
  const adminPages = [
    ['/admin/login', 'Login'],
    ['/admin/dashboard', 'Dashboard'],
    ['/admin/customers', 'Customers'],
    ['/admin/vehicles', 'Vehicles'],
    ['/admin/workers', 'Workers'],
    ['/admin/workers/calendar', 'Worker Calendar'],
    ['/admin/appointments', 'Appointments'],
    ['/admin/appointments/calendar', 'Appointment Calendar'],
    ['/admin/job-cards', 'Job Cards'],
    ['/admin/inventory/items', 'Inventory Items'],
    ['/admin/inventory/categories', 'Inventory Categories'],
    ['/admin/inventory/suppliers', 'Suppliers'],
    ['/admin/inventory/movements', 'Stock Movements'],
    ['/admin/inventory/low-stock', 'Low Stock'],
    ['/admin/invoices', 'Invoices'],
    ['/admin/payments', 'Payments'],
    ['/admin/expenses', 'Expenses'],
    ['/admin/expenses/categories', 'Expense Categories'],
    ['/admin/service-requests', 'Service Requests'],
    ['/admin/notifications', 'Notifications'],
    ['/admin/notifications/templates', 'Notification Templates'],
    ['/admin/settings', 'Settings'],
    ['/admin/settings/admins', 'Admin Users'],
    ['/admin/settings/business-hours', 'Business Hours'],
    ['/admin/settings/integrations', 'Integrations'],
    ['/admin/settings/notifications', 'Notification Settings'],
    ['/admin/reports', 'Reports'],
    ['/admin/reports/revenue', 'Revenue Report'],
    ['/admin/reports/appointments', 'Appointments Report'],
    ['/admin/reports/jobs', 'Jobs Report'],
    ['/admin/reports/inventory', 'Inventory Report'],
    ['/admin/reports/workers', 'Workers Report'],
    ['/admin/reports/expenses', 'Expenses Report'],
    ['/admin/logs', 'Activity Logs'],
  ];

  for (const [path, name] of adminPages) {
    test(`4.${adminPages.indexOf([path, name]) + 1} ${name} (${path})`, async ({ page }) => {
      const res = await page.goto(path);
      expect(res?.status()).toBe(200);
      await expect(page).toHaveTitle(/GearUp/);
    });
  }
});

// ═══════════════════════════════════════════════════════
// SECTION 5: ADMIN API - CRUD OPERATIONS
// ═══════════════════════════════════════════════════════

test.describe('5. Customers CRUD', () => {
  let token: string;
  let customerId: string;

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    token = await login(page);
    await page.close();
  });

  test('5.1 List customers', async ({ page }) => {
    const { body } = await authGet(page, '/api/admin/customers', token);
    expect(body.success).toBe(true);
    expect(body.meta.total).toBeGreaterThan(0);
    expect(body.data.length).toBeGreaterThan(0);
  });

  test('5.2 Create customer', async ({ page }) => {
    const { body } = await authPost(page, '/api/admin/customers', token, {
      fullName: 'Playwright Customer', phoneNumber: '9999000001', email: 'pw@test.com', city: 'Test City',
    });
    expect(body.success).toBe(true);
    expect(body.data.id).toBeTruthy();
    customerId = body.data.id;
  });

  test('5.3 Read customer', async ({ page }) => {
    const { body } = await authGet(page, `/api/admin/customers/${customerId}`, token);
    expect(body.success).toBe(true);
    expect(body.data.fullName).toBe('Playwright Customer');
    expect(body.data.vehicles).toBeDefined();
  });

  test('5.4 Update customer', async ({ page }) => {
    const { body } = await authPatch(page, `/api/admin/customers/${customerId}`, token, { city: 'Updated City' });
    expect(body.success).toBe(true);
    expect(body.data.city).toBe('Updated City');
  });

  test('5.5 Search customer', async ({ page }) => {
    const { body } = await authGet(page, '/api/admin/customers?search=Playwright', token);
    expect(body.meta.total).toBeGreaterThan(0);
  });

  test('5.6 Customer history', async ({ page }) => {
    const { body } = await authGet(page, `/api/admin/customers/${customerId}/history`, token);
    expect(body.success).toBe(true);
  });

  test('5.7 Pagination', async ({ page }) => {
    const { body } = await authGet(page, '/api/admin/customers?page=1&pageSize=2', token);
    expect(body.meta.pageSize).toBe(2);
    expect(body.data.length).toBeLessThanOrEqual(2);
  });
});

test.describe('6. Vehicles CRUD', () => {
  let token: string;
  let vehicleId: string;

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    token = await login(page);
    await page.close();
  });

  test('6.1 List vehicles', async ({ page }) => {
    const { body } = await authGet(page, '/api/admin/vehicles', token);
    expect(body.success).toBe(true);
    expect(body.meta.total).toBeGreaterThan(0);
  });

  test('6.2 Create vehicle', async ({ page }) => {
    const customers = await authGet(page, '/api/admin/customers', token);
    const cid = customers.body.data[0].id;
    const { body } = await authPost(page, '/api/admin/vehicles', token, {
      customerId: cid, vehicleType: 'CAR', registrationNumber: 'PW-VEH-001', brand: 'Playwright', model: 'TestCar',
    });
    expect(body.success).toBe(true);
    vehicleId = body.data.id;
  });

  test('6.3 Read vehicle with relations', async ({ page }) => {
    const { body } = await authGet(page, `/api/admin/vehicles/${vehicleId}`, token);
    expect(body.data.brand).toBe('Playwright');
    expect(body.data.customer).toBeDefined();
  });

  test('6.4 Update vehicle', async ({ page }) => {
    const { body } = await authPatch(page, `/api/admin/vehicles/${vehicleId}`, token, { odometerReading: 12345 });
    expect(body.data.odometerReading).toBe(12345);
  });
});

test.describe('7. Workers CRUD', () => {
  let token: string;
  let workerId: string;

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    token = await login(page);
    await page.close();
  });

  test('7.1 List workers', async ({ page }) => {
    const { body } = await authGet(page, '/api/admin/workers', token);
    expect(body.meta.total).toBeGreaterThan(0);
  });

  test('7.2 Create worker (auto workerCode)', async ({ page }) => {
    const { body } = await authPost(page, '/api/admin/workers', token, { fullName: 'PW Worker', designation: 'Tester' });
    expect(body.data.workerCode).toMatch(/^WRK-/);
    workerId = body.data.id;
  });

  test('7.3 Read worker with assignments', async ({ page }) => {
    const { body } = await authGet(page, `/api/admin/workers/${workerId}`, token);
    expect(body.data.fullName).toBe('PW Worker');
    expect(body.data.assignments).toBeDefined();
    expect(body.data.leaves).toBeDefined();
  });

  test('7.4 Update worker status', async ({ page }) => {
    const { body } = await authPatch(page, `/api/admin/workers/${workerId}`, token, { status: 'INACTIVE' });
    expect(body.data.status).toBe('INACTIVE');
  });

  test('7.5 Filter by status', async ({ page }) => {
    const { body } = await authGet(page, '/api/admin/workers?status=ACTIVE', token);
    expect(body.data.every((w: any) => w.status === 'ACTIVE')).toBe(true);
  });
});

test.describe('8. Appointments CRUD', () => {
  let token: string;
  let appointmentId: string;

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    token = await login(page);
    await page.close();
  });

  test('8.1 List appointments', async ({ page }) => {
    const { body } = await authGet(page, '/api/admin/appointments', token);
    expect(body.meta.total).toBeGreaterThan(0);
  });

  test('8.2 Create appointment (auto referenceId)', async ({ page }) => {
    const customers = await authGet(page, '/api/admin/customers', token);
    const vehicles = await authGet(page, '/api/admin/vehicles', token);
    const { body } = await authPost(page, '/api/admin/appointments', token, {
      customerId: customers.body.data[0].id, vehicleId: vehicles.body.data[0].id,
      appointmentDate: '2026-04-28T10:00:00Z', slotStart: '2026-04-28T10:00:00Z', slotEnd: '2026-04-28T10:30:00Z', bookingSource: 'ADMIN',
    });
    expect(body.data.referenceId).toMatch(/^APT-/);
    expect(body.data.status).toBe('CONFIRMED');
    appointmentId = body.data.id;
  });

  test('8.3 Read appointment with relations', async ({ page }) => {
    const { body } = await authGet(page, `/api/admin/appointments/${appointmentId}`, token);
    expect(body.data.customer).toBeDefined();
    expect(body.data.vehicle).toBeDefined();
  });

  test('8.4 Update appointment', async ({ page }) => {
    const { body } = await authPatch(page, `/api/admin/appointments/${appointmentId}`, token, { status: 'RESCHEDULED', rescheduleReason: 'PW test' });
    expect(body.success).toBe(true);
  });
});

test.describe('9. Job Cards CRUD', () => {
  let token: string;
  let jobCardId: string;

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    token = await login(page);
    await page.close();
  });

  test('9.1 List job cards', async ({ page }) => {
    const { body } = await authGet(page, '/api/admin/job-cards', token);
    expect(body.meta.total).toBeGreaterThan(0);
  });

  test('9.2 Create job card (auto jobCardNumber)', async ({ page }) => {
    const c = await authGet(page, '/api/admin/customers', token);
    const v = await authGet(page, '/api/admin/vehicles', token);
    const { body } = await authPost(page, '/api/admin/job-cards', token, {
      customerId: c.body.data[0].id, vehicleId: v.body.data[0].id, issueSummary: 'PW E2E test job card',
    });
    expect(body.data.jobCardNumber).toMatch(/^JC-/);
    jobCardId = body.data.id;
  });

  test('9.3 Read job card with all relations', async ({ page }) => {
    const { body } = await authGet(page, `/api/admin/job-cards/${jobCardId}`, token);
    expect(body.data.customer).toBeDefined();
    expect(body.data.vehicle).toBeDefined();
    expect(body.data.tasks).toBeDefined();
    expect(body.data.parts).toBeDefined();
  });

  test('9.4 Update job card status + diagnosis', async ({ page }) => {
    const { body } = await authPatch(page, `/api/admin/job-cards/${jobCardId}`, token, {
      status: 'WORK_IN_PROGRESS', diagnosisNotes: 'PW test diagnosis', estimatedTotal: 5000,
    });
    expect(body.success).toBe(true);
  });
});

test.describe('10. Invoices CRUD', () => {
  let token: string;
  let invoiceId: string;

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    token = await login(page);
    await page.close();
  });

  test('10.1 List invoices', async ({ page }) => {
    const { body } = await authGet(page, '/api/admin/invoices', token);
    expect(body.meta.total).toBeGreaterThan(0);
  });

  test('10.2 Create invoice with line items', async ({ page }) => {
    const c = await authGet(page, '/api/admin/customers', token);
    const v = await authGet(page, '/api/admin/vehicles', token);
    const jc = await authGet(page, '/api/admin/job-cards', token);
    const { body } = await authPost(page, '/api/admin/invoices', token, {
      customerId: c.body.data[0].id, vehicleId: v.body.data[0].id, jobCardId: jc.body.data[0].id,
      invoiceDate: '2026-04-19', lineItems: [
        { lineType: 'LABOR', description: 'PW Test Labor', quantity: 1, unitPrice: 1000, taxRate: 18 },
        { lineType: 'PART', description: 'PW Test Part', quantity: 2, unitPrice: 500, taxRate: 18 },
      ],
    });
    expect(body.data.invoiceNumber).toMatch(/^INV-/);
    expect(body.data.lineItems.length).toBe(2);
    expect(parseFloat(body.data.taxTotal)).toBeGreaterThan(0);
    expect(parseFloat(body.data.grandTotal)).toBeGreaterThan(0);
    invoiceId = body.data.id;
  });

  test('10.3 Read invoice with line items + payments', async ({ page }) => {
    const { body } = await authGet(page, `/api/admin/invoices/${invoiceId}`, token);
    expect(body.data.lineItems.length).toBe(2);
    expect(body.data.customer).toBeDefined();
  });
});

test.describe('11. Expenses CRUD', () => {
  let token: string;
  let expenseId: string;

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    token = await login(page);
    await page.close();
  });

  test('11.1 List expenses', async ({ page }) => {
    const { body } = await authGet(page, '/api/admin/expenses', token);
    expect(body.meta.total).toBeGreaterThan(0);
  });

  test('11.2 Create expense', async ({ page }) => {
    const expenses = await authGet(page, '/api/admin/expenses', token);
    const catId = expenses.body.data[0].categoryId;
    const { body } = await authPost(page, '/api/admin/expenses', token, {
      expenseDate: '2026-04-19', categoryId: catId, title: 'PW Test Expense', amount: 999,
    });
    expect(body.success).toBe(true);
    expenseId = body.data.id;
  });

  test('11.3 Read expense', async ({ page }) => {
    const { body } = await authGet(page, `/api/admin/expenses/${expenseId}`, token);
    expect(body.data.title).toBe('PW Test Expense');
  });

  test('11.4 Delete expense', async ({ page }) => {
    const res = await page.request.delete(`${BASE}/api/admin/expenses/${expenseId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await res.json();
    expect(body.success).toBe(true);
  });
});

test.describe('12. Remaining Modules', () => {
  let token: string;

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    token = await login(page);
    await page.close();
  });

  test('12.1 Inventory items list', async ({ page }) => {
    const { body } = await authGet(page, '/api/admin/inventory/items', token);
    expect(body.meta.total).toBeGreaterThan(0);
  });

  test('12.2 Inventory search', async ({ page }) => {
    const { body } = await authGet(page, '/api/admin/inventory/items?search=Oil', token);
    expect(body.data.some((i: any) => i.itemName.includes('Oil'))).toBe(true);
  });

  test('12.3 Payments list', async ({ page }) => {
    const { body } = await authGet(page, '/api/admin/payments', token);
    expect(body.success).toBe(true);
    expect(body.meta.total).toBeGreaterThan(0);
  });

  test('12.4 Service requests list', async ({ page }) => {
    const { body } = await authGet(page, '/api/admin/service-requests', token);
    expect(body.meta.total).toBeGreaterThan(0);
  });

  test('12.5 Service request detail + update', async ({ page }) => {
    const list = await authGet(page, '/api/admin/service-requests', token);
    const id = list.body.data[0].id;
    const { body } = await authGet(page, `/api/admin/service-requests/${id}`, token);
    expect(body.data.customer).toBeDefined();
    expect(body.data.vehicle).toBeDefined();
  });

  test('12.6 Notifications list', async ({ page }) => {
    const { body } = await authGet(page, '/api/admin/notifications', token);
    expect(body.success).toBe(true);
    expect(body.meta.total).toBeGreaterThan(0);
  });

  test('12.7 Settings read', async ({ page }) => {
    const { body } = await authGet(page, '/api/admin/settings', token);
    expect(body.data['business.name']).toBe('GearUp Auto Service');
    expect(body.data['business.gst']).toBeTruthy();
  });

  test('12.8 Settings update', async ({ page }) => {
    const { body } = await authPatch(page, '/api/admin/settings', token, { 'pw.test': 'playwright' });
    // Settings uses PATCH but let's test via the endpoint
    const read = await authGet(page, '/api/admin/settings', token);
    expect(read.body.success).toBe(true);
  });

  test('12.9 Dashboard report', async ({ page }) => {
    const { body } = await authGet(page, '/api/admin/reports?type=dashboard', token);
    expect(body.data.todayAppointments).toBeDefined();
    expect(body.data.pendingRequests).toBeDefined();
    expect(body.data.activeJobs).toBeDefined();
    expect(body.data.unpaidInvoices).toBeDefined();
    expect(body.data.todayRevenue).toBeDefined();
  });

  test('12.10 Revenue report', async ({ page }) => {
    const { body } = await authGet(page, '/api/admin/reports?type=revenue&from=2026-04-01&to=2026-04-30', token);
    expect(body.success).toBe(true);
    expect(body.data.total).toBeDefined();
  });

  test('12.11 Jobs report', async ({ page }) => {
    const { body } = await authGet(page, '/api/admin/reports?type=jobs', token);
    expect(body.success).toBe(true);
  });

  test('12.12 Activity logs', async ({ page }) => {
    const { body } = await authGet(page, '/api/admin/logs', token);
    expect(body.meta.total).toBeGreaterThan(0);
  });

  test('12.13 Logs filter by entity', async ({ page }) => {
    const { body } = await authGet(page, '/api/admin/logs?entityType=Customer', token);
    expect(body.success).toBe(true);
  });
});
