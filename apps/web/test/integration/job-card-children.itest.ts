import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { asRole, req, invoke, ensureSeedAdmin, resetDb, prisma, seed } from './helpers';
import { POST as createJobCard } from '@/app/api/admin/job-cards/route';
import { POST as addTask, PATCH as patchTask, DELETE as delTask } from '@/app/api/admin/job-cards/[id]/tasks/route';
import { POST as assignWorker, DELETE as unassignWorker } from '@/app/api/admin/job-cards/[id]/workers/route';
import { POST as addPart, PATCH as patchPart, DELETE as delPart } from '@/app/api/admin/job-cards/[id]/parts/route';
import { POST as addLine, PATCH as patchLine, DELETE as delLine } from '@/app/api/admin/invoices/[id]/line-items/route';

async function fixtureJobCard() {
  const c = await seed.customer();
  const v = await seed.vehicle(c.id);
  const jc = await invoke(createJobCard, req('POST', '/api/admin/job-cards', { customerId: c.id, vehicleId: v.id, issueSummary: 'child ops' }));
  const inv = await prisma.invoice.findFirst({ where: { jobCardId: jc.body.data.id } });
  return { jcId: jc.body.data.id, invoiceId: inv!.id };
}

describe('job-card children: tasks / workers / parts (integration)', () => {
  beforeAll(async () => { await resetDb(); await ensureSeedAdmin(); });
  beforeEach(() => asRole('SUPER_ADMIN'));

  it('adds, updates, and removes a task', async () => {
    const { jcId } = await fixtureJobCard();
    const add = await invoke(addTask, req('POST', `/api/admin/job-cards/${jcId}/tasks`, { taskName: 'Oil change', status: 'PENDING' }), { id: jcId });
    expect(add.status).toBe(201);
    const taskId = add.body.data.id;
    expect((await invoke(patchTask, req('PATCH', `/api/admin/job-cards/${jcId}/tasks`, { taskId, status: 'DONE' }), { id: jcId })).status).toBe(200);
    expect((await invoke(delTask, req('DELETE', `/api/admin/job-cards/${jcId}/tasks?taskId=${taskId}`), { id: jcId })).status).toBe(200);
    expect(await prisma.jobCardTask.findUnique({ where: { id: taskId } })).toBeNull();
  });

  it('assigns then unassigns a worker', async () => {
    const { jcId } = await fixtureJobCard();
    const w = await seed.worker();
    const a = await invoke(assignWorker, req('POST', `/api/admin/job-cards/${jcId}/workers`, { workerId: w.id }), { id: jcId });
    expect(a.status).toBe(201);
    const assignmentId = a.body.data.id;
    expect((await invoke(unassignWorker, req('DELETE', `/api/admin/job-cards/${jcId}/workers?assignmentId=${assignmentId}`), { id: jcId })).status).toBe(200);
    expect(await prisma.workerAssignment.findUnique({ where: { id: assignmentId } })).toBeNull();
  });

  it('adding a part reserves stock; removing it releases stock', async () => {
    const { jcId } = await fixtureJobCard();
    const cat = await seed.category();
    const item = await seed.item(cat.id, { quantityInStock: 20 });
    const add = await invoke(addPart, req('POST', `/api/admin/job-cards/${jcId}/parts`, { inventoryItemId: item.id, requiredQty: 4 }), { id: jcId });
    expect(add.status).toBe(201);
    expect(Number((await prisma.inventoryItem.findUnique({ where: { id: item.id } }))!.reservedQuantity)).toBe(4);
    const partId = add.body.data.id;
    const del = await invoke(delPart, req('DELETE', `/api/admin/job-cards/${jcId}/parts?partId=${partId}`), { id: jcId });
    expect([200, 204]).toContain(del.status);
    expect(Number((await prisma.inventoryItem.findUnique({ where: { id: item.id } }))!.reservedQuantity)).toBe(0);
  });

  it('reserving more than stock is refused', async () => {
    const { jcId } = await fixtureJobCard();
    const cat = await seed.category();
    const item = await seed.item(cat.id, { quantityInStock: 2 });
    const { status } = await invoke(addPart, req('POST', `/api/admin/job-cards/${jcId}/parts`, { inventoryItemId: item.id, requiredQty: 5 }), { id: jcId });
    expect(status).toBeGreaterThanOrEqual(400);
  });
});

describe('invoice line-item edit/remove recompute (integration)', () => {
  beforeAll(async () => { await resetDb(); await ensureSeedAdmin(); });
  beforeEach(() => asRole('SUPER_ADMIN'));

  it('recomputes grandTotal when a line is edited and removed', async () => {
    const { invoiceId } = await fixtureJobCard();
    const l1 = await invoke(addLine, req('POST', `/api/admin/invoices/${invoiceId}/line-items`, { lineType: 'SERVICE_CHARGE', description: 'svc', quantity: 1, unitPrice: 500 }), { id: invoiceId });
    await invoke(addLine, req('POST', `/api/admin/invoices/${invoiceId}/line-items`, { lineType: 'LABOR', description: 'labor', quantity: 1, unitPrice: 300 }), { id: invoiceId });
    let inv = await prisma.invoice.findUnique({ where: { id: invoiceId } });
    expect(Math.round(Number(inv!.grandTotal))).toBe(800);

    // edit line 1 → 700; total becomes 1000
    await invoke(patchLine, req('PATCH', `/api/admin/invoices/${invoiceId}/line-items`, { lineItemId: l1.body.data.id, quantity: 1, unitPrice: 700 }), { id: invoiceId });
    inv = await prisma.invoice.findUnique({ where: { id: invoiceId } });
    expect(Math.round(Number(inv!.grandTotal))).toBe(1000);

    // remove line 1 → only labor 300 remains
    await invoke(delLine, req('DELETE', `/api/admin/invoices/${invoiceId}/line-items?lineItemId=${l1.body.data.id}`), { id: invoiceId });
    inv = await prisma.invoice.findUnique({ where: { id: invoiceId } });
    expect(Math.round(Number(inv!.grandTotal))).toBe(300);
  });
});
