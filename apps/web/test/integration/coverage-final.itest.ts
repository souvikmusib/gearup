import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { asRole, req, invoke, ensureSeedAdmin, resetDb, prisma, seed } from './helpers';
import { POST as createJobCard } from '@/app/api/admin/job-cards/route';
import { POST as addLine } from '@/app/api/admin/invoices/[id]/line-items/route';
import { POST as finalize } from '@/app/api/admin/invoices/[id]/finalize/route';
import { GET as pdfRoute } from '@/app/api/admin/invoices/[id]/pdf/route';
import { POST as addPayment } from '@/app/api/admin/invoices/[id]/payments/route';
import { POST as createAppointment } from '@/app/api/admin/appointments/route';
import { POST as createTemplate, PATCH as patchTemplate } from '@/app/api/admin/notifications/templates/route';
import { formatRegNumber, isValidRegNumber } from '@/lib/format-reg';

async function freshFinalizedInvoice(total = 200) {
  const c = await seed.customer();
  const v = await seed.vehicle(c.id);
  const jc = await invoke(createJobCard, req('POST', '/api/admin/job-cards', { customerId: c.id, vehicleId: v.id, issueSummary: 'fin' }));
  const inv = await prisma.invoice.findFirst({ where: { jobCardId: jc.body.data.id } });
  await invoke(addLine, req('POST', `/api/admin/invoices/${inv!.id}/line-items`, { lineType: 'SERVICE_CHARGE', description: 's', quantity: 1, unitPrice: total }), { id: inv!.id });
  await invoke(finalize, req('POST', `/api/admin/invoices/${inv!.id}/finalize`), { id: inv!.id });
  return inv!.id;
}

describe('PDF deeper branches (integration)', () => {
  beforeAll(async () => { await resetDb(); await ensureSeedAdmin(); });
  beforeEach(() => asRole('SUPER_ADMIN'));

  it('PDF for an invoice with mixed PART + LABOR + DISCOUNT lines', async () => {
    const c = await seed.customer();
    const v = await seed.vehicle(c.id);
    const jc = await invoke(createJobCard, req('POST', '/api/admin/job-cards', { customerId: c.id, vehicleId: v.id, issueSummary: 'mix' }));
    const inv = await prisma.invoice.findFirst({ where: { jobCardId: jc.body.data.id } });
    await invoke(addLine, req('POST', `/api/admin/invoices/${inv!.id}/line-items`, { lineType: 'LABOR', description: 'Labor', quantity: 1, unitPrice: 500, taxRate: 5 }), { id: inv!.id });
    await invoke(addLine, req('POST', `/api/admin/invoices/${inv!.id}/line-items`, { lineType: 'CUSTOM_CHARGE', description: 'Foam wash', quantity: 1, unitPrice: 49 }), { id: inv!.id });
    await invoke(addLine, req('POST', `/api/admin/invoices/${inv!.id}/line-items`, { lineType: 'DISCOUNT_ADJUSTMENT', description: '5% off', discountMode: 'percent', unitPrice: 5 }), { id: inv!.id });
    await invoke(finalize, req('POST', `/api/admin/invoices/${inv!.id}/finalize`), { id: inv!.id });
    const res = await pdfRoute(req('GET', `/api/admin/invoices/${inv!.id}/pdf`) as any, { params: { id: inv!.id } } as any);
    expect(res.status).toBe(200);
    expect(Buffer.from(await res.arrayBuffer()).length).toBeGreaterThan(2048);
  });

  it('PDF for a fully PAID invoice', async () => {
    const id = await freshFinalizedInvoice(150);
    await invoke(addPayment, req('POST', `/api/admin/invoices/${id}/payments`, { amount: 150, paymentMode: 'CASH', paymentDate: '2026-06-12' }), { id });
    const res = await pdfRoute(req('GET', `/api/admin/invoices/${id}/pdf`) as any, { params: { id } } as any);
    expect(res.status).toBe(200);
    expect(Buffer.from(await res.arrayBuffer()).length).toBeGreaterThan(1024);
  });
});

describe('notifications templates filter/patch deeper (integration)', () => {
  beforeAll(async () => { await resetDb(); await ensureSeedAdmin(); });
  beforeEach(() => asRole('SUPER_ADMIN'));

  it('PATCH isActive toggle', async () => {
    const c = await invoke(createTemplate, req('POST', '/api/admin/notifications/templates', { channel: 'WHATSAPP', eventType: 'evt.toggle', templateKey: 'tpl_toggle_v1', messageBody: 'x' }));
    const id = c.body.data.id;
    const { status } = await invoke(patchTemplate, req('PATCH', '/api/admin/notifications/templates', { id, isActive: false }));
    expect(status).toBe(200);
    const row = await prisma.notificationTemplate.findUnique({ where: { id } });
    expect(row?.isActive).toBe(false);
  });

  it('POST rejects an oversized messageBody', async () => {
    const huge = 'x'.repeat(20000);
    const { status } = await invoke(createTemplate, req('POST', '/api/admin/notifications/templates', { channel: 'EMAIL', eventType: 'evt.huge', templateKey: 'tpl_huge_v1', messageBody: huge }));
    expect(status).toBe(400);
  });
});

describe('appointments POST extras (integration)', () => {
  beforeAll(async () => { await resetDb(); await ensureSeedAdmin(); });
  beforeEach(() => asRole('SUPER_ADMIN'));

  it('appointment without a worker assignment succeeds', async () => {
    const c = await seed.customer();
    const v = await seed.vehicle(c.id);
    const { status } = await invoke(createAppointment, req('POST', '/api/admin/appointments', {
      customerId: c.id, vehicleId: v.id,
      appointmentDate: '2026-11-15T00:00:00.000Z',
      slotStart: '2026-11-15T14:00:00.000Z', slotEnd: '2026-11-15T15:00:00.000Z',
    }));
    expect([200, 201]).toContain(status);
  });

  it('rejects malformed ISO appointmentDate', async () => {
    const c = await seed.customer();
    const v = await seed.vehicle(c.id);
    const { status } = await invoke(createAppointment, req('POST', '/api/admin/appointments', {
      customerId: c.id, vehicleId: v.id,
      appointmentDate: 'not-a-date',
      slotStart: '2026-11-15T14:00:00.000Z', slotEnd: '2026-11-15T15:00:00.000Z',
    }));
    expect(status).toBe(400);
  });
});

describe('payment guards (integration)', () => {
  beforeAll(async () => { await resetDb(); await ensureSeedAdmin(); });
  beforeEach(() => asRole('SUPER_ADMIN'));

  it('paying more than balance is refused with 4xx (not silently capped)', async () => {
    const id = await freshFinalizedInvoice(100);
    const r1 = await invoke(addPayment, req('POST', `/api/admin/invoices/${id}/payments`, { amount: 80, paymentMode: 'CASH', paymentDate: '2026-06-12' }), { id });
    expect(r1.status).toBe(201);
    const r2 = await invoke(addPayment, req('POST', `/api/admin/invoices/${id}/payments`, { amount: 200, paymentMode: 'UPI', paymentDate: '2026-06-12' }), { id });
    expect(r2.status).toBeGreaterThanOrEqual(400);
    const inv = await prisma.invoice.findUnique({ where: { id } });
    expect(Number(inv!.amountPaid)).toBe(80); // unchanged after refusal
  });
});

describe('format-reg lib (integration coverage)', () => {
  it('formats common regs', () => {
    expect(formatRegNumber('wb26ab1234')).toBe('WB-26-AB-1234');
    expect(formatRegNumber('')).toBe('');
  });
  it('validates regs', () => {
    expect(isValidRegNumber('WB26AB1234')).toBe(true);
    expect(isValidRegNumber('22BH1234AA')).toBe(true);
    expect(isValidRegNumber('xx')).toBe(false);
  });
});
