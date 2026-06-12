import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { asRole, req, invoke, ensureSeedAdmin, resetDb, prisma, seed } from './helpers';
import { POST as createJobCard } from '@/app/api/admin/job-cards/route';
import { POST as addLine, PATCH as patchLine, DELETE as delLine } from '@/app/api/admin/invoices/[id]/line-items/route';
import { POST as finalize } from '@/app/api/admin/invoices/[id]/finalize/route';
import { POST as addPayment } from '@/app/api/admin/invoices/[id]/payments/route';
import { POST as createPlan } from '@/app/api/admin/amc/plans/route';
import { POST as createAppt } from '@/app/api/admin/appointments/route';

describe('invoice line PART path → deducts stock + creates STOCK_OUT (integration)', () => {
  beforeAll(async () => { await resetDb(); await ensureSeedAdmin(); });
  beforeEach(() => asRole('SUPER_ADMIN'));

  it('adding a PART line on an invoice (no job card) decrements stock + writes a STOCK_OUT row', async () => {
    const c = await seed.customer();
    const v = await seed.vehicle(c.id);
    const cat = await seed.category();
    const item = await seed.item(cat.id, { quantityInStock: 5, sellingPrice: 100 });

    // Direct invoice POST (counter sale) so jobCardId is null
    const { POST: createInvoice } = await import('@/app/api/admin/invoices/route');
    const inv = await invoke(createInvoice, req('POST', '/api/admin/invoices', {
      customerId: c.id, vehicleId: v.id,
      invoiceDate: '2026-06-12',
      lineItems: [{ lineType: 'LABOR', description: 'wipe', quantity: 1, unitPrice: 50, taxRate: 0, sortOrder: 0 }],
    }));
    expect([200, 201]).toContain(inv.status);
    const invoiceId = inv.body.data.id;

    const r = await invoke(addLine, req('POST', `/api/admin/invoices/${invoiceId}/line-items`, {
      lineType: 'PART', description: item.itemName, quantity: 2, unitPrice: 100,
      inventoryItemId: item.id,
    }), { id: invoiceId });
    expect(r.status).toBeLessThan(300);

    const after = await prisma.inventoryItem.findUnique({ where: { id: item.id } });
    expect(Number(after!.quantityInStock)).toBe(3); // 5 - 2
    const mv = await prisma.stockMovement.findFirst({ where: { inventoryItemId: item.id, movementType: 'STOCK_OUT' } });
    expect(mv).toBeTruthy();
    expect(Number(mv!.quantity)).toBe(2);
  });

  it('PART line on a non-existent inventoryItemId returns 400', async () => {
    const c = await seed.customer();
    const v = await seed.vehicle(c.id);
    const { POST: createInvoice } = await import('@/app/api/admin/invoices/route');
    const inv = await invoke(createInvoice, req('POST', '/api/admin/invoices', {
      customerId: c.id, vehicleId: v.id, invoiceDate: '2026-06-12',
      lineItems: [{ lineType: 'LABOR', description: 'x', quantity: 1, unitPrice: 10, taxRate: 0, sortOrder: 0 }],
    }));
    const r = await invoke(addLine, req('POST', `/api/admin/invoices/${inv.body.data.id}/line-items`, {
      lineType: 'PART', description: 'missing', quantity: 1, unitPrice: 10,
      inventoryItemId: 'does-not-exist-cuid',
    }), { id: inv.body.data.id });
    expect(r.status).toBeGreaterThanOrEqual(400);
  });

  it('PART line with insufficient stock returns 400', async () => {
    const c = await seed.customer();
    const v = await seed.vehicle(c.id);
    const cat = await seed.category();
    const item = await seed.item(cat.id, { quantityInStock: 1, sellingPrice: 100 });
    const { POST: createInvoice } = await import('@/app/api/admin/invoices/route');
    const inv = await invoke(createInvoice, req('POST', '/api/admin/invoices', {
      customerId: c.id, vehicleId: v.id, invoiceDate: '2026-06-12',
      lineItems: [{ lineType: 'LABOR', description: 'x', quantity: 1, unitPrice: 10, taxRate: 0, sortOrder: 0 }],
    }));
    const r = await invoke(addLine, req('POST', `/api/admin/invoices/${inv.body.data.id}/line-items`, {
      lineType: 'PART', description: item.itemName, quantity: 5, unitPrice: 100,
      inventoryItemId: item.id,
    }), { id: inv.body.data.id });
    expect(r.status).toBeGreaterThanOrEqual(400);
  });

  it('DELETE a PART line restores stock', async () => {
    const c = await seed.customer();
    const v = await seed.vehicle(c.id);
    const cat = await seed.category();
    const item = await seed.item(cat.id, { quantityInStock: 5, sellingPrice: 100 });
    const { POST: createInvoice } = await import('@/app/api/admin/invoices/route');
    const inv = await invoke(createInvoice, req('POST', '/api/admin/invoices', {
      customerId: c.id, vehicleId: v.id, invoiceDate: '2026-06-12',
      lineItems: [{ lineType: 'LABOR', description: 'x', quantity: 1, unitPrice: 10, taxRate: 0, sortOrder: 0 }],
    }));
    const lr = await invoke(addLine, req('POST', `/api/admin/invoices/${inv.body.data.id}/line-items`, {
      lineType: 'PART', description: item.itemName, quantity: 2, unitPrice: 100,
      inventoryItemId: item.id,
    }), { id: inv.body.data.id });
    expect(Number((await prisma.inventoryItem.findUnique({ where: { id: item.id } }))!.quantityInStock)).toBe(3);
    const dr = await invoke(delLine, req('DELETE', `/api/admin/invoices/${inv.body.data.id}/line-items?lineItemId=${lr.body.data.id}`), { id: inv.body.data.id });
    expect(dr.status).toBe(200);
    expect(Number((await prisma.inventoryItem.findUnique({ where: { id: item.id } }))!.quantityInStock)).toBe(5);
  });
});

describe('payment activates AMC contract on a plan-purchase line (integration)', () => {
  beforeAll(async () => { await resetDb(); await ensureSeedAdmin(); });
  beforeEach(() => asRole('SUPER_ADMIN'));

  it('paying an invoice with an AMC PLAN line spawns an AmcContract', async () => {
    const c = await seed.customer();
    const v = await seed.vehicle(c.id);
    const jc = await invoke(createJobCard, req('POST', '/api/admin/job-cards', { customerId: c.id, vehicleId: v.id, issueSummary: 'amc-buy' }));
    const inv = await prisma.invoice.findFirst({ where: { jobCardId: jc.body.data.id } });

    const plan = await invoke(createPlan, req('POST', '/api/admin/amc/plans', { planName: 'PaymentSpawn', vehicleType: 'BIKE', durationMonths: 6, totalServicesIncluded: 3, price: 600 }));
    await invoke(addLine, req('POST', `/api/admin/invoices/${inv!.id}/line-items`, { lineType: 'AMC', description: 'AMC purchase', amcPlanId: plan.body.data.id }), { id: inv!.id });
    await invoke(finalize, req('POST', `/api/admin/invoices/${inv!.id}/finalize`), { id: inv!.id });
    await invoke(addPayment, req('POST', `/api/admin/invoices/${inv!.id}/payments`, { amount: 600, paymentMode: 'UPI', paymentDate: '2026-06-12' }), { id: inv!.id });

    const contracts = await prisma.amcContract.findMany({ where: { vehicleId: v.id } });
    expect(contracts.length).toBeGreaterThan(0);
    const contract = contracts[0];
    expect(contract.amcPlanId).toBe(plan.body.data.id);
    expect(contract.servicesRemaining).toBe(2); // first usage auto-recorded
  });
});

describe('invoices line-items recompute round-trip (integration)', () => {
  beforeAll(async () => { await resetDb(); await ensureSeedAdmin(); });
  beforeEach(() => asRole('SUPER_ADMIN'));

  it('PATCH a regular line + DELETE chain — totals stay consistent', async () => {
    const c = await seed.customer();
    const v = await seed.vehicle(c.id);
    const jc = await invoke(createJobCard, req('POST', '/api/admin/job-cards', { customerId: c.id, vehicleId: v.id, issueSummary: 'rt' }));
    const inv = await prisma.invoice.findFirst({ where: { jobCardId: jc.body.data.id } });
    const l1 = await invoke(addLine, req('POST', `/api/admin/invoices/${inv!.id}/line-items`, { lineType: 'LABOR', description: 'l1', quantity: 1, unitPrice: 200 }), { id: inv!.id });
    const l2 = await invoke(addLine, req('POST', `/api/admin/invoices/${inv!.id}/line-items`, { lineType: 'SERVICE_CHARGE', description: 'l2', quantity: 1, unitPrice: 300, taxRate: 10 }), { id: inv!.id });
    // PATCH l1: qty 1→2 unitPrice 200 → 200 ⇒ contribution 400; l2 net 300 + 30 tax = 330; total = 730
    await invoke(patchLine, req('PATCH', `/api/admin/invoices/${inv!.id}/line-items`, { lineItemId: l1.body.data.id, quantity: 2 }), { id: inv!.id });
    let row = await prisma.invoice.findUnique({ where: { id: inv!.id } });
    expect(Math.round(Number(row!.grandTotal))).toBe(730);
    // DELETE l2 → total = 400
    await invoke(delLine, req('DELETE', `/api/admin/invoices/${inv!.id}/line-items?lineItemId=${l2.body.data.id}`), { id: inv!.id });
    row = await prisma.invoice.findUnique({ where: { id: inv!.id } });
    expect(Math.round(Number(row!.grandTotal))).toBe(400);
  });
});

describe('appointments capacity rule (integration)', () => {
  beforeAll(async () => {
    await resetDb(); await ensureSeedAdmin();
    // 1-slot capacity rule for Wed (dayOfWeek=3) 9–10am
    await prisma.appointmentSlotRule.create({ data: { dayOfWeek: 3, openTime: '09:00', closeTime: '10:00', slotDurationMinutes: 60, maxCapacity: 1 } });
  });
  beforeEach(() => asRole('SUPER_ADMIN'));

  it('second appointment in the same capacity-1 slot is refused', async () => {
    const c1 = await seed.customer(); const v1 = await seed.vehicle(c1.id);
    const c2 = await seed.customer(); const v2 = await seed.vehicle(c2.id);
    // 2026-12-02 is a Wednesday
    const a1 = await invoke(createAppt, req('POST', '/api/admin/appointments', {
      customerId: c1.id, vehicleId: v1.id,
      appointmentDate: '2026-12-02T00:00:00.000Z',
      slotStart: '2026-12-02T09:00:00.000Z', slotEnd: '2026-12-02T10:00:00.000Z',
    }));
    expect([200, 201]).toContain(a1.status);
    const a2 = await invoke(createAppt, req('POST', '/api/admin/appointments', {
      customerId: c2.id, vehicleId: v2.id,
      appointmentDate: '2026-12-02T00:00:00.000Z',
      slotStart: '2026-12-02T09:00:00.000Z', slotEnd: '2026-12-02T10:00:00.000Z',
    }));
    expect(a2.status).toBe(409);
  });
});
