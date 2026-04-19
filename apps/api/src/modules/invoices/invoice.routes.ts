import { Router } from 'express';
import { asyncHandler } from '../../common/utils/async-handler';
import { prisma } from '@gearup/db';
import { paginate, paginationMeta } from '@gearup/db';
import { requirePermission } from '../../common/middleware/auth';
import { PERMISSIONS } from '@gearup/types';
import { logActivity } from '../../common/utils/activity-logger';
import { generateInvoiceNumber } from '../../common/utils/id-generators';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';

const router: Router = Router();

router.get('/', requirePermission(PERMISSIONS.INVOICES_VIEW), asyncHandler(async (req, res) => {
  const { page, pageSize, paymentStatus, invoiceStatus } = req.query as Record<string, string>;
  const p = paginate({ page: Number(page) || 1, pageSize: Number(pageSize) || 20 });
  const where: Record<string, unknown> = {};
  if (paymentStatus) where.paymentStatus = paymentStatus;
  if (invoiceStatus) where.invoiceStatus = invoiceStatus;
  const [data, total] = await Promise.all([
    prisma.invoice.findMany({ where, ...p, orderBy: { invoiceDate: 'desc' }, include: { customer: { select: { fullName: true, phoneNumber: true } }, vehicle: { select: { registrationNumber: true } } } }),
    prisma.invoice.count({ where }),
  ]);
  res.json({ success: true, data, meta: paginationMeta(total, Number(page) || 1, Number(pageSize) || 20) });
}));

const lineItemSchema = z.object({
  lineType: z.enum(['PART', 'LABOR', 'CUSTOM_CHARGE', 'DISCOUNT_ADJUSTMENT']),
  referenceItemId: z.string().optional(),
  description: z.string(),
  quantity: z.number().default(1),
  unitPrice: z.number().default(0),
  taxRate: z.number().default(0),
  sortOrder: z.number().default(0),
});

const createSchema = z.object({
  customerId: z.string(),
  vehicleId: z.string(),
  jobCardId: z.string(),
  appointmentId: z.string().optional(),
  invoiceDate: z.string(),
  dueDate: z.string().optional(),
  discountType: z.string().optional(),
  discountValue: z.number().optional(),
  notes: z.string().optional(),
  lineItems: z.array(lineItemSchema),
});

router.post('/', requirePermission(PERMISSIONS.INVOICES_CREATE), asyncHandler(async (req, res) => {
  const body = createSchema.parse(req.body);

  const invoice = await prisma.$transaction(async (tx: any) => {
    let subtotal = 0, taxTotal = 0;
    const lines = body.lineItems.map((li) => {
      const lineTotal = li.quantity * li.unitPrice;
      const taxAmount = lineTotal * (li.taxRate / 100);
      subtotal += lineTotal;
      taxTotal += taxAmount;
      return { ...li, taxAmount, lineTotal: lineTotal + taxAmount };
    });

    const discountAmount = body.discountType === 'PERCENTAGE' ? subtotal * ((body.discountValue ?? 0) / 100) : (body.discountValue ?? 0);
    const grandTotal = subtotal + taxTotal - discountAmount;

    const inv = await tx.invoice.create({
      data: {
        invoiceNumber: generateInvoiceNumber(),
        customerId: body.customerId, vehicleId: body.vehicleId, jobCardId: body.jobCardId,
        appointmentId: body.appointmentId,
        invoiceDate: new Date(body.invoiceDate), dueDate: body.dueDate ? new Date(body.dueDate) : undefined,
        subtotal, taxTotal, discountType: body.discountType, discountValue: body.discountValue, discountAmount, grandTotal,
        amountDue: grandTotal, notes: body.notes, createdByAdminId: req.user!.sub,
        lineItems: { create: lines },
      } as unknown as Prisma.InvoiceUncheckedCreateInput,
      include: { lineItems: true },
    });
    return inv;
  });

  await logActivity({ entityType: 'Invoice', entityId: invoice.id, action: 'invoice.created', newValue: { invoiceNumber: invoice.invoiceNumber }, actorType: 'ADMIN', actorId: req.user!.sub, requestId: req.requestId });
  res.status(201).json({ success: true, data: invoice });
}));

router.get('/:id', requirePermission(PERMISSIONS.INVOICES_VIEW), asyncHandler(async (req, res) => {
  const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: req.params.id }, include: { lineItems: { orderBy: { sortOrder: 'asc' } }, payments: { orderBy: { paymentDate: 'desc' } }, customer: true, vehicle: true, jobCard: { select: { jobCardNumber: true } } } });
  res.json({ success: true, data: invoice });
}));

router.patch('/:id', requirePermission(PERMISSIONS.INVOICES_CREATE), asyncHandler(async (req, res) => {
  const invoice = await prisma.invoice.update({ where: { id: req.params.id }, data: req.body });
  res.json({ success: true, data: invoice });
}));

router.post('/:id/finalize', requirePermission(PERMISSIONS.INVOICES_FINALIZE), asyncHandler(async (req, res) => {
  const invoice = await prisma.invoice.update({ where: { id: req.params.id }, data: { invoiceStatus: 'FINALIZED', finalizedAt: new Date() } });
  await logActivity({ entityType: 'Invoice', entityId: invoice.id, action: 'invoice.finalized', actorType: 'ADMIN', actorId: req.user!.sub, requestId: req.requestId });
  res.json({ success: true, data: invoice });
}));

router.post('/:id/payments', requirePermission(PERMISSIONS.PAYMENTS_RECORD), asyncHandler(async (req, res) => {
  const body = z.object({ amount: z.number().positive(), paymentMode: z.string(), paymentDate: z.string(), referenceNumber: z.string().optional(), notes: z.string().optional() }).parse(req.body);

  const result = await prisma.$transaction(async (tx: any) => {
    const payment = await tx.payment.create({
      data: { invoiceId: req.params.id, amount: body.amount, paymentMode: body.paymentMode as any, paymentDate: new Date(body.paymentDate), referenceNumber: body.referenceNumber, notes: body.notes, receivedByAdminId: req.user!.sub },
    });
    const invoice = await tx.invoice.findUniqueOrThrow({ where: { id: req.params.id } });
    const newPaid = Number(invoice.amountPaid) + body.amount;
    const newDue = Number(invoice.grandTotal) - newPaid;
    const paymentStatus = newDue <= 0 ? 'PAID' : newPaid > 0 ? 'PARTIALLY_PAID' : 'UNPAID';
    await tx.invoice.update({ where: { id: req.params.id }, data: { amountPaid: newPaid, amountDue: Math.max(0, newDue), paymentStatus: paymentStatus as any } });
    return payment;
  });

  await logActivity({ entityType: 'Payment', entityId: result.id, action: 'payment.recorded', newValue: body, actorType: 'ADMIN', actorId: req.user!.sub, requestId: req.requestId });
  res.status(201).json({ success: true, data: result });
}));

export default router;
