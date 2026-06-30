import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { paginate, paginationMeta } from '@/lib/pagination';
import { MAX_PAGE_SIZE } from '@/lib/constants';
import { requirePermission } from '@/lib/auth';
import { handleApiError } from '@/lib/errors';
import { logActivity } from '@/lib/activity-logger';
import { generateInvoiceNumber } from '@/lib/id-generators';
import { computeLineTotal, nonDiscountPreSubtotal } from '@/lib/invoice-calc';
import { resolveHsnAndRate } from '@/lib/hsn-rate';
import { PERMISSIONS } from '@gearup/types';
import { z } from 'zod';

const lineItemSchema = z.object({
  lineType: z.enum(['PART', 'LABOR', 'CUSTOM_CHARGE', 'DISCOUNT_ADJUSTMENT']),
  referenceItemId: z.string().optional(), description: z.string().trim().min(1),
  hsnCode: z.string().optional(),
  quantity: z.number().positive().default(1), unitPrice: z.number().nonnegative().default(0),
  taxRate: z.number().min(0).max(100).default(0), sortOrder: z.number().default(0),
  discountPercent: z.number().min(0).max(100).default(0),
  discountMode: z.preprocess(v => v === '' ? undefined : v, z.enum(['flat', 'percent']).optional()),
});
const createSchema = z.object({
  customerId: z.string(), vehicleId: z.string().optional(), jobCardId: z.string().optional(), appointmentId: z.string().optional(),
  saleType: z.enum(['SERVICE', 'COUNTER']).default('SERVICE'),
  showGst: z.boolean().default(false),
  invoiceDate: z.string(), dueDate: z.string().optional(), discountType: z.string().optional(),
  discountValue: z.number().optional(), notes: z.string().optional(), lineItems: z.array(lineItemSchema),
});

function isUniqueJobCardInvoiceError(error: unknown) {
  if (typeof error !== 'object' || error === null || !('code' in error)) return false;
  const e = error as { code?: unknown; meta?: { target?: unknown } };
  if (e.code !== 'P2002') return false;
  const target = e.meta?.target;
  return Array.isArray(target) ? target.includes('jobCardId') : target === 'jobCardId';
}

export async function GET(req: NextRequest) {
  try {
    requirePermission(PERMISSIONS.INVOICES_VIEW);
    const sp = req.nextUrl.searchParams;
    const pageQuery = z.coerce.number().int().min(1).default(1);
    const pageSizeQuery = z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(20);
    const page = pageQuery.parse(sp.get('page') ?? undefined);
    const pageSize = pageSizeQuery.parse(sp.get('pageSize') ?? undefined);
    const p = paginate({ page, pageSize });
    const where: Record<string, unknown> = {};
    const ps = sp.get('paymentStatus'); if (ps) where.paymentStatus = ps;
    const is = sp.get('invoiceStatus'); if (is) where.invoiceStatus = is;
    const search = sp.get('search'); if (search) where.OR = [{ invoiceNumber: { contains: search, mode: 'insensitive' } }, { customer: { fullName: { contains: search, mode: 'insensitive' } } }];
    const from = sp.get('from'); const to = sp.get('to');
    if (from && to) where.invoiceDate = { gte: new Date(from + 'T00:00:00+05:30'), lte: new Date(to + 'T23:59:59+05:30') };
    else if (from) where.invoiceDate = { gte: new Date(from + 'T00:00:00+05:30') };
    else if (to) where.invoiceDate = { lte: new Date(to + 'T23:59:59+05:30') };
    const [data, total] = await Promise.all([
      prisma.invoice.findMany({ where, ...p, orderBy: { invoiceDate: 'desc' }, include: { customer: { select: { fullName: true, phoneNumber: true } }, vehicle: { select: { registrationNumber: true } } } }),
      prisma.invoice.count({ where }),
    ]);
    return NextResponse.json({ success: true, data, meta: paginationMeta(total, page, pageSize) });
  } catch (e) { return handleApiError(e); }
}

export async function POST(req: NextRequest) {
  try {
    const user = requirePermission(PERMISSIONS.INVOICES_CREATE);
    const body = createSchema.parse(await req.json());
    // Uniqueness on jobCardId is enforced at the DB level (Invoice.jobCardId @unique);
    // any conflict surfaces as P2002 and is handled below.
    let invoice;
    try {
      invoice = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        let subtotal = 0, taxTotal = 0, discountFromLines = 0;
        // Canonical percent-discount base: sum of (qty*price) across non-discount lines.
        const preSubtotal = nonDiscountPreSubtotal(body.lineItems);

        // Mirror recalcTotalsTx (line-items route): DISCOUNT_ADJUSTMENT lines are split
        // out of subtotal/taxTotal and tracked separately, so the stored subtotal stays
        // identical before and after any later line-item edit.
        const lines = [];
        for (const li of body.lineItems) {
          // Auto-resolve HSN code and tax rate from the HsnRate table
          const { hsnCode, taxRate } = await resolveHsnAndRate(
            li.lineType, body.showGst, li.referenceItemId, li.hsnCode,
          );
          // Use resolved rate unless client explicitly provided a non-zero override
          const effectiveRate = li.taxRate > 0 ? li.taxRate : taxRate;
          const lineWithRate = { ...li, taxRate: effectiveRate };

          const { lineTotal, taxAmount, netLineTotal } = computeLineTotal(lineWithRate, preSubtotal);
          if (li.lineType === 'DISCOUNT_ADJUSTMENT') {
            discountFromLines += lineTotal; // already negative
          } else {
            subtotal += netLineTotal;
            taxTotal += taxAmount;
          }
          // Discount lines persist their percent into discountPercent (>0 ⇒ percent marker)
          // so later edits re-derive them; non-discount lines keep their per-line discount.
          const discountPercent = li.lineType === 'DISCOUNT_ADJUSTMENT'
            ? (li.discountMode === 'percent' ? li.unitPrice : 0)
            : li.discountPercent;
          lines.push({ lineType: li.lineType, description: li.description, quantity: li.quantity, unitPrice: li.unitPrice, taxRate: effectiveRate, hsnCode, sortOrder: li.sortOrder, discountPercent, taxAmount, lineTotal });
        }
        const discountAmount = Math.round((body.discountType === 'PERCENTAGE' ? subtotal * ((body.discountValue ?? 0) / 100) : (body.discountValue ?? 0)) * 100) / 100;
        const grandTotal = Math.round(subtotal + taxTotal + discountFromLines - discountAmount);
        return tx.invoice.create({
          data: { invoiceNumber: await generateInvoiceNumber(tx), customerId: body.customerId, vehicleId: body.vehicleId, jobCardId: body.jobCardId, appointmentId: body.appointmentId, invoiceDate: new Date(body.invoiceDate), dueDate: body.dueDate ? new Date(body.dueDate) : undefined, showGst: body.showGst, subtotal, taxTotal, discountType: body.discountType, discountValue: body.discountValue, discountAmount, grandTotal, amountDue: grandTotal, notes: body.notes, createdByAdminId: user.sub, lineItems: { create: lines } },
          include: { lineItems: true },
        });
      });
    } catch (e) {
      if (!isUniqueJobCardInvoiceError(e)) throw e;
      const existing = await prisma.invoice.findFirst({ where: { jobCardId: body.jobCardId } });
      return NextResponse.json({ success: false, error: { message: existing ? `Invoice ${existing.invoiceNumber} already exists for this job card` : 'Invoice already exists for this job card' } }, { status: 409 });
    }
    await logActivity({ entityType: 'Invoice', entityId: invoice.id, action: 'invoice.created', newValue: { invoiceNumber: invoice.invoiceNumber }, actorType: 'ADMIN', actorId: user.sub });
    return NextResponse.json({ success: true, data: invoice }, { status: 201 });
  } catch (e) { return handleApiError(e); }
}
