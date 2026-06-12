import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { asRole, req, invoke, ensureSeedAdmin, resetDb, prisma, seed } from './helpers';
import { POST as createJobCard } from '@/app/api/admin/job-cards/route';
import { GET as getInvoice, PATCH as patchInvoice } from '@/app/api/admin/invoices/[id]/route';
import { POST as addLine } from '@/app/api/admin/invoices/[id]/line-items/route';
import { POST as finalize } from '@/app/api/admin/invoices/[id]/finalize/route';
import { GET as pdfRoute } from '@/app/api/admin/invoices/[id]/pdf/route';
import { GET as getExpense, PATCH as patchExpense, DELETE as delExpense } from '@/app/api/admin/expenses/[id]/route';
import { POST as createExp } from '@/app/api/admin/expenses/route';
import { GET as getItem, PATCH as patchItem, DELETE as delItem } from '@/app/api/admin/inventory/items/[id]/route';
import { POST as addPart } from '@/app/api/admin/job-cards/[id]/parts/route';
import { GET as getAppt, PATCH as patchAppt } from '@/app/api/admin/appointments/[id]/route';
import { POST as createAppt } from '@/app/api/admin/appointments/route';

async function freshInvoice() {
  const c = await seed.customer();
  const v = await seed.vehicle(c.id);
  const jc = await invoke(createJobCard, req('POST', '/api/admin/job-cards', { customerId: c.id, vehicleId: v.id, issueSummary: 'detail' }));
  const inv = await prisma.invoice.findFirst({ where: { jobCardId: jc.body.data.id } });
  return { customerId: c.id, vehicleId: v.id, jobCardId: jc.body.data.id, invoiceId: inv!.id };
}

describe('invoice detail + PDF (integration)', () => {
  beforeAll(async () => { await resetDb(); await ensureSeedAdmin(); });
  beforeEach(() => asRole('SUPER_ADMIN'));

  it('GET invoice returns line items + payments + relations', async () => {
    const { invoiceId } = await freshInvoice();
    await invoke(addLine, req('POST', `/api/admin/invoices/${invoiceId}/line-items`, { lineType: 'LABOR', description: 'work', quantity: 1, unitPrice: 200 }), { id: invoiceId });
    const { status, body } = await invoke(getInvoice, req('GET', `/api/admin/invoices/${invoiceId}`), { id: invoiceId });
    expect(status).toBe(200);
    expect(body.data.lineItems.length).toBeGreaterThan(0);
    expect(body.data.customer).toBeTruthy();
  });

  it('PATCH notes / dueDate / discountType on a DRAFT invoice', async () => {
    const { invoiceId } = await freshInvoice();
    const { status } = await invoke(patchInvoice, req('PATCH', `/api/admin/invoices/${invoiceId}`, { notes: 'careful', dueDate: '2026-07-01', discountType: 'PERCENT', discountValue: 5 }), { id: invoiceId });
    expect(status).toBe(200);
    const row = await prisma.invoice.findUnique({ where: { id: invoiceId } });
    expect(row?.notes).toBe('careful');
  });

  it('PATCH discount on a FINALIZED invoice is refused (409)', async () => {
    const { invoiceId } = await freshInvoice();
    await invoke(addLine, req('POST', `/api/admin/invoices/${invoiceId}/line-items`, { lineType: 'SERVICE_CHARGE', description: 's', quantity: 1, unitPrice: 100 }), { id: invoiceId });
    await invoke(finalize, req('POST', `/api/admin/invoices/${invoiceId}/finalize`), { id: invoiceId });
    const { status } = await invoke(patchInvoice, req('PATCH', `/api/admin/invoices/${invoiceId}`, { discountValue: 99 }), { id: invoiceId });
    expect(status).toBe(409);
  });

  it('GET PDF renders > 1KB for a finalized invoice', async () => {
    const { invoiceId } = await freshInvoice();
    await invoke(addLine, req('POST', `/api/admin/invoices/${invoiceId}/line-items`, { lineType: 'SERVICE_CHARGE', description: 's', quantity: 1, unitPrice: 100 }), { id: invoiceId });
    await invoke(finalize, req('POST', `/api/admin/invoices/${invoiceId}/finalize`), { id: invoiceId });
    const res = await pdfRoute(req('GET', `/api/admin/invoices/${invoiceId}/pdf`) as any, { params: { id: invoiceId } } as any);
    expect(res.status).toBe(200);
    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf.length).toBeGreaterThan(1024);
  });

  it('GET PDF for a non-existent invoice returns 404', async () => {
    const res = await pdfRoute(req('GET', `/api/admin/invoices/missing/pdf`) as any, { params: { id: 'missing' } } as any);
    expect(res.status).toBe(404);
  });

  it('GET PDF on a DRAFT invoice with a custom-copy variant', async () => {
    const { invoiceId } = await freshInvoice();
    await invoke(addLine, req('POST', `/api/admin/invoices/${invoiceId}/line-items`, { lineType: 'SERVICE_CHARGE', description: 's', quantity: 1, unitPrice: 50 }), { id: invoiceId });
    const res = await pdfRoute(req('GET', `/api/admin/invoices/${invoiceId}/pdf?variant=customer`) as any, { params: { id: invoiceId } } as any);
    expect([200, 400, 404]).toContain(res.status);
  });
});

describe('expense detail (integration)', () => {
  let catId: string;
  beforeAll(async () => { await resetDb(); await ensureSeedAdmin(); catId = (await prisma.expenseCategory.create({ data: { categoryName: 'Util' } })).id; });
  beforeEach(() => asRole('SUPER_ADMIN'));

  async function newExp() {
    const r = await invoke(createExp, req('POST', '/api/admin/expenses', { expenseDate: '2026-06-12', categoryId: catId, title: 't', amount: 100, paymentMode: 'CASH' }));
    return r.body.data.id;
  }

  it('GET / PATCH / DELETE flow', async () => {
    const id = await newExp();
    expect((await invoke(getExpense, req('GET', `/api/admin/expenses/${id}`), { id })).status).toBe(200);
    expect((await invoke(patchExpense, req('PATCH', `/api/admin/expenses/${id}`, { title: 'new title', amount: 222 }), { id })).status).toBe(200);
    const after = await prisma.expense.findUnique({ where: { id } });
    expect(after?.title).toBe('new title');
    expect((await invoke(delExpense, req('DELETE', `/api/admin/expenses/${id}`), { id })).status).toBe(200);
    expect(await prisma.expense.findUnique({ where: { id } })).toBeNull();
  });

  it('PATCH with empty body returns 400 NO_CHANGES', async () => {
    const id = await newExp();
    const { status, body } = await invoke(patchExpense, req('PATCH', `/api/admin/expenses/${id}`, {}), { id });
    expect(status).toBe(400);
    expect(body.error.code).toBe('NO_CHANGES');
  });
});

describe('inventory item detail (integration)', () => {
  let catId: string;
  beforeAll(async () => { await resetDb(); await ensureSeedAdmin(); catId = (await seed.category()).id; });
  beforeEach(() => asRole('SUPER_ADMIN'));

  it('GET + PATCH + DELETE an item with no reservations', async () => {
    const item = await seed.item(catId);
    expect((await invoke(getItem, req('GET', `/api/admin/inventory/items/${item.id}`), { id: item.id })).status).toBe(200);
    expect((await invoke(patchItem, req('PATCH', `/api/admin/inventory/items/${item.id}`, { itemName: 'Renamed', sellingPrice: 250 }), { id: item.id })).status).toBe(200);
    const after = await prisma.inventoryItem.findUnique({ where: { id: item.id } });
    expect(after?.itemName).toBe('Renamed');
    expect((await invoke(delItem, req('DELETE', `/api/admin/inventory/items/${item.id}`), { id: item.id })).status).toBe(200);
    expect(await prisma.inventoryItem.findUnique({ where: { id: item.id } })).toBeNull();
  });

  it('DELETE refuses an item with reserved units (409)', async () => {
    const item = await seed.item(catId, { quantityInStock: 5 });
    const c = await seed.customer();
    const v = await seed.vehicle(c.id);
    const jc = await invoke(createJobCard, req('POST', '/api/admin/job-cards', { customerId: c.id, vehicleId: v.id, issueSummary: 'r' }));
    await invoke(addPart, req('POST', `/api/admin/job-cards/${jc.body.data.id}/parts`, { inventoryItemId: item.id, requiredQty: 1 }), { id: jc.body.data.id });
    const { status, body } = await invoke(delItem, req('DELETE', `/api/admin/inventory/items/${item.id}`), { id: item.id });
    expect(status).toBe(409);
    expect(body.error.code).toBe('CONFLICT');
  });
});

describe('appointment detail + transitions (integration)', () => {
  let customerId: string, vehicleId: string;
  beforeAll(async () => {
    await resetDb(); await ensureSeedAdmin();
    const c = await seed.customer(); customerId = c.id; vehicleId = (await seed.vehicle(c.id)).id;
  });
  beforeEach(() => asRole('SUPER_ADMIN'));

  async function newAppt(status: any = 'CONFIRMED') {
    const a = await invoke(createAppt, req('POST', '/api/admin/appointments', {
      customerId, vehicleId,
      appointmentDate: '2026-08-01T00:00:00.000Z',
      slotStart: '2026-08-01T09:00:00.000Z',
      slotEnd: '2026-08-01T10:00:00.000Z',
    }));
    if (status !== a.body.data.status) {
      await prisma.appointment.update({ where: { id: a.body.data.id }, data: { status } });
    }
    return a.body.data.id;
  }

  it('GET returns appointment with relations', async () => {
    const id = await newAppt('CONFIRMED');
    const { status, body } = await invoke(getAppt, req('GET', `/api/admin/appointments/${id}`), { id });
    expect(status).toBe(200);
    expect(body.data.customer).toBeTruthy();
  });

  it('CONFIRMED → CHECKED_IN is allowed', async () => {
    const id = await newAppt('CONFIRMED');
    const { status } = await invoke(patchAppt, req('PATCH', `/api/admin/appointments/${id}`, { status: 'CHECKED_IN' }), { id });
    expect(status).toBe(200);
  });

  it('COMPLETED is terminal — CONFIRMED→COMPLETED via CHECKED_IN works; CONFIRMED→COMPLETED direct refused', async () => {
    const id1 = await newAppt('CONFIRMED');
    expect((await invoke(patchAppt, req('PATCH', `/api/admin/appointments/${id1}`, { status: 'COMPLETED' }), { id: id1 })).status).toBeGreaterThanOrEqual(400);
    const id2 = await newAppt('CHECKED_IN');
    expect((await invoke(patchAppt, req('PATCH', `/api/admin/appointments/${id2}`, { status: 'COMPLETED' }), { id: id2 })).status).toBe(200);
  });

  it('CANCELLED requires cancellationReason', async () => {
    const id = await newAppt('CONFIRMED');
    expect((await invoke(patchAppt, req('PATCH', `/api/admin/appointments/${id}`, { status: 'CANCELLED' }), { id })).status).toBe(400);
    expect((await invoke(patchAppt, req('PATCH', `/api/admin/appointments/${id}`, { status: 'CANCELLED', cancellationReason: 'customer no-show' }), { id })).status).toBe(200);
  });

  it('terminal state COMPLETED cannot transition anywhere', async () => {
    const id = await newAppt('COMPLETED');
    expect((await invoke(patchAppt, req('PATCH', `/api/admin/appointments/${id}`, { status: 'CHECKED_IN' }), { id })).status).toBeGreaterThanOrEqual(400);
  });
});
