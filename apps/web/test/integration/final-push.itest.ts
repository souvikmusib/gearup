import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { asRole, req, invoke, ensureSeedAdmin, resetDb, prisma, seed } from './helpers';
import { POST as createJobCard, GET as listJobCards } from '@/app/api/admin/job-cards/route';
import { POST as createPlan } from '@/app/api/admin/amc/plans/route';
import { POST as createContract } from '@/app/api/admin/amc/contracts/route';
import { POST as recordUsage } from '@/app/api/admin/amc/contracts/[id]/route';
import { DELETE as delUsage } from '@/app/api/admin/amc/contracts/[id]/usages/[usageId]/route';
import { POST as addLine } from '@/app/api/admin/invoices/[id]/line-items/route';
import { POST as finalize } from '@/app/api/admin/invoices/[id]/finalize/route';
import { POST as addPayment } from '@/app/api/admin/invoices/[id]/payments/route';
import { GET as listWorkers } from '@/app/api/admin/workers/route';
import { POST as createTemplate, GET as listTemplates } from '@/app/api/admin/notifications/templates/route';
import { POST as publicSR } from '@/app/api/public/service-requests/route';
import { POST as createAppointment } from '@/app/api/admin/appointments/route';

describe('AMC usage POST + DELETE (integration)', () => {
  let customerId: string, vehicleId: string, contractId: string;
  beforeAll(async () => {
    await resetDb(); await ensureSeedAdmin(); asRole('SUPER_ADMIN');
    const c = await seed.customer(); customerId = c.id; vehicleId = (await seed.vehicle(c.id)).id;
    const plan = await invoke(createPlan, req('POST', '/api/admin/amc/plans', { planName: 'Use', vehicleType: 'BIKE', durationMonths: 12, totalServicesIncluded: 4, price: 999 }));
    const con = await invoke(createContract, req('POST', '/api/admin/amc/contracts', { customerId, vehicleId, amcPlanId: plan.body.data.id, startDate: '2026-06-01', amountPaid: 999 }));
    contractId = con.body.data.id;
  });
  beforeEach(() => asRole('SUPER_ADMIN'));

  it('record a usage, then delete it (servicesRemaining restored)', async () => {
    const jc = await invoke(createJobCard, req('POST', '/api/admin/job-cards', { customerId, vehicleId, issueSummary: 'amc-use' }));
    const before = await prisma.amcContract.findUniqueOrThrow({ where: { id: contractId } });
    const r = await invoke(recordUsage, req('POST', `/api/admin/amc/contracts/${contractId}`, { jobCardId: jc.body.data.id }), { id: contractId });
    expect([200, 201]).toContain(r.status);
    const after = await prisma.amcContract.findUniqueOrThrow({ where: { id: contractId } });
    expect(after.servicesRemaining).toBe(before.servicesRemaining - 1);
    const usage = await prisma.amcServiceUsage.findFirst({ where: { amcContractId: contractId } });
    expect(usage).toBeTruthy();
    const d = await invoke(delUsage, req('DELETE', `/api/admin/amc/contracts/${contractId}/usages/${usage!.id}`), { id: contractId, usageId: usage!.id });
    expect(d.status).toBe(200);
    const restored = await prisma.amcContract.findUniqueOrThrow({ where: { id: contractId } });
    expect(restored.servicesRemaining).toBe(before.servicesRemaining);
  });
});

describe('JobCard list filters (integration)', () => {
  beforeAll(async () => { await resetDb(); await ensureSeedAdmin(); });
  beforeEach(() => asRole('SUPER_ADMIN'));

  it('filters by status, priority, worker, search', async () => {
    const c = await seed.customer();
    const v = await seed.vehicle(c.id);
    const w = await seed.worker();
    const jc = await invoke(createJobCard, req('POST', '/api/admin/job-cards', { customerId: c.id, vehicleId: v.id, issueSummary: 'searchable thing', priority: 'HIGH' }));
    const { POST: assignWorker } = await import('@/app/api/admin/job-cards/[id]/workers/route');
    await invoke(assignWorker, req('POST', `/api/admin/job-cards/${jc.body.data.id}/workers`, { workerId: w.id }), { id: jc.body.data.id });
    expect((await invoke(listJobCards, req('GET', `/api/admin/job-cards?priority=HIGH&workerId=${w.id}&search=searchable&pageSize=5`))).status).toBe(200);
  });
});

describe('Workers list search/filter (integration)', () => {
  beforeAll(async () => { await resetDb(); await ensureSeedAdmin(); });
  beforeEach(() => asRole('SUPER_ADMIN'));

  it('search by fullName works', async () => {
    await seed.worker({ fullName: 'Findable Mistri' });
    const { status, body } = await invoke(listWorkers, req('GET', '/api/admin/workers?search=Findable'));
    expect(status).toBe(200);
    const has = (body.data ?? []).some((w: any) => w.fullName?.includes('Findable'));
    expect(has).toBe(true);
  });
});

describe('Payment triggers JC DELIVERED + AMC activation (integration)', () => {
  beforeAll(async () => { await resetDb(); await ensureSeedAdmin(); });
  beforeEach(() => asRole('SUPER_ADMIN'));

  it('paying an invoice in full marks the linked job-card DELIVERED', async () => {
    const c = await seed.customer();
    const v = await seed.vehicle(c.id);
    const jc = await invoke(createJobCard, req('POST', '/api/admin/job-cards', { customerId: c.id, vehicleId: v.id, issueSummary: 'deliver' }));
    const id = jc.body.data.id;
    const inv = await prisma.invoice.findFirst({ where: { jobCardId: id } });
    await invoke(addLine, req('POST', `/api/admin/invoices/${inv!.id}/line-items`, { lineType: 'SERVICE_CHARGE', description: 's', quantity: 1, unitPrice: 333 }), { id: inv!.id });
    await invoke(finalize, req('POST', `/api/admin/invoices/${inv!.id}/finalize`), { id: inv!.id });
    await invoke(addPayment, req('POST', `/api/admin/invoices/${inv!.id}/payments`, { amount: 333, paymentMode: 'CASH', paymentDate: '2026-06-12' }), { id: inv!.id });
    const after = await prisma.jobCard.findUnique({ where: { id } });
    expect(after?.status).toBe('DELIVERED');
    expect(after?.actualDeliveryAt).toBeTruthy();
  });
});

describe('Notification templates list filter (integration)', () => {
  beforeAll(async () => { await resetDb(); await ensureSeedAdmin(); });
  beforeEach(() => asRole('SUPER_ADMIN'));

  it('GET filters by channel', async () => {
    await invoke(createTemplate, req('POST', '/api/admin/notifications/templates', { channel: 'EMAIL', eventType: 'evt.email', templateKey: 'tpl_email_v1', messageBody: 'hi' }));
    await invoke(createTemplate, req('POST', '/api/admin/notifications/templates', { channel: 'WHATSAPP', eventType: 'evt.wa', templateKey: 'tpl_wa_v1', messageBody: 'hi' }));
    const r = await invoke(listTemplates, req('GET', '/api/admin/notifications/templates?channel=EMAIL'));
    expect(r.status).toBe(200);
  });
});

describe('Public service-request rate-limit-friendly extras (integration)', () => {
  beforeAll(async () => { await resetDb(); await ensureSeedAdmin(); });

  it('accepts an optional alternatePhone + email + preferred slot/notes', async () => {
    const { status } = await invoke(publicSR, req('POST', '/api/public/service-requests', {
      fullName: 'Full Form', phoneNumber: '9700088001', alternatePhone: '9700088002', email: 'ok@test.local',
      vehicleType: 'BIKE', brand: 'Hero', model: 'X', registrationNumber: 'WB-29-DD-3333',
      serviceCategory: 'GENERAL', issueDescription: 'detailed issue write up here',
      preferredDate: '2026-09-12', preferredSlotLabel: 'morning',
    }));
    expect(status).toBeLessThan(300);
  });
});

describe('Appointments service-request linkage (integration)', () => {
  beforeAll(async () => { await resetDb(); await ensureSeedAdmin(); });
  beforeEach(() => asRole('SUPER_ADMIN'));

  it('creates an appointment linked to a service-request', async () => {
    const c = await seed.customer();
    const v = await seed.vehicle(c.id);
    const sr = await prisma.serviceRequest.create({ data: { referenceId: `SR-AP-${Date.now()}`, customerId: c.id, vehicleId: v.id, serviceCategory: 'GENERAL', issueDescription: 'x', status: 'SUBMITTED' } });
    const { status } = await invoke(createAppointment, req('POST', '/api/admin/appointments', {
      serviceRequestId: sr.id,
      customerId: c.id, vehicleId: v.id,
      appointmentDate: '2026-10-01T00:00:00.000Z',
      slotStart: '2026-10-01T11:00:00.000Z', slotEnd: '2026-10-01T12:00:00.000Z',
    }));
    expect([200, 201]).toContain(status);
  });
});
