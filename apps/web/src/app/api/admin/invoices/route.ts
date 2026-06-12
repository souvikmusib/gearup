import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { paginate, paginationMeta } from '@/lib/pagination';
import { requirePermission } from '@/lib/auth';
import { handleApiError } from '@/lib/errors';
import { logActivity } from '@/lib/activity-logger';
import { generateInvoiceNumber } from '@/lib/id-generators';
import { computeLineTotal, nonDiscountPreSubtotal } from '@/lib/invoice-calc';
import { PERMISSIONS } from '@gearup/types';
import { z } from 'zod';

const lineItemSchema = z.object({
  lineType: z.enum(['PART', 'LABOR', 'CUSTOM_CHARGE', 'DISCOUNT_ADJUSTMENT']),
  referenceItemId: z.string().optional(), description: z.string().trim().min(1),
  quantity: z.number().positive().default(1), unitPrice: z.number().nonnegative().default(0),
  taxRate: z.number().min(0).max(100).default(0), sortOrder: z.number().default(0),
  discountMode: z.preprocess(v => v === '' ? undefined : v, z.enum(['flat', 'percent']).optional()),
});
const createSchema = z.object({
  customerId: z.string(), vehicleId: z.string().optional(), jobCardId: z.string().optional(), appointmentId: z.string().optional(),
  saleType: z.enum(['SERVICE', 'COUNTER']).default('SERVICE'),
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
    const pageSizeQuery = z.coerce.number().int().min(1).max(100).default(20);
    const page = pageQuery.parse(sp.get('page') ?? undefined);
    const pageSize = pageSizeQuery.parse(sp.get('pageSize') ?? undefined);
    const p = paginate({ page, pageSize });
    const where: Record<string, unknown> = {};
    const ps = sp.get('paymentStatus'); if (ps) where.paymentStatus = ps;
    const is = sp.get('invoiceStatus'); if (is) where.invoiceStatus = is;
    const saleType = sp.get('saleType'); if (saleType) where.saleType = saleType;
    const search = sp.get('search'); if (search) where.OR = [{ invoiceNumber: { contains: search, mode: 'insensitive' } }, { customer: { fullName: { contains: search, mode: 'insensitive' } } }];
    const from = sp.get('from'); const to = sp.get('to');
    if (from && to) where.invoiceDate = { gte: new Date(from), lte: new Date(to + 'T23:59:59') };
    else if (from) where.invoiceDate = { gte: new Date(from) };
    else if (to) where.invoiceDate = { lte: new Date(to + 'T23:59:59') };
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
        let subtotal = 0, taxTotal = 0;
        // Canonical percent-discount base: sum of (qty*price) across non-discount lines.
        const preSubtotal = nonDiscountPreSubtotal(body.lineItems);

        const lines = body.lineItems.map((li) => {
          const { lineTotal, taxAmount, netLineTotal } = computeLineTotal(li, preSubtotal);
          subtotal += netLineTotal;
          taxTotal += taxAmount;
          return { lineType: li.lineType, description: li.description, quantity: li.quantity, unitPrice: li.unitPrice, taxRate: li.taxRate, sortOrder: li.sortOrder, taxAmount, lineTotal };
        });
        const discountAmount = body.discountType === 'PERCENTAGE' ? subtotal * ((body.discountValue ?? 0) / 100) : (body.discountValue ?? 0);
        const grandTotal = Math.round(subtotal + taxTotal - discountAmount);
        return tx.invoice.create({
          data: { invoiceNumber: await generateInvoiceNumber(tx), customerId: body.customerId, vehicleId: body.vehicleId, jobCardId: body.jobCardId, appointmentId: body.appointmentId, invoiceDate: new Date(body.invoiceDate), dueDate: body.dueDate ? new Date(body.dueDate) : undefined, subtotal, taxTotal, discountType: body.discountType, discountValue: body.discountValue, discountAmount, grandTotal, amountDue: grandTotal, notes: body.notes, createdByAdminId: user.sub, lineItems: { create: lines } },
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
