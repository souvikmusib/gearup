import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { asRole, req, invoke, ensureSeedAdmin, resetDb, prisma, seed } from './helpers';
import { POST as createWorker } from '@/app/api/admin/workers/route';
import { PATCH as patchWorker } from '@/app/api/admin/workers/[id]/route';
import { POST as addLeave } from '@/app/api/admin/workers/[id]/leave/route';
import { POST as createJobCard } from '@/app/api/admin/job-cards/route';
import { POST as assignWorker } from '@/app/api/admin/job-cards/[id]/workers/route';
import { POST as createAppt } from '@/app/api/admin/appointments/route';

describe('workers (integration)', () => {
  beforeAll(async () => {
    await resetDb();
    await ensureSeedAdmin();
  });
  beforeEach(() => asRole('SUPER_ADMIN'));

  it('creates a worker', async () => {
    const { status, body } = await invoke(createWorker, req('POST', '/api/admin/workers', { fullName: 'Mistri Ram', specialization: 'Engine' }));
    expect(status).toBe(201);
    expect(body.data.workerCode).toMatch(/^WRK-/);
  });

  it('rejects an overlapping approved leave', async () => {
    const w = await seed.worker();
    const a = await invoke(addLeave, req('POST', `/api/admin/workers/${w.id}/leave`, { leaveType: 'SICK', startDate: '2026-07-01', endDate: '2026-07-05' }), { id: w.id });
    expect(a.status).toBe(201);
    const b = await invoke(addLeave, req('POST', `/api/admin/workers/${w.id}/leave`, { leaveType: 'CASUAL', startDate: '2026-07-03', endDate: '2026-07-08' }), { id: w.id });
    expect(b.status).toBeGreaterThanOrEqual(400);
  });

  it('blocks setting a worker INACTIVE while it has an open assignment', async () => {
    const w = await seed.worker();
    const c = await seed.customer();
    const v = await seed.vehicle(c.id);
    const jc = await invoke(createJobCard, req('POST', '/api/admin/job-cards', { customerId: c.id, vehicleId: v.id, issueSummary: 'open' }));
    await invoke(assignWorker, req('POST', `/api/admin/job-cards/${jc.body.data.id}/workers`, { workerId: w.id }), { id: jc.body.data.id });
    const { status } = await invoke(patchWorker, req('PATCH', `/api/admin/workers/${w.id}`, { status: 'INACTIVE' }), { id: w.id });
    expect(status).toBeGreaterThanOrEqual(400);
  });

  it('allows INACTIVE when no open assignments', async () => {
    const w = await seed.worker();
    const { status } = await invoke(patchWorker, req('PATCH', `/api/admin/workers/${w.id}`, { status: 'INACTIVE' }), { id: w.id });
    expect(status).toBe(200);
  });
});

describe('appointments (integration)', () => {
  let customerId: string, vehicleId: string;
  beforeAll(async () => {
    const c = await seed.customer();
    customerId = c.id;
    vehicleId = (await seed.vehicle(c.id)).id;
  });
  beforeEach(() => asRole('SUPER_ADMIN'));

  it('creates an appointment with a valid slot window', async () => {
    const { status } = await invoke(
      createAppt,
      req('POST', '/api/admin/appointments', {
        customerId, vehicleId,
        appointmentDate: '2026-07-10T00:00:00.000Z',
        slotStart: '2026-07-10T09:00:00.000Z',
        slotEnd: '2026-07-10T10:00:00.000Z',
      }),
    );
    expect([200, 201]).toContain(status);
  });

  it('rejects slotEnd <= slotStart', async () => {
    const { status } = await invoke(
      createAppt,
      req('POST', '/api/admin/appointments', {
        customerId, vehicleId,
        appointmentDate: '2026-07-11T00:00:00.000Z',
        slotStart: '2026-07-11T10:00:00.000Z',
        slotEnd: '2026-07-11T09:00:00.000Z',
      }),
    );
    expect(status).toBe(400);
  });
});
