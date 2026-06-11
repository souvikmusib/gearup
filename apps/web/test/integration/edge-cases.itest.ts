import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { asRole, req, invoke, ensureSeedAdmin, resetDb, prisma, seed } from './helpers';
import { POST as createJobCard } from '@/app/api/admin/job-cards/route';
import { POST as addLine } from '@/app/api/admin/invoices/[id]/line-items/route';
import { POST as finalize, DELETE as unfinalize } from '@/app/api/admin/invoices/[id]/finalize/route';
import { POST as addPayment } from '@/app/api/admin/invoices/[id]/payments/route';
import { POST as createPlan } from '@/app/api/admin/amc/plans/route';
import { POST as createContract } from '@/app/api/admin/amc/contracts/route';
import { POST as addPart } from '@/app/api/admin/job-cards/[id]/parts/route';
import { POST as stockMove } from '@/app/api/admin/inventory/items/[id]/stock/route';

async function freshInvoice() {
  const c = await seed.customer();
  const v = await seed.vehicle(c.id);
  const jc = await invoke(createJobCard, req('POST', '/api/admin/job-cards', { customerId: c.id, vehicleId: v.id, issueSummary: 'edge' }));
  const inv = await prisma.invoice.findFirst({ where: { jobCardId: jc.body.data.id } });
  return { customerId: c.id, vehicleId: v.id, jobCardId: jc.body.data.id, invoiceId: inv!.id };
}

describe('MONEY edge cases', () => {
  beforeAll(async () => { await resetDb(); await ensureSeedAdmin(); });
  beforeEach(() => asRole('SUPER_ADMIN'));

  it('100% percent discount zeroes the invoice (not negative)', async () => {
    const { invoiceId } = await freshInvoice();
    await invoke(addLine, req('POST', `/api/admin/invoices/${invoiceId}/line-items`, { lineType: 'SERVICE_CHARGE', description: 's', quantity: 1, unitPrice: 500 }), { id: invoiceId });
    await invoke(addLine, req('POST', `/api/admin/invoices/${invoiceId}/line-items`, { lineType: 'DISCOUNT_ADJUSTMENT', description: '100%', discountMode: 'percent', unitPrice: 100 }), { id: invoiceId });
    const inv = await prisma.invoice.findUnique({ where: { id: invoiceId } });
    expect(Math.round(Number(inv!.grandTotal))).toBe(0);
  });

  it('a flat discount larger than subtotal does not produce a positive total', async () => {
    const { invoiceId } = await freshInvoice();
    await invoke(addLine, req('POST', `/api/admin/invoices/${invoiceId}/line-items`, { lineType: 'SERVICE_CHARGE', description: 's', quantity: 1, unitPrice: 100 }), { id: invoiceId });
    await invoke(addLine, req('POST', `/api/admin/invoices/${invoiceId}/line-items`, { lineType: 'DISCOUNT_ADJUSTMENT', description: 'flat 500', discountMode: 'flat', quantity: 1, unitPrice: 500 }), { id: invoiceId });
    const inv = await prisma.invoice.findUnique({ where: { id: invoiceId } });
    expect(Number(inv!.grandTotal)).toBeLessThanOrEqual(0);
  });

  it('finalizing an invoice twice does not double-charge or error destructively', async () => {
    const { invoiceId } = await freshInvoice();
    await invoke(addLine, req('POST', `/api/admin/invoices/${invoiceId}/line-items`, { lineType: 'SERVICE_CHARGE', description: 's', quantity: 1, unitPrice: 200 }), { id: invoiceId });
    const f1 = await invoke(finalize, req('POST', `/api/admin/invoices/${invoiceId}/finalize`), { id: invoiceId });
    expect(f1.status).toBe(200);
    const f2 = await invoke(finalize, req('POST', `/api/admin/invoices/${invoiceId}/finalize`), { id: invoiceId });
    expect(f2.status).toBeGreaterThanOrEqual(400); // already finalized → rejected, not re-finalized
    const inv = await prisma.invoice.findUnique({ where: { id: invoiceId } });
    expect(inv!.invoiceStatus).toBe('FINALIZED');
  });

  it('a payment that exactly equals the balance marks PAID with zero due', async () => {
    const { invoiceId } = await freshInvoice();
    await invoke(addLine, req('POST', `/api/admin/invoices/${invoiceId}/line-items`, { lineType: 'SERVICE_CHARGE', description: 's', quantity: 1, unitPrice: 333 }), { id: invoiceId });
    await invoke(finalize, req('POST', `/api/admin/invoices/${invoiceId}/finalize`), { id: invoiceId });
    const inv0 = await prisma.invoice.findUnique({ where: { id: invoiceId } });
    await invoke(addPayment, req('POST', `/api/admin/invoices/${invoiceId}/payments`, { amount: Number(inv0!.grandTotal), paymentMode: 'CASH', paymentDate: '2026-06-12' }), { id: invoiceId });
    const inv = await prisma.invoice.findUnique({ where: { id: invoiceId } });
    expect(inv!.paymentStatus).toBe('PAID');
    expect(Number(inv!.amountDue)).toBe(0);
  });

  it('rejects a zero or negative payment amount', async () => {
    const { invoiceId } = await freshInvoice();
    await invoke(addLine, req('POST', `/api/admin/invoices/${invoiceId}/line-items`, { lineType: 'SERVICE_CHARGE', description: 's', quantity: 1, unitPrice: 100 }), { id: invoiceId });
    await invoke(finalize, req('POST', `/api/admin/invoices/${invoiceId}/finalize`), { id: invoiceId });
    expect((await invoke(addPayment, req('POST', `/api/admin/invoices/${invoiceId}/payments`, { amount: 0, paymentMode: 'CASH', paymentDate: '2026-06-12' }), { id: invoiceId })).status).toBe(400);
    expect((await invoke(addPayment, req('POST', `/api/admin/invoices/${invoiceId}/payments`, { amount: -50, paymentMode: 'CASH', paymentDate: '2026-06-12' }), { id: invoiceId })).status).toBe(400);
  });
});

describe('STATE MACHINE edge cases', () => {
  beforeAll(async () => { await resetDb(); await ensureSeedAdmin(); });
  beforeEach(() => asRole('SUPER_ADMIN'));

  it('cannot record a payment on a DRAFT invoice', async () => {
    const { invoiceId } = await freshInvoice();
    await invoke(addLine, req('POST', `/api/admin/invoices/${invoiceId}/line-items`, { lineType: 'SERVICE_CHARGE', description: 's', quantity: 1, unitPrice: 100 }), { id: invoiceId });
    const { status } = await invoke(addPayment, req('POST', `/api/admin/invoices/${invoiceId}/payments`, { amount: 50, paymentMode: 'CASH', paymentDate: '2026-06-12' }), { id: invoiceId });
    expect(status).toBeGreaterThanOrEqual(400);
  });

  it('unfinalize after a payment is recorded is refused (protects accounting)', async () => {
    const { invoiceId } = await freshInvoice();
    await invoke(addLine, req('POST', `/api/admin/invoices/${invoiceId}/line-items`, { lineType: 'SERVICE_CHARGE', description: 's', quantity: 1, unitPrice: 100 }), { id: invoiceId });
    await invoke(finalize, req('POST', `/api/admin/invoices/${invoiceId}/finalize`), { id: invoiceId });
    await invoke(addPayment, req('POST', `/api/admin/invoices/${invoiceId}/payments`, { amount: 100, paymentMode: 'CASH', paymentDate: '2026-06-12' }), { id: invoiceId });
    const { status } = await invoke(unfinalize, req('DELETE', `/api/admin/invoices/${invoiceId}/finalize`), { id: invoiceId });
    expect(status).toBeGreaterThanOrEqual(400);
  });
});

describe('AMC exhaustion edge cases', () => {
  beforeAll(async () => { await resetDb(); await ensureSeedAdmin(); });
  beforeEach(() => asRole('SUPER_ADMIN'));

  it('refuses a covered AMC line when servicesRemaining is 0', async () => {
    const { invoiceId, customerId, vehicleId } = await freshInvoice();
    const plan = await invoke(createPlan, req('POST', '/api/admin/amc/plans', { planName: '1svc', vehicleType: 'BIKE', durationMonths: 12, totalServicesIncluded: 1, price: 100 }));
    const con = await invoke(createContract, req('POST', '/api/admin/amc/contracts', { customerId, vehicleId, amcPlanId: plan.body.data.id, startDate: '2026-06-01', amountPaid: 100 }));
    // drain the single service to 0
    await prisma.amcContract.update({ where: { id: con.body.data.id }, data: { servicesRemaining: 0, servicesUsed: 1 } });
    const { status } = await invoke(addLine, req('POST', `/api/admin/invoices/${invoiceId}/line-items`, { lineType: 'AMC', description: 'covered', amcContractId: con.body.data.id }), { id: invoiceId });
    expect(status).toBeGreaterThanOrEqual(400);
  });
});

describe('INPUT-ABUSE edge cases', () => {
  beforeAll(async () => { await resetDb(); await ensureSeedAdmin(); });
  beforeEach(() => asRole('SUPER_ADMIN'));

  it('a SQL-ish search string is handled safely (no 500, no injection)', async () => {
    const { GET: listCustomers } = await import('@/app/api/admin/customers/route');
    await seed.customer({ fullName: "Robert'); DROP TABLE \"Customer\";--", phoneNumber: '9000000099' });
    const { status } = await invoke(listCustomers, req('GET', `/api/admin/customers?search=${encodeURIComponent("'; DROP TABLE")}`));
    expect(status).toBe(200);
    // table still exists + the row survived
    expect(await prisma.customer.count()).toBeGreaterThan(0);
  });

  it('an enormous pageSize is clamped, negative page floored (no crash)', async () => {
    const { GET: listCustomers } = await import('@/app/api/admin/customers/route');
    const r = await invoke(listCustomers, req('GET', '/api/admin/customers?page=-5&pageSize=999999'));
    expect(r.status).toBe(200);
  });
});
