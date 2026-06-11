import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { asRole, asPermissions, clearAuth, req, invoke, ensureSeedAdmin, resetDb, prisma } from './helpers';
import { GET as listCustomers, POST as createCustomer } from '@/app/api/admin/customers/route';
import { GET as getCustomer, PATCH as patchCustomer } from '@/app/api/admin/customers/[id]/route';

describe('customers route (integration, real DB)', () => {
  beforeAll(async () => {
    await resetDb();
    await ensureSeedAdmin();
  });
  beforeEach(() => asRole('SUPER_ADMIN'));

  it('rejects unauthenticated requests with 401', async () => {
    clearAuth();
    const { status } = await invoke(listCustomers, req('GET', '/api/admin/customers'));
    expect(status).toBe(401);
  });

  it('rejects a token lacking customers.view with 403', async () => {
    asPermissions(['invoices.view']);
    const { status, body } = await invoke(listCustomers, req('GET', '/api/admin/customers'));
    expect(status).toBe(403);
    expect(body.error.code).toBe('FORBIDDEN');
  });

  it('creates a customer and persists it', async () => {
    const { status, body } = await invoke(
      createCustomer,
      req('POST', '/api/admin/customers', { fullName: 'Asha Roy', phoneNumber: '9000000001', email: 'asha@test.local' }),
    );
    expect(status).toBe(201);
    expect(body.data.id).toBeTruthy();
    const row = await prisma.customer.findUnique({ where: { id: body.data.id } });
    expect(row?.fullName).toBe('Asha Roy');
  });

  it('rejects missing required fullName (zod 400)', async () => {
    const { status, body } = await invoke(createCustomer, req('POST', '/api/admin/customers', { phoneNumber: '9000000002' }));
    expect(status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('coerces empty-string email to undefined (no false validation error)', async () => {
    const { status } = await invoke(
      createCustomer,
      req('POST', '/api/admin/customers', { fullName: 'No Email', phoneNumber: '9000000003', email: '' }),
    );
    expect(status).toBe(201);
  });

  it('lists customers with pagination meta', async () => {
    const { status, body } = await invoke(listCustomers, req('GET', '/api/admin/customers?page=1&pageSize=5'));
    expect(status).toBe(200);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.meta).toMatchObject({ page: 1, pageSize: 5 });
  });

  it('searches by phone', async () => {
    const { body } = await invoke(listCustomers, req('GET', '/api/admin/customers?search=9000000001'));
    expect(body.data.some((c: any) => c.phoneNumber === '9000000001')).toBe(true);
  });

  it('gets a single customer by id', async () => {
    const created = await prisma.customer.create({ data: { fullName: 'Detail Guy', phoneNumber: '9000000009' } });
    const { status, body } = await invoke(getCustomer, req('GET', `/api/admin/customers/${created.id}`), { id: created.id });
    expect(status).toBe(200);
    expect(body.data.fullName).toBe('Detail Guy');
  });

  it('returns 404 for a missing customer id', async () => {
    const { status } = await invoke(getCustomer, req('GET', '/api/admin/customers/nope'), { id: 'nope' });
    expect(status).toBe(404);
  });

  it('patches a customer', async () => {
    const c = await prisma.customer.create({ data: { fullName: 'Old Name', phoneNumber: '9000000010' } });
    const { status } = await invoke(patchCustomer, req('PATCH', `/api/admin/customers/${c.id}`, { fullName: 'New Name' }), { id: c.id });
    expect(status).toBe(200);
    const row = await prisma.customer.findUnique({ where: { id: c.id } });
    expect(row?.fullName).toBe('New Name');
  });
});
