import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { asRole, req, invoke, ensureSeedAdmin, resetDb, prisma, seed } from './helpers';
import { POST as createJobCard } from '@/app/api/admin/job-cards/route';
import { POST as addLine } from '@/app/api/admin/invoices/[id]/line-items/route';
import { POST as finalize } from '@/app/api/admin/invoices/[id]/finalize/route';
import { POST as addPayment } from '@/app/api/admin/invoices/[id]/payments/route';
import { POST as addPart } from '@/app/api/admin/job-cards/[id]/parts/route';

async function finalizedInvoice(total: number) {
  const c = await seed.customer();
  const v = await seed.vehicle(c.id);
  const jc = await invoke(createJobCard, req('POST', '/api/admin/job-cards', { customerId: c.id, vehicleId: v.id, issueSummary: 'conc' }));
  const inv = await prisma.invoice.findFirst({ where: { jobCardId: jc.body.data.id } });
  await invoke(addLine, req('POST', `/api/admin/invoices/${inv!.id}/line-items`, { lineType: 'SERVICE_CHARGE', description: 's', quantity: 1, unitPrice: total }), { id: inv!.id });
  await invoke(finalize, req('POST', `/api/admin/invoices/${inv!.id}/finalize`), { id: inv!.id });
  return inv!.id;
}

describe('CONCURRENCY — optimistic locks must hold under parallel writes', () => {
  beforeAll(async () => { await resetDb(); await ensureSeedAdmin(); });
  beforeEach(() => asRole('SUPER_ADMIN'));

  it('two simultaneous full payments do not both succeed (no over-collection)', async () => {
    const invoiceId = await finalizedInvoice(1000);
    const pay = () => invoke(addPayment, req('POST', `/api/admin/invoices/${invoiceId}/payments`, { amount: 1000, paymentMode: 'CASH', paymentDate: '2026-06-12' }), { id: invoiceId });
    const [a, b] = await Promise.all([pay(), pay()]);
    const ok = [a, b].filter((r) => r.status === 201).length;
    expect(ok).toBe(1); // exactly one wins
    const inv = await prisma.invoice.findUnique({ where: { id: invoiceId } });
    expect(Number(inv!.amountPaid)).toBe(1000); // never 2000
    const paymentTotal = (await prisma.payment.aggregate({ where: { invoiceId }, _sum: { amount: true } }))._sum.amount;
    expect(Number(paymentTotal ?? 0)).toBe(1000);
  });

  it('parallel reservations of the last stock units never oversell', async () => {
    const cat = await seed.category();
    const item = await seed.item(cat.id, { quantityInStock: 3 });
    // three job cards each trying to reserve 2 → only one (maybe one) can fully succeed; total reserved <= stock
    const mkJc = async () => {
      const c = await seed.customer();
      const v = await seed.vehicle(c.id);
      const jc = await invoke(createJobCard, req('POST', '/api/admin/job-cards', { customerId: c.id, vehicleId: v.id, issueSummary: 'r' }));
      return jc.body.data.id;
    };
    const j1 = await mkJc(); const j2 = await mkJc(); const j3 = await mkJc();
    const reserve = (jid: string) => invoke(addPart, req('POST', `/api/admin/job-cards/${jid}/parts`, { inventoryItemId: item.id, requiredQty: 2 }), { id: jid });
    await Promise.all([reserve(j1), reserve(j2), reserve(j3)]);
    const after = await prisma.inventoryItem.findUnique({ where: { id: item.id } });
    // Never oversold: reserved cannot exceed the 3 units that existed.
    expect(Number(after!.reservedQuantity)).toBeLessThanOrEqual(3);
    expect(Number(after!.quantityInStock)).toBeGreaterThanOrEqual(0);
  });
});
