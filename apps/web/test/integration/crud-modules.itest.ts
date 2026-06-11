import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { asRole, req, invoke, ensureSeedAdmin, resetDb, prisma, seed } from './helpers';
import { GET as listVehicles, POST as createVehicle } from '@/app/api/admin/vehicles/route';
import { GET as getVehicle, PATCH as patchVehicle, DELETE as delVehicle } from '@/app/api/admin/vehicles/[id]/route';
import { GET as listCats, POST as createCat } from '@/app/api/admin/inventory/categories/route';
import { PATCH as patchCat, DELETE as delCat } from '@/app/api/admin/inventory/categories/[id]/route';
import { GET as listSup, POST as createSup } from '@/app/api/admin/inventory/suppliers/route';
import { GET as listExp, POST as createExp } from '@/app/api/admin/expenses/route';
import { GET as listExpCat, POST as createExpCat } from '@/app/api/admin/expenses/categories/route';
import { GET as custHistory } from '@/app/api/admin/customers/[id]/history/route';
import { DELETE as delCustomer } from '@/app/api/admin/customers/[id]/route';

describe('vehicles (integration)', () => {
  let customerId: string;
  beforeAll(async () => { await resetDb(); await ensureSeedAdmin(); customerId = (await seed.customer()).id; });
  beforeEach(() => asRole('SUPER_ADMIN'));

  it('creates a vehicle bound to a customer', async () => {
    const { status, body } = await invoke(createVehicle, req('POST', '/api/admin/vehicles', { customerId, vehicleType: 'BIKE', registrationNumber: 'WB-10-AA-1111', brand: 'Hero', model: 'Splendor' }));
    expect(status).toBe(201);
    expect(body.data.registrationNumber).toBe('WB-10-AA-1111');
  });
  it('rejects a vehicle for a non-existent customer', async () => {
    const { status } = await invoke(createVehicle, req('POST', '/api/admin/vehicles', { customerId: 'ghost', vehicleType: 'BIKE', registrationNumber: 'WB-10-AA-2222', brand: 'X', model: 'Y' }));
    expect(status).toBeGreaterThanOrEqual(400);
  });
  it('rejects invalid vehicleType enum', async () => {
    const { status } = await invoke(createVehicle, req('POST', '/api/admin/vehicles', { customerId, vehicleType: 'PLANE', registrationNumber: 'WB-10-AA-3333', brand: 'X', model: 'Y' }));
    expect(status).toBe(400);
  });
  it('lists, gets, patches a vehicle', async () => {
    const v = await seed.vehicle(customerId);
    expect((await invoke(listVehicles, req('GET', '/api/admin/vehicles?pageSize=5'))).status).toBe(200);
    expect((await invoke(getVehicle, req('GET', `/api/admin/vehicles/${v.id}`), { id: v.id })).status).toBe(200);
    const patched = await invoke(patchVehicle, req('PATCH', `/api/admin/vehicles/${v.id}`, { color: 'Red' }), { id: v.id });
    expect(patched.status).toBe(200);
  });
  it('deletes a vehicle with no dependents', async () => {
    const v = await seed.vehicle(customerId);
    const { status } = await invoke(delVehicle, req('DELETE', `/api/admin/vehicles/${v.id}`), { id: v.id });
    expect(status).toBe(200);
    expect(await prisma.vehicle.findUnique({ where: { id: v.id } })).toBeNull();
  });
});

describe('inventory categories & suppliers (integration)', () => {
  beforeAll(async () => { await resetDb(); await ensureSeedAdmin(); });
  beforeEach(() => asRole('SUPER_ADMIN'));

  it('creates + lists a category', async () => {
    const { status, body } = await invoke(createCat, req('POST', '/api/admin/inventory/categories', { categoryName: 'Oils' }));
    expect(status).toBe(201);
    const list = await invoke(listCats, req('GET', '/api/admin/inventory/categories'));
    expect(list.body.data.some((c: any) => c.id === body.data.id)).toBe(true);
  });
  it('patches + deletes an empty category', async () => {
    const c = await prisma.inventoryCategory.create({ data: { categoryName: 'Temp' } });
    expect((await invoke(patchCat, req('PATCH', `/api/admin/inventory/categories/${c.id}`, { categoryName: 'Renamed' }), { id: c.id })).status).toBe(200);
    expect((await invoke(delCat, req('DELETE', `/api/admin/inventory/categories/${c.id}`), { id: c.id })).status).toBe(200);
  });
  it('creates a supplier; rejects a malformed phone', async () => {
    expect((await invoke(createSup, req('POST', '/api/admin/inventory/suppliers', { supplierName: 'Acme', phone: '9876543210' }))).status).toBe(201);
    expect((await invoke(createSup, req('POST', '/api/admin/inventory/suppliers', { supplierName: 'Bad', phone: 'abc' }))).status).toBe(400);
    expect((await invoke(listSup, req('GET', '/api/admin/inventory/suppliers'))).status).toBe(200);
  });
});

describe('expenses & categories (integration)', () => {
  let catId: string;
  beforeAll(async () => {
    await resetDb(); await ensureSeedAdmin();
    catId = (await prisma.expenseCategory.create({ data: { categoryName: 'Rent' } })).id;
  });
  beforeEach(() => asRole('SUPER_ADMIN'));

  it('creates an expense with category FK and lists it (no 500 on include)', async () => {
    const { status } = await invoke(createExp, req('POST', '/api/admin/expenses', { expenseDate: '2026-06-12', categoryId: catId, title: 'June rent', amount: 18000, paymentMode: 'CASH' }));
    expect(status).toBe(201);
    const list = await invoke(listExp, req('GET', '/api/admin/expenses?pageSize=10'));
    expect(list.status).toBe(200);
  });
  it('coerces empty-string paymentMode to undefined', async () => {
    const { status } = await invoke(createExp, req('POST', '/api/admin/expenses', { expenseDate: '2026-06-12', categoryId: catId, title: 'misc', amount: 5, paymentMode: '' }));
    expect(status).toBe(201);
  });
  it('creates + lists an expense category', async () => {
    expect((await invoke(createExpCat, req('POST', '/api/admin/expenses/categories', { categoryName: 'Utilities' }))).status).toBe(201);
    expect((await invoke(listExpCat, req('GET', '/api/admin/expenses/categories'))).status).toBe(200);
  });
});

describe('customer history + delete (integration)', () => {
  beforeAll(async () => { await resetDb(); await ensureSeedAdmin(); });
  beforeEach(() => asRole('SUPER_ADMIN'));

  it('returns paginated history for a customer', async () => {
    const c = await seed.customer();
    const { status, body } = await invoke(custHistory, req('GET', `/api/admin/customers/${c.id}/history`), { id: c.id });
    expect(status).toBe(200);
    expect(body.meta || body.data).toBeTruthy();
  });
  it('deletes a customer with no dependents', async () => {
    const c = await seed.customer();
    const { status } = await invoke(delCustomer, req('DELETE', `/api/admin/customers/${c.id}`), { id: c.id });
    expect(status).toBe(200);
  });
});
