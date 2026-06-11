import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { clearAuth, req, invoke, ensureSeedAdmin, resetDb, prisma, seed } from './helpers';
import { POST as publicSR } from '@/app/api/public/service-requests/route';
import { GET as availableSlots } from '@/app/api/public/available-slots/route';
import { GET as customerLookup } from '@/app/api/public/customer-lookup/route';
import { POST as track } from '@/app/api/public/track/route';

// Public endpoints are unauthenticated by design — no token armed.
describe('public booking pipeline (integration, unauthenticated)', () => {
  beforeAll(async () => { await resetDb(); await ensureSeedAdmin(); });
  beforeEach(() => clearAuth());

  it('accepts a valid service request and creates customer + vehicle + SR', async () => {
    const { status, body } = await invoke(publicSR, req('POST', '/api/public/service-requests', {
      fullName: 'Public Booker', phoneNumber: '9811122233', vehicleType: 'BIKE',
      brand: 'Hero', model: 'Splendor', registrationNumber: 'WB-20-AA-4545',
      serviceCategory: 'GENERAL', issueDescription: 'Engine noise on cold start',
    }));
    expect(status).toBeLessThan(300);
    expect(body.success).toBe(true);
    const cust = await prisma.customer.findFirst({ where: { phoneNumber: '9811122233' } });
    expect(cust).toBeTruthy();
    const sr = await prisma.serviceRequest.findFirst({ where: { customerId: cust!.id } });
    expect(sr).toBeTruthy();
  });

  it('rejects a malformed registration number', async () => {
    const { status } = await invoke(publicSR, req('POST', '/api/public/service-requests', {
      fullName: 'X', phoneNumber: '9811122234', vehicleType: 'BIKE', brand: 'A', model: 'B',
      registrationNumber: '@@@', serviceCategory: 'GENERAL', issueDescription: 'x'.repeat(5),
    }));
    expect(status).toBe(400);
  });

  it('rejects an invalid vehicleType enum', async () => {
    const { status } = await invoke(publicSR, req('POST', '/api/public/service-requests', {
      fullName: 'X', phoneNumber: '9811122235', vehicleType: 'TRUCK', brand: 'A', model: 'B',
      registrationNumber: 'WB-20-AA-9090', serviceCategory: 'GENERAL', issueDescription: 'noise',
    }));
    expect(status).toBe(400);
  });

  it('reuses an existing customer by phone (no duplicate)', async () => {
    await invoke(publicSR, req('POST', '/api/public/service-requests', {
      fullName: 'Repeat Cust', phoneNumber: '9899988877', vehicleType: 'BIKE', brand: 'TVS', model: 'Apache',
      registrationNumber: 'WB-21-BB-1212', serviceCategory: 'GENERAL', issueDescription: 'service due',
    }));
    await invoke(publicSR, req('POST', '/api/public/service-requests', {
      fullName: 'Repeat Cust', phoneNumber: '9899988877', vehicleType: 'BIKE', brand: 'TVS', model: 'Apache',
      registrationNumber: 'WB-21-BB-1212', serviceCategory: 'GENERAL', issueDescription: 'another issue',
    }));
    const count = await prisma.customer.count({ where: { phoneNumber: '9899988877' } });
    expect(count).toBe(1);
  });

  it('available-slots returns slots when rules exist, empty when none', async () => {
    // No rules yet → empty
    let r = await invoke(availableSlots, req('GET', '/api/public/available-slots?date=2026-07-13'));
    expect(r.status).toBe(200);
    const emptyLen = (r.body.data?.slots ?? r.body.slots ?? []).length;
    expect(emptyLen).toBe(0);
    // Monday rule (2026-07-13 is a Monday) → slots appear
    await prisma.appointmentSlotRule.create({ data: { dayOfWeek: 1, openTime: '09:00', closeTime: '12:00', slotDurationMinutes: 60, maxCapacity: 2 } });
    r = await invoke(availableSlots, req('GET', '/api/public/available-slots?date=2026-07-13'));
    expect(r.status).toBe(200);
    expect((r.body.data?.slots ?? r.body.slots ?? []).length).toBeGreaterThan(0);
  });

  it('available-slots rejects a malformed date', async () => {
    const { status } = await invoke(availableSlots, req('GET', '/api/public/available-slots?date=13-07-2026'));
    expect(status).toBe(400);
  });

  it('customer-lookup returns a boolean existence signal without leaking PII', async () => {
    await seed.customer({ phoneNumber: '9700011122' });
    const { status, body } = await invoke(customerLookup, req('GET', '/api/public/customer-lookup?phone=9700011122'));
    expect(status).toBe(200);
    const str = JSON.stringify(body);
    expect(str).not.toMatch(/Seed Cust/); // no name leak
  });

  it('track returns a generic miss for an unknown reference (no enumeration)', async () => {
    const { status } = await invoke(track, req('POST', '/api/public/track', { phoneNumber: '9000000000', referenceId: 'SR-DOESNOTEXIST', lookupType: 'reference' }));
    expect([200, 404]).toContain(status);
  });
});
