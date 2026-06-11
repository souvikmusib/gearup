import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { asRole, req, invoke, ensureSeedAdmin, resetDb, prisma, seed } from './helpers';
import { GET as getSettings, PATCH as patchSettings } from '@/app/api/admin/settings/route';
import { GET as listAdmins } from '@/app/api/admin/settings/admins/route';
import { GET as getHolidays, POST as createHoliday } from '@/app/api/admin/settings/holidays/route';
import { GET as getHours, PUT as putHours } from '@/app/api/admin/settings/business-hours/route';
import { GET as listPlans, POST as createPlan } from '@/app/api/admin/amc/plans/route';
import { GET as getPlan, PATCH as patchPlan, DELETE as delPlan } from '@/app/api/admin/amc/plans/[id]/route';
import { GET as listContracts, POST as createContract } from '@/app/api/admin/amc/contracts/route';
import { GET as getContract } from '@/app/api/admin/amc/contracts/[id]/route';
import { GET as listSR } from '@/app/api/admin/service-requests/route';
import { GET as getSR, PATCH as patchSR } from '@/app/api/admin/service-requests/[id]/route';
import { GET as reportDash } from '@/app/api/admin/reports/route';
import { GET as reportRevenue } from '@/app/api/admin/reports/revenue/route';
import { GET as reportJobs } from '@/app/api/admin/reports/jobs/route';
import { GET as reportAppts } from '@/app/api/admin/reports/appointments/route';
import { GET as reportInv } from '@/app/api/admin/reports/inventory/route';
import { GET as reportExp } from '@/app/api/admin/reports/expenses/route';
import { GET as reportWork } from '@/app/api/admin/reports/workers/route';
import { GET as listTemplates, POST as createTemplate } from '@/app/api/admin/notifications/templates/route';

describe('settings (integration)', () => {
  beforeAll(async () => { await resetDb(); await ensureSeedAdmin(); });
  beforeEach(() => asRole('SUPER_ADMIN'));

  it('reads settings', async () => {
    expect((await invoke(getSettings, req('GET', '/api/admin/settings'))).status).toBe(200);
  });
  it('patches a known registry key', async () => {
    const { status } = await invoke(patchSettings, req('PATCH', '/api/admin/settings', { 'business.name': 'GearUp QA' }));
    expect(status).toBe(200);
    const row = await prisma.setting.findUnique({ where: { key: 'business.name' } });
    expect(row?.value).toBe('GearUp QA');
  });
  it('rejects an unknown settings key', async () => {
    const { status } = await invoke(patchSettings, req('PATCH', '/api/admin/settings', { 'evil.key': 'x' }));
    expect(status).toBeGreaterThanOrEqual(400);
  });
  it('lists admins', async () => {
    expect((await invoke(listAdmins, req('GET', '/api/admin/settings/admins'))).status).toBe(200);
  });
  it('creates + lists a holiday; rejects bad date', async () => {
    expect((await invoke(createHoliday, req('POST', '/api/admin/settings/holidays', { holidayName: 'Diwali', holidayDate: '2026-11-08', holidayType: 'PUBLIC_HOLIDAY' }))).status).toBeLessThan(300);
    expect((await invoke(getHolidays, req('GET', '/api/admin/settings/holidays'))).status).toBe(200);
    expect((await invoke(createHoliday, req('POST', '/api/admin/settings/holidays', { holidayName: 'Bad', holidayDate: '08-11-2026', holidayType: 'PUBLIC_HOLIDAY' }))).status).toBe(400);
  });
  it('reads + replaces business hours', async () => {
    expect((await invoke(getHours, req('GET', '/api/admin/settings/business-hours'))).status).toBe(200);
    const { status } = await invoke(putHours, req('PUT', '/api/admin/settings/business-hours', { rules: [{ dayOfWeek: 1, openTime: '09:00', closeTime: '18:00', slotDurationMinutes: 60, maxCapacity: 3 }] }));
    expect(status).toBe(200);
    expect(await prisma.appointmentSlotRule.count()).toBeGreaterThan(0);
  });
  it('rejects overlapping business-hours rules', async () => {
    const { status } = await invoke(putHours, req('PUT', '/api/admin/settings/business-hours', {
      rules: [
        { dayOfWeek: 2, openTime: '09:00', closeTime: '12:00', slotDurationMinutes: 60, maxCapacity: 2 },
        { dayOfWeek: 2, openTime: '11:00', closeTime: '15:00', slotDurationMinutes: 60, maxCapacity: 2 },
      ],
    }));
    expect(status).toBe(400);
  });
});

describe('AMC plans & contracts (integration)', () => {
  let customerId: string, vehicleId: string;
  beforeAll(async () => {
    await resetDb(); await ensureSeedAdmin();
    const c = await seed.customer(); customerId = c.id; vehicleId = (await seed.vehicle(c.id)).id;
  });
  beforeEach(() => asRole('SUPER_ADMIN'));

  it('full plan lifecycle: create→get→patch→list', async () => {
    const created = await invoke(createPlan, req('POST', '/api/admin/amc/plans', { planName: 'Gold', vehicleType: 'BIKE', durationMonths: 12, totalServicesIncluded: 4, price: 1500 }));
    expect(created.status).toBe(201);
    const id = created.body.data.id;
    expect((await invoke(getPlan, req('GET', `/api/admin/amc/plans/${id}`), { id })).status).toBe(200);
    expect((await invoke(patchPlan, req('PATCH', `/api/admin/amc/plans/${id}`, { price: 1600 }), { id })).status).toBe(200);
    expect((await invoke(listPlans, req('GET', '/api/admin/amc/plans'))).status).toBe(200);
  });
  it('creates a contract with derived service counts', async () => {
    const plan = await invoke(createPlan, req('POST', '/api/admin/amc/plans', { planName: 'Svc', vehicleType: 'BIKE', durationMonths: 6, totalServicesIncluded: 3, price: 900 }));
    const c = await invoke(createContract, req('POST', '/api/admin/amc/contracts', { customerId, vehicleId, amcPlanId: plan.body.data.id, startDate: '2026-06-01', amountPaid: 900 }));
    expect(c.status).toBe(201);
    expect(c.body.data.servicesRemaining).toBe(3);
    const id = c.body.data.id;
    expect((await invoke(getContract, req('GET', `/api/admin/amc/contracts/${id}`), { id })).status).toBe(200);
    expect((await invoke(listContracts, req('GET', '/api/admin/amc/contracts'))).status).toBe(200);
  });
  it('deletes a plan with no contracts', async () => {
    const p = await invoke(createPlan, req('POST', '/api/admin/amc/plans', { planName: 'Temp', vehicleType: 'BIKE', durationMonths: 6, totalServicesIncluded: 1, price: 100 }));
    expect((await invoke(delPlan, req('DELETE', `/api/admin/amc/plans/${p.body.data.id}`), { id: p.body.data.id })).status).toBe(200);
  });
});

describe('service requests (integration)', () => {
  let customerId: string, vehicleId: string;
  beforeAll(async () => {
    await resetDb(); await ensureSeedAdmin();
    const c = await seed.customer(); customerId = c.id; vehicleId = (await seed.vehicle(c.id)).id;
  });
  beforeEach(() => asRole('SUPER_ADMIN'));

  it('lists, gets, patches a service request', async () => {
    const sr = await prisma.serviceRequest.create({ data: { referenceId: `SR-${Date.now()}`, customerId, vehicleId, serviceCategory: 'GENERAL', issueDescription: 'noise', status: 'SUBMITTED' } });
    expect((await invoke(listSR, req('GET', '/api/admin/service-requests?pageSize=5'))).status).toBe(200);
    expect((await invoke(getSR, req('GET', `/api/admin/service-requests/${sr.id}`), { id: sr.id })).status).toBe(200);
    const patched = await invoke(patchSR, req('PATCH', `/api/admin/service-requests/${sr.id}`, { status: 'UNDER_REVIEW' }), { id: sr.id });
    expect(patched.status).toBe(200);
  });
});

describe('reports — all 7 respond 200 with data (integration)', () => {
  beforeAll(async () => { await resetDb(); await ensureSeedAdmin(); });
  beforeEach(() => asRole('SUPER_ADMIN'));

  for (const [name, handler, path] of [
    ['dashboard', reportDash, '/api/admin/reports'],
    ['revenue', reportRevenue, '/api/admin/reports/revenue'],
    ['jobs', reportJobs, '/api/admin/reports/jobs'],
    ['appointments', reportAppts, '/api/admin/reports/appointments'],
    ['inventory', reportInv, '/api/admin/reports/inventory'],
    ['expenses', reportExp, '/api/admin/reports/expenses'],
    ['workers', reportWork, '/api/admin/reports/workers'],
  ] as const) {
    it(`report:${name}`, async () => {
      const { status, body } = await invoke(handler as any, req('GET', path));
      expect(status).toBe(200);
      expect(body.success).toBe(true);
    });
  }

  it('revenue includes daily/byType/byWorker keys (regression: 072a219)', async () => {
    const { body } = await invoke(reportRevenue, req('GET', '/api/admin/reports/revenue'));
    expect(body.data).toHaveProperty('daily');
    expect(body.data).toHaveProperty('byType');
    expect(body.data).toHaveProperty('byWorker');
  });
});

describe('notification templates (integration)', () => {
  beforeAll(async () => { await resetDb(); await ensureSeedAdmin(); });
  beforeEach(() => asRole('SUPER_ADMIN'));

  it('creates + lists a template', async () => {
    const c = await invoke(createTemplate, req('POST', '/api/admin/notifications/templates', { channel: 'WHATSAPP', eventType: 'invoice.ready', templateKey: 'invoice_ready_v1', messageBody: 'Hi {{name}}, your invoice is ready.' }));
    expect(c.status).toBeLessThan(300);
    expect((await invoke(listTemplates, req('GET', '/api/admin/notifications/templates'))).status).toBe(200);
  });
});
