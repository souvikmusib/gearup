import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { asRole, req, invoke, ensureSeedAdmin, resetDb, prisma, seed } from './helpers';
import { GET as logsList } from '@/app/api/admin/logs/route';
import { GET as logsExport } from '@/app/api/admin/logs/export/route';
import { GET as moves } from '@/app/api/admin/inventory/movements/route';
import { POST as createJobCard } from '@/app/api/admin/job-cards/route';
import { POST as stockMove } from '@/app/api/admin/inventory/items/[id]/stock/route';
import { PATCH as patchExpCat, DELETE as delExpCat } from '@/app/api/admin/expenses/categories/[id]/route';
import { PATCH as patchSup, DELETE as delSup } from '@/app/api/admin/inventory/suppliers/[id]/route';
import { GET as getWorker, PATCH as patchWorker } from '@/app/api/admin/workers/[id]/route';
import { GET as workerCalendar } from '@/app/api/admin/workers/calendar/route';
import { GET as estimateGet, POST as estimatePost } from '@/app/api/public/estimate/[token]/route';
import { PATCH as patchJobCard } from '@/app/api/admin/job-cards/[id]/route';
import { GET as exportSettings } from '@/app/api/admin/settings/export/route';

describe('logs list + export (integration)', () => {
  beforeAll(async () => { await resetDb(); await ensureSeedAdmin(); });
  beforeEach(() => asRole('SUPER_ADMIN'));

  it('logs list returns activity entries', async () => {
    // generate an event
    const c = await seed.customer();
    await prisma.activityLog.create({ data: { entityType: 'Customer', entityId: c.id, action: 'test.event', actorType: 'ADMIN' } });
    const { status, body } = await invoke(logsList, req('GET', '/api/admin/logs?pageSize=10'));
    expect(status).toBe(200);
    expect(Array.isArray(body.data)).toBe(true);
  });

  it('logs export returns CSV', async () => {
    const res = await logsExport(req('GET', '/api/admin/logs/export') as any);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/text\/csv/i);
    const text = await res.text();
    expect(text.length).toBeGreaterThan(0);
  });
});

describe('inventory movements list (integration)', () => {
  beforeAll(async () => { await resetDb(); await ensureSeedAdmin(); });
  beforeEach(() => asRole('SUPER_ADMIN'));

  it('lists movements, filterable by type', async () => {
    const cat = await seed.category();
    const item = await seed.item(cat.id, { quantityInStock: 10 });
    await invoke(stockMove, req('POST', `/api/admin/inventory/items/${item.id}/stock`, { type: 'STOCK_IN', quantity: 3 }), { id: item.id });
    const r1 = await invoke(moves, req('GET', '/api/admin/inventory/movements?pageSize=10'));
    expect(r1.status).toBe(200);
    const r2 = await invoke(moves, req('GET', '/api/admin/inventory/movements?movementType=STOCK_IN&pageSize=5'));
    expect(r2.status).toBe(200);
  });
});

describe('expense category detail + supplier detail (integration)', () => {
  beforeAll(async () => { await resetDb(); await ensureSeedAdmin(); });
  beforeEach(() => asRole('SUPER_ADMIN'));

  it('expense category PATCH + DELETE', async () => {
    const c = await prisma.expenseCategory.create({ data: { categoryName: 'Tmp' } });
    expect((await invoke(patchExpCat, req('PATCH', `/api/admin/expenses/categories/${c.id}`, { categoryName: 'Renamed' }), { id: c.id })).status).toBe(200);
    expect((await invoke(delExpCat, req('DELETE', `/api/admin/expenses/categories/${c.id}`), { id: c.id })).status).toBe(200);
  });

  it('supplier PATCH + DELETE', async () => {
    const s = await prisma.supplier.create({ data: { supplierName: 'Tmp Sup' } });
    expect((await invoke(patchSup, req('PATCH', `/api/admin/inventory/suppliers/${s.id}`, { supplierName: 'Renamed' }), { id: s.id })).status).toBe(200);
    expect((await invoke(delSup, req('DELETE', `/api/admin/inventory/suppliers/${s.id}`), { id: s.id })).status).toBe(200);
  });
});

describe('workers detail + calendar + JobCard PATCH non-cancel fields (integration)', () => {
  beforeAll(async () => { await resetDb(); await ensureSeedAdmin(); });
  beforeEach(() => asRole('SUPER_ADMIN'));

  it('GET worker detail + PATCH fullName', async () => {
    const w = await seed.worker();
    expect((await invoke(getWorker, req('GET', `/api/admin/workers/${w.id}`), { id: w.id })).status).toBe(200);
    expect((await invoke(patchWorker, req('PATCH', `/api/admin/workers/${w.id}`, { fullName: 'Updated' }), { id: w.id })).status).toBe(200);
  });

  it('worker calendar with a date range', async () => {
    const { status } = await invoke(workerCalendar, req('GET', '/api/admin/workers/calendar?from=2026-06-01&to=2026-07-01'));
    expect(status).toBe(200);
  });

  it('JobCard PATCH updates priority + cost fields (no cancel branch)', async () => {
    const c = await seed.customer();
    const v = await seed.vehicle(c.id);
    const jc = await invoke(createJobCard, req('POST', '/api/admin/job-cards', { customerId: c.id, vehicleId: v.id, issueSummary: 'x' }));
    const id = jc.body.data.id;
    const r = await invoke(patchJobCard, req('PATCH', `/api/admin/job-cards/${id}`, { priority: 'HIGH', estimatedTotal: 1234, diagnosisNotes: 'noted' }), { id });
    expect(r.status).toBe(200);
    const row = await prisma.jobCard.findUnique({ where: { id } });
    expect(row?.priority).toBe('HIGH');
    expect(Number(row?.estimatedTotal)).toBe(1234);
  });
});

describe('public estimate (integration)', () => {
  beforeAll(async () => { await resetDb(); await ensureSeedAdmin(); });
  beforeEach(() => asRole('SUPER_ADMIN'));

  it('GET with a malformed/unknown token returns 404 (no enumeration)', async () => {
    const r = await estimateGet(req('GET', '/api/public/estimate/bogus') as any, { params: { token: 'bogus' } } as any);
    expect(r.status).toBe(404);
  });

  it('POST with a malformed token returns 4xx', async () => {
    const r = await estimatePost(req('POST', '/api/public/estimate/bogus', { action: 'approved', estimateRevision: 'xxxxxxxx' }) as any, { params: { token: 'bogus' } } as any);
    expect(r.status).toBeGreaterThanOrEqual(400);
  });
});

describe('settings export (integration)', () => {
  beforeAll(async () => { await resetDb(); await ensureSeedAdmin(); });
  beforeEach(() => asRole('SUPER_ADMIN'));

  it('GET returns a JSON dump', async () => {
    const r = await exportSettings(req('GET', '/api/admin/settings/export') as any);
    expect(r.status).toBe(200);
  });
});
