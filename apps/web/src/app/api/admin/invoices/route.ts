import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { paginate, paginationMeta } from '@/lib/pagination';
import { requirePermission } from '@/lib/auth';
import { handleApiError } from '@/lib/errors';
import { logActivity } from '@/lib/activity-logger';
import { generateInvoiceNumber } from '@/lib/id-generators';
import { PERMISSIONS } from '@gearup/types';
import { z } from 'zod';

const lineItemSchema = z.object({
  lineType: z.enum(['PART', 'LABOR', 'CUSTOM_CHARGE', 'DISCOUNT_ADJUSTMENT']),
  referenceItemId: z.string().optional(), description: z.string(),
  quantity: z.number().default(1), unitPrice: z.number().default(0),
  taxRate: z.number().default(0), sortOrder: z.number().default(0),
});
const createSchema = z.object({
  customerId: z.string(), vehicleId: z.string(), jobCardId: z.string(), appointmentId: z.string().optional(),
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
    const page = Number(sp.get('page')) || 1;
    const pageSize = Number(sp.get('pageSize')) || 20;
    const p = paginate({ page, pageSize });
    const where: Record<string, unknown> = {};
    const ps = sp.get('paymentStatus'); if (ps) where.paymentStatus = ps;
    const is = sp.get('invoiceStatus'); if (is) where.invoiceStatus = is;
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
    // Enforce 1 invoice per job card
    const existing = await prisma.invoice.findFirst({ where: { jobCardId: body.jobCardId } });
    if (existing) return NextResponse.json({ success: false, error: { message: `Invoice ${existing.invoiceNumber} already exists for this job card` } }, { status: 409 });
    let invoice;
    try {
      invoice = await prisma.$transaction(async (tx: any) => {
        let subtotal = 0, taxTotal = 0;
        const lines = body.lineItems.map((li) => {
          const lineTotal = li.quantity * li.unitPrice;
          const taxAmount = lineTotal * (li.taxRate / 100);
          subtotal += lineTotal; taxTotal += taxAmount;
          return { ...li, taxAmount, lineTotal: lineTotal + taxAmount };
        });
        const discountAmount = body.discountType === 'PERCENTAGE' ? subtotal * ((body.discountValue ?? 0) / 100) : (body.discountValue ?? 0);
        const grandTotal = subtotal + taxTotal - discountAmount;
        return tx.invoice.create({
          data: { invoiceNumber: generateInvoiceNumber(), customerId: body.customerId, vehicleId: body.vehicleId, jobCardId: body.jobCardId, appointmentId: body.appointmentId, invoiceDate: new Date(body.invoiceDate), dueDate: body.dueDate ? new Date(body.dueDate) : undefined, subtotal, taxTotal, discountType: body.discountType, discountValue: body.discountValue, discountAmount, grandTotal, amountDue: grandTotal, notes: body.notes, createdByAdminId: user.sub, lineItems: { create: lines } } as any,
          include: { lineItems: true },
        });
      });
    } catch (e) {
      if (!isUniqueJobCardInvoiceError(e)) throw e;
      const existing = await prisma.invoice.findFirst({ where: { jobCardId: body.jobCardId } });
      return NextResponse.json({ success: false, error: { message: existing ? `Invoice ${existing.invoiceNumber} already exists for this job card` : 'Invoice already exists for this job card' } }, { status: 409 });
    }
    logActivity({ entityType: 'Invoice', entityId: invoice.id, action: 'invoice.created', newValue: { invoiceNumber: invoice.invoiceNumber }, actorType: 'ADMIN', actorId: user.sub });
    return NextResponse.json({ success: true, data: invoice }, { status: 201 });
  } catch (e) { return handleApiError(e); }
}
