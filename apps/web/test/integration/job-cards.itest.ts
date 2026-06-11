import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { asRole, req, invoke, ensureSeedAdmin, resetDb, prisma, seed } from './helpers';
import { POST as createJobCard } from '@/app/api/admin/job-cards/route';
import { PATCH as patchJobCard, DELETE as deleteJobCard } from '@/app/api/admin/job-cards/[id]/route';
import { POST as addPart } from '@/app/api/admin/job-cards/[id]/parts/route';

describe('job-cards route (integration)', () => {
  let customerId: string, vehicleId: string;

  beforeAll(async () => {
    await resetDb();
    await ensureSeedAdmin();
    const c = await seed.customer();
    customerId = c.id;
    vehicleId = (await seed.vehicle(c.id)).id;
  });
  beforeEach(() => asRole('SUPER_ADMIN'));

  it('creates a job card AND auto-spawns a DRAFT invoice (founder-bug path)', async () => {
    const { status, body } = await invoke(
      createJobCard,
      req('POST', '/api/admin/job-cards', {
        customerId, vehicleId, issueSummary: 'brake check', priority: 'LOW', odometerAtIntake: 4321,
      }),
    );
    expect(status).toBe(201);
    const jcId = body.data.id;
    const inv = await prisma.invoice.findFirst({ where: { jobCardId: jcId } });
    expect(inv).toBeTruthy();
    expect(inv?.invoiceStatus).toBe('DRAFT');
    // odometer synced to vehicle
    const v = await prisma.vehicle.findUnique({ where: { id: vehicleId } });
    expect(Number(v?.odometerReading)).toBe(4321);
  });

  it('accepts empty-string priority by coercing to undefined (b9925e3 regression)', async () => {
    const { status } = await invoke(
      createJobCard,
      req('POST', '/api/admin/job-cards', { customerId, vehicleId, issueSummary: 'x', priority: '' }),
    );
    expect(status).toBe(201);
  });

  it('converts a linked service request to CONVERTED_TO_JOB', async () => {
    const sr = await prisma.serviceRequest.create({
      data: { referenceId: `SR-${Date.now()}`, customerId, vehicleId, serviceCategory: 'GENERAL', issueDescription: 'noise', status: 'SUBMITTED' },
    });
    await invoke(createJobCard, req('POST', '/api/admin/job-cards', { customerId, vehicleId, issueSummary: 'y', serviceRequestId: sr.id }));
    const after = await prisma.serviceRequest.findUnique({ where: { id: sr.id } });
    expect(after?.status).toBe('CONVERTED_TO_JOB');
  });

  it('P1 REGRESSION: cancelling a job card releases reserved stock', async () => {
    const cat = await seed.category();
    const item = await seed.item(cat.id, { quantityInStock: 10 });
    const jc = await invoke(createJobCard, req('POST', '/api/admin/job-cards', { customerId, vehicleId, issueSummary: 'reserve test' }));
    const jcId = jc.body.data.id;
    await invoke(addPart, req('POST', `/api/admin/job-cards/${jcId}/parts`, { inventoryItemId: item.id, requiredQty: 3 }), { id: jcId });

    const reservedBefore = Number((await prisma.inventoryItem.findUnique({ where: { id: item.id } }))!.reservedQuantity);
    expect(reservedBefore).toBe(3);

    const { status } = await invoke(patchJobCard, req('PATCH', `/api/admin/job-cards/${jcId}`, { status: 'CANCELLED' }), { id: jcId });
    expect(status).toBe(200);

    const after = await prisma.inventoryItem.findUnique({ where: { id: item.id } });
    expect(Number(after!.reservedQuantity)).toBe(0);
    // a RELEASED movement must be logged
    const mv = await prisma.stockMovement.findFirst({ where: { relatedEntityId: jcId, movementType: 'RELEASED' } });
    expect(mv).toBeTruthy();
  });

  it('cancelling twice does not double-release (idempotent guard)', async () => {
    const cat = await seed.category();
    const item = await seed.item(cat.id, { quantityInStock: 10 });
    const jc = await invoke(createJobCard, req('POST', '/api/admin/job-cards', { customerId, vehicleId, issueSummary: 'double cancel' }));
    const jcId = jc.body.data.id;
    await invoke(addPart, req('POST', `/api/admin/job-cards/${jcId}/parts`, { inventoryItemId: item.id, requiredQty: 2 }), { id: jcId });
    await invoke(patchJobCard, req('PATCH', `/api/admin/job-cards/${jcId}`, { status: 'CANCELLED' }), { id: jcId });
    await invoke(patchJobCard, req('PATCH', `/api/admin/job-cards/${jcId}`, { status: 'CANCELLED' }), { id: jcId });
    const after = await prisma.inventoryItem.findUnique({ where: { id: item.id } });
    expect(Number(after!.reservedQuantity)).toBe(0);
    expect(Number(after!.quantityInStock)).toBe(10); // released back exactly once
  });

  it('blocks DELETE of a DELIVERED job card', async () => {
    const jc = await invoke(createJobCard, req('POST', '/api/admin/job-cards', { customerId, vehicleId, issueSummary: 'deliver' }));
    const jcId = jc.body.data.id;
    await invoke(patchJobCard, req('PATCH', `/api/admin/job-cards/${jcId}`, { status: 'DELIVERED' }), { id: jcId });
    const { status } = await invoke(deleteJobCard, req('DELETE', `/api/admin/job-cards/${jcId}`), { id: jcId });
    expect(status).toBe(400);
  });

  it('sets actualDeliveryAt when status becomes DELIVERED', async () => {
    const jc = await invoke(createJobCard, req('POST', '/api/admin/job-cards', { customerId, vehicleId, issueSummary: 'ts' }));
    const jcId = jc.body.data.id;
    await invoke(patchJobCard, req('PATCH', `/api/admin/job-cards/${jcId}`, { status: 'DELIVERED' }), { id: jcId });
    const row = await prisma.jobCard.findUnique({ where: { id: jcId } });
    expect(row?.actualDeliveryAt).toBeTruthy();
  });
});
