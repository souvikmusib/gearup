import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import bcrypt from 'bcryptjs';
import { asRole, asRawToken, clearAuth, req, invoke, ensureSeedAdmin, resetDb, prisma, seed } from './helpers';
import jwt from 'jsonwebtoken';
import { PATCH as patchAdmin } from '@/app/api/admin/settings/admins/route';
import { POST as createJobCard } from '@/app/api/admin/job-cards/route';
import { DELETE as delJobCard, PATCH as patchJobCard } from '@/app/api/admin/job-cards/[id]/route';
import { POST as estimatePost } from '@/app/api/public/estimate/[token]/route';
import { GET as estimateGet } from '@/app/api/public/estimate/[token]/route';
import { GET as listNotifications } from '@/app/api/admin/notifications/route';
import { PATCH as patchLeave, POST as addLeave } from '@/app/api/admin/workers/[id]/leave/route';
import { POST as track } from '@/app/api/public/track/route';
import { POST as publicSR } from '@/app/api/public/service-requests/route';
import { POST as addLine } from '@/app/api/admin/invoices/[id]/line-items/route';
import { POST as addPayment } from '@/app/api/admin/invoices/[id]/payments/route';
import { POST as finalize } from '@/app/api/admin/invoices/[id]/finalize/route';
import { ROLE_PERMISSIONS } from '@gearup/types';
import { computeEstimateRevision } from '@/lib/estimate-token';

async function ensureRole(key: string) {
  return prisma.role.upsert({ where: { key }, create: { key, name: key }, update: {} });
}

describe('settings/admins PATCH branches (integration)', () => {
  beforeAll(async () => { await resetDb(); await ensureSeedAdmin(); await ensureRole('SUPER_ADMIN'); await ensureRole('RECEPTIONIST'); });
  beforeEach(() => asRole('SUPER_ADMIN'));

  it('refuses self-deactivation', async () => {
    const me = await prisma.adminUser.create({ data: { adminUserId: 'self1', fullName: 'Self', passwordHash: await bcrypt.hash('xxx', 4) } });
    asRole('SUPER_ADMIN', me.id);
    const { status, body } = await invoke(patchAdmin, req('PATCH', '/api/admin/settings/admins', { id: me.id, status: 'INACTIVE' }));
    expect(status).toBe(403);
    expect(body.error.code).toBe('FORBIDDEN');
  });

  it('refuses self-role-change', async () => {
    const me = await prisma.adminUser.create({ data: { adminUserId: 'self2', fullName: 'Self2', passwordHash: await bcrypt.hash('xxx', 4) } });
    const role = await prisma.role.findUniqueOrThrow({ where: { key: 'RECEPTIONIST' } });
    asRole('SUPER_ADMIN', me.id);
    const { status } = await invoke(patchAdmin, req('PATCH', '/api/admin/settings/admins', { id: me.id, roleId: role.id }));
    expect(status).toBe(403);
  });

  it('lets a SUPER_ADMIN patch ANOTHER admin\'s fullName/phone/password', async () => {
    const other = await prisma.adminUser.create({ data: { adminUserId: 'other1', fullName: 'Other', passwordHash: await bcrypt.hash('xxx', 4) } });
    const { status } = await invoke(patchAdmin, req('PATCH', '/api/admin/settings/admins', { id: other.id, fullName: 'Renamed', phone: '9999999900', password: 'StrongPassw0rd!' }));
    expect(status).toBe(200);
    const updated = await prisma.adminUser.findUnique({ where: { id: other.id } });
    expect(updated?.fullName).toBe('Renamed');
    expect(await bcrypt.compare('StrongPassw0rd!', updated!.passwordHash)).toBe(true);
  });
});

describe('JobCard DELETE flow (integration)', () => {
  beforeAll(async () => { await resetDb(); await ensureSeedAdmin(); });
  beforeEach(() => asRole('SUPER_ADMIN'));

  it('DELETE a DRAFT job-card releases part reservation + cascades cleanup', async () => {
    const c = await seed.customer();
    const v = await seed.vehicle(c.id);
    const cat = await seed.category();
    const item = await seed.item(cat.id, { quantityInStock: 10 });
    const jc = await invoke(createJobCard, req('POST', '/api/admin/job-cards', { customerId: c.id, vehicleId: v.id, issueSummary: 'del' }));
    const id = jc.body.data.id;
    const { POST: addPart } = await import('@/app/api/admin/job-cards/[id]/parts/route');
    await invoke(addPart, req('POST', `/api/admin/job-cards/${id}/parts`, { inventoryItemId: item.id, requiredQty: 2 }), { id });
    expect(Number((await prisma.inventoryItem.findUnique({ where: { id: item.id } }))!.reservedQuantity)).toBe(2);
    const { status } = await invoke(delJobCard, req('DELETE', `/api/admin/job-cards/${id}`), { id });
    expect(status).toBe(200);
    expect(Number((await prisma.inventoryItem.findUnique({ where: { id: item.id } }))!.reservedQuantity)).toBe(0);
    expect(await prisma.jobCard.findUnique({ where: { id } })).toBeNull();
  });

  it('DELETE refuses a job-card with a finalized invoice', async () => {
    const c = await seed.customer();
    const v = await seed.vehicle(c.id);
    const jc = await invoke(createJobCard, req('POST', '/api/admin/job-cards', { customerId: c.id, vehicleId: v.id, issueSummary: 'fin' }));
    const id = jc.body.data.id;
    const inv = await prisma.invoice.findFirst({ where: { jobCardId: id } });
    await invoke(addLine, req('POST', `/api/admin/invoices/${inv!.id}/line-items`, { lineType: 'SERVICE_CHARGE', description: 's', quantity: 1, unitPrice: 100 }), { id: inv!.id });
    await invoke(finalize, req('POST', `/api/admin/invoices/${inv!.id}/finalize`), { id: inv!.id });
    const { status } = await invoke(delJobCard, req('DELETE', `/api/admin/job-cards/${id}`), { id });
    expect(status).toBe(400);
  });

  it('DELETE refuses a job-card with recorded payments', async () => {
    const c = await seed.customer();
    const v = await seed.vehicle(c.id);
    const jc = await invoke(createJobCard, req('POST', '/api/admin/job-cards', { customerId: c.id, vehicleId: v.id, issueSummary: 'pay' }));
    const id = jc.body.data.id;
    const inv = await prisma.invoice.findFirst({ where: { jobCardId: id } });
    await invoke(addLine, req('POST', `/api/admin/invoices/${inv!.id}/line-items`, { lineType: 'SERVICE_CHARGE', description: 's', quantity: 1, unitPrice: 100 }), { id: inv!.id });
    await invoke(finalize, req('POST', `/api/admin/invoices/${inv!.id}/finalize`), { id: inv!.id });
    await invoke(addPayment, req('POST', `/api/admin/invoices/${inv!.id}/payments`, { amount: 50, paymentMode: 'CASH', paymentDate: '2026-06-12' }), { id: inv!.id });
    // Even before finalize, payments wouldn't exist; with finalize+payment present, delete blocked by both guards.
    const { status } = await invoke(delJobCard, req('DELETE', `/api/admin/job-cards/${id}`), { id });
    expect(status).toBe(400);
  });
});

describe('public estimate happy-path approve + reject (integration)', () => {
  beforeAll(async () => { await resetDb(); await ensureSeedAdmin(); });
  beforeEach(() => clearAuth());

  async function createEstimate() {
    const c = await prisma.customer.create({ data: { fullName: 'Est', phoneNumber: '9000000400' } });
    const v = await prisma.vehicle.create({ data: { customerId: c.id, vehicleType: 'BIKE', registrationNumber: `WB-25-AA-${Math.floor(Math.random() * 9999)}`, brand: 'X', model: 'Y' } });
    const token = `tok_${Date.now()}_${Math.random().toString(36).slice(2, 12)}_${Math.random().toString(36).slice(2, 12)}`;
    const jc = await prisma.jobCard.create({
      data: {
        jobCardNumber: `JC-EST-${Date.now()}${Math.random().toString(36).slice(2, 5)}`,
        customerId: c.id, vehicleId: v.id, issueSummary: 'estim',
        intakeDate: new Date(),
        estimateToken: token,
        estimateTokenExpiresAt: new Date(Date.now() + 60_000),
        estimatedPartsCost: 200, estimatedLaborCost: 300, estimatedTotal: 500,
        approvalStatus: 'PENDING',
      },
    });
    return { jc, token };
  }

  it('POST approve with correct revision succeeds', async () => {
    const { jc, token } = await createEstimate();
    const fresh = await prisma.jobCard.findUniqueOrThrow({ where: { id: jc.id } });
    const revision = computeEstimateRevision(fresh);
    const r = await estimatePost(req('POST', `/api/public/estimate/${token}`, { action: 'approved', estimateRevision: revision }) as any, { params: { token } } as any);
    expect(r.status).toBe(200);
    const after = await prisma.jobCard.findUnique({ where: { id: jc.id } });
    expect(after?.approvalStatus).toBe('APPROVED');
  });

  it('POST reject with correct revision succeeds + sets approvalStatus REJECTED', async () => {
    const { jc, token } = await createEstimate();
    const fresh = await prisma.jobCard.findUniqueOrThrow({ where: { id: jc.id } });
    const revision = computeEstimateRevision(fresh);
    const r = await estimatePost(req('POST', `/api/public/estimate/${token}`, { action: 'rejected', estimateRevision: revision, comment: 'too high' }) as any, { params: { token } } as any);
    expect(r.status).toBe(200);
    const after = await prisma.jobCard.findUnique({ where: { id: jc.id } });
    expect(after?.approvalStatus).toBe('REJECTED');
  });

  it('POST with a WRONG revision is refused (price-pinning)', async () => {
    const { jc, token } = await createEstimate();
    const r = await estimatePost(req('POST', `/api/public/estimate/${token}`, { action: 'approved', estimateRevision: 'wrong-revision-here-stuffed-pad' }) as any, { params: { token } } as any);
    expect(r.status).toBeGreaterThanOrEqual(400);
    const after = await prisma.jobCard.findUnique({ where: { id: jc.id } });
    expect(after?.approvalStatus).toBe('PENDING');
  });

  it('second action after APPROVED is refused', async () => {
    const { jc, token } = await createEstimate();
    const fresh = await prisma.jobCard.findUniqueOrThrow({ where: { id: jc.id } });
    const rev = computeEstimateRevision(fresh);
    await estimatePost(req('POST', `/api/public/estimate/${token}`, { action: 'approved', estimateRevision: rev }) as any, { params: { token } } as any);
    const r = await estimatePost(req('POST', `/api/public/estimate/${token}`, { action: 'rejected', estimateRevision: rev }) as any, { params: { token } } as any);
    expect(r.status).toBeGreaterThanOrEqual(400);
  });
});

describe('notifications list (integration)', () => {
  beforeAll(async () => { await resetDb(); await ensureSeedAdmin(); });
  beforeEach(() => asRole('SUPER_ADMIN'));

  it('GET returns array (filterable later)', async () => {
    const { status } = await invoke(listNotifications, req('GET', '/api/admin/notifications?pageSize=5'));
    expect(status).toBe(200);
  });
});

describe('workers leave PATCH approval (integration)', () => {
  beforeAll(async () => { await resetDb(); await ensureSeedAdmin(); });
  beforeEach(() => asRole('SUPER_ADMIN'));

  it('PATCH a pending leave to APPROVED', async () => {
    const w = await seed.worker();
    const a = await invoke(addLeave, req('POST', `/api/admin/workers/${w.id}/leave`, { leaveType: 'SICK', startDate: '2027-01-10', endDate: '2027-01-15' }), { id: w.id });
    const leaveId = a.body.data?.id ?? (await prisma.workerLeave.findFirst({ where: { workerId: w.id } }))!.id;
    const { status } = await invoke(patchLeave, req('PATCH', `/api/admin/workers/${w.id}/leave`, { leaveId, status: 'APPROVED' }), { id: w.id });
    expect(status).toBe(200);
    const row = await prisma.workerLeave.findUnique({ where: { id: leaveId } });
    expect(row?.status).toBe('APPROVED');
  });

  it('REJECT a leave', async () => {
    const w = await seed.worker();
    const a = await invoke(addLeave, req('POST', `/api/admin/workers/${w.id}/leave`, { leaveType: 'CASUAL', startDate: '2027-02-10', endDate: '2027-02-12' }), { id: w.id });
    const leaveId = a.body.data?.id ?? (await prisma.workerLeave.findFirst({ where: { workerId: w.id, leaveType: 'CASUAL' } }))!.id;
    const { status } = await invoke(patchLeave, req('PATCH', `/api/admin/workers/${w.id}/leave`, { leaveId, status: 'REJECTED' }), { id: w.id });
    expect(status).toBe(200);
  });
});

describe('public track happy path (integration)', () => {
  beforeAll(async () => { await resetDb(); await ensureSeedAdmin(); });
  beforeEach(() => clearAuth());

  it('finds an SR by phone + referenceId', async () => {
    // Create via public form so it has a referenceId
    const r = await invoke(publicSR, req('POST', '/api/public/service-requests', {
      fullName: 'Track Cust', phoneNumber: '9333344555', vehicleType: 'BIKE',
      brand: 'Hero', model: 'HF', registrationNumber: 'WB-31-BB-1212',
      serviceCategory: 'GENERAL', issueDescription: 'something',
    }));
    expect(r.status).toBeLessThan(300);
    const sr = await prisma.serviceRequest.findFirst({ where: { customer: { phoneNumber: '9333344555' } } });
    expect(sr).toBeTruthy();
    const t = await invoke(track, req('POST', '/api/public/track', { phoneNumber: '9333344555', referenceId: sr!.referenceId!, lookupType: 'reference' }));
    expect(t.status).toBe(200);
  });

  it('vehicle-lookup with too-short needle returns generic miss', async () => {
    const t = await invoke(track, req('POST', '/api/public/track', { phoneNumber: '9333344555', vehicleNumber: 'abc', lookupType: 'vehicle' }));
    expect(t.status).toBe(404);
  });

  it('returns generic miss for an unknown phone (no enumeration)', async () => {
    const t = await invoke(track, req('POST', '/api/public/track', { phoneNumber: '9000000001', referenceId: 'SR-NOPE', lookupType: 'reference' }));
    expect(t.status).toBe(404);
  });
});
