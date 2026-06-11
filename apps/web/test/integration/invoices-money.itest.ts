import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { asRole, req, invoke, ensureSeedAdmin, resetDb, prisma, seed } from './helpers';
import { POST as createJobCard } from '@/app/api/admin/job-cards/route';
import { POST as addLine } from '@/app/api/admin/invoices/[id]/line-items/route';
import { POST as finalize, DELETE as unfinalize } from '@/app/api/admin/invoices/[id]/finalize/route';
import { POST as addPayment } from '@/app/api/admin/invoices/[id]/payments/route';
import { POST as createPlan } from '@/app/api/admin/amc/plans/route';
import { POST as createContract } from '@/app/api/admin/amc/contracts/route';

async function freshInvoice() {
  const c = await seed.customer();
  const v = await seed.vehicle(c.id);
  const jc = await invoke(createJobCard, req('POST', '/api/admin/job-cards', { customerId: c.id, vehicleId: v.id, issueSummary: 'inv' }));
  const inv = await prisma.invoice.findFirst({ where: { jobCardId: jc.body.data.id } });
  return { customerId: c.id, vehicleId: v.id, jobCardId: jc.body.data.id, invoiceId: inv!.id };
}

describe('invoices money flow (integration)', () => {
  beforeAll(async () => {
    await resetDb();
    await ensureSeedAdmin();
  });
  beforeEach(() => asRole('SUPER_ADMIN'));

  it('computes grandTotal with a percent discount (600 - 10% = 540)', async () => {
    const { invoiceId } = await freshInvoice();
    await invoke(addLine, req('POST', `/api/admin/invoices/${invoiceId}/line-items`, { lineType: 'LABOR', description: 'Labor', quantity: 1, unitPrice: 500 }), { id: invoiceId });
    await invoke(addLine, req('POST', `/api/admin/invoices/${invoiceId}/line-items`, { lineType: 'SERVICE_CHARGE', description: 'Wash', quantity: 1, unitPrice: 100, taxRate: 0 }), { id: invoiceId });
    await invoke(addLine, req('POST', `/api/admin/invoices/${invoiceId}/line-items`, { lineType: 'DISCOUNT_ADJUSTMENT', description: '10% off', discountMode: 'percent', unitPrice: 10 }), { id: invoiceId });
    const inv = await prisma.invoice.findUnique({ where: { id: invoiceId } });
    expect(Math.round(Number(inv!.grandTotal))).toBe(540);
  });

  it('applies a flat discount', async () => {
    const { invoiceId } = await freshInvoice();
    await invoke(addLine, req('POST', `/api/admin/invoices/${invoiceId}/line-items`, { lineType: 'SERVICE_CHARGE', description: 'svc', quantity: 1, unitPrice: 1000 }), { id: invoiceId });
    await invoke(addLine, req('POST', `/api/admin/invoices/${invoiceId}/line-items`, { lineType: 'DISCOUNT_ADJUSTMENT', description: 'flat 100', discountMode: 'flat', quantity: 1, unitPrice: 100 }), { id: invoiceId });
    const inv = await prisma.invoice.findUnique({ where: { id: invoiceId } });
    expect(Math.round(Number(inv!.grandTotal))).toBe(900);
  });

  it('records partial then full payment with correct status transitions', async () => {
    const { invoiceId } = await freshInvoice();
    await invoke(addLine, req('POST', `/api/admin/invoices/${invoiceId}/line-items`, { lineType: 'SERVICE_CHARGE', description: 'svc', quantity: 1, unitPrice: 1000 }), { id: invoiceId });
    await invoke(finalize, req('POST', `/api/admin/invoices/${invoiceId}/finalize`), { id: invoiceId });

    const p1 = await invoke(addPayment, req('POST', `/api/admin/invoices/${invoiceId}/payments`, { amount: 400, paymentMode: 'CASH', paymentDate: '2026-06-12' }), { id: invoiceId });
    expect(p1.status).toBe(201);
    let inv = await prisma.invoice.findUnique({ where: { id: invoiceId } });
    expect(inv!.paymentStatus).toBe('PARTIALLY_PAID');

    await invoke(addPayment, req('POST', `/api/admin/invoices/${invoiceId}/payments`, { amount: 600, paymentMode: 'UPI', paymentDate: '2026-06-12' }), { id: invoiceId });
    inv = await prisma.invoice.findUnique({ where: { id: invoiceId } });
    expect(inv!.paymentStatus).toBe('PAID');
    expect(Number(inv!.amountDue)).toBe(0);
  });

  it('rejects overpayment on a fully paid invoice', async () => {
    const { invoiceId } = await freshInvoice();
    await invoke(addLine, req('POST', `/api/admin/invoices/${invoiceId}/line-items`, { lineType: 'SERVICE_CHARGE', description: 'svc', quantity: 1, unitPrice: 100 }), { id: invoiceId });
    await invoke(finalize, req('POST', `/api/admin/invoices/${invoiceId}/finalize`), { id: invoiceId });
    await invoke(addPayment, req('POST', `/api/admin/invoices/${invoiceId}/payments`, { amount: 100, paymentMode: 'CASH', paymentDate: '2026-06-12' }), { id: invoiceId });
    const { status } = await invoke(addPayment, req('POST', `/api/admin/invoices/${invoiceId}/payments`, { amount: 50, paymentMode: 'CASH', paymentDate: '2026-06-12' }), { id: invoiceId });
    expect(status).toBeGreaterThanOrEqual(400);
  });

  it('rejects payment on a DRAFT (unfinalized) invoice', async () => {
    const { invoiceId } = await freshInvoice();
    await invoke(addLine, req('POST', `/api/admin/invoices/${invoiceId}/line-items`, { lineType: 'SERVICE_CHARGE', description: 'svc', quantity: 1, unitPrice: 100 }), { id: invoiceId });
    const { status } = await invoke(addPayment, req('POST', `/api/admin/invoices/${invoiceId}/payments`, { amount: 50, paymentMode: 'CASH', paymentDate: '2026-06-12' }), { id: invoiceId });
    expect(status).toBeGreaterThanOrEqual(400);
  });

  it('AMC: finalize decrements servicesRemaining, unfinalize refunds it', async () => {
    const { invoiceId, customerId, vehicleId } = await freshInvoice();
    const plan = await invoke(createPlan, req('POST', '/api/admin/amc/plans', { planName: 'P', vehicleType: 'BIKE', durationMonths: 12, totalServicesIncluded: 4, price: 999 }));
    const contract = await invoke(createContract, req('POST', '/api/admin/amc/contracts', { customerId, vehicleId, amcPlanId: plan.body.data.id, startDate: '2026-06-01', amountPaid: 999 }));
    const contractId = contract.body.data.id;
    const rem0 = contract.body.data.servicesRemaining;

    await invoke(addLine, req('POST', `/api/admin/invoices/${invoiceId}/line-items`, { lineType: 'AMC', description: 'covered service', amcContractId: contractId }), { id: invoiceId });
    await invoke(finalize, req('POST', `/api/admin/invoices/${invoiceId}/finalize`), { id: invoiceId });
    let con = await prisma.amcContract.findUnique({ where: { id: contractId } });
    expect(con!.servicesRemaining).toBe(rem0 - 1);

    await invoke(unfinalize, req('DELETE', `/api/admin/invoices/${invoiceId}/finalize`), { id: invoiceId });
    con = await prisma.amcContract.findUnique({ where: { id: contractId } });
    expect(con!.servicesRemaining).toBe(rem0);
  });
});
