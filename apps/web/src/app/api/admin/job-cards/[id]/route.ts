import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission, requireAnyPermission } from '@/lib/auth';
import { handleApiError, ValidationError } from '@/lib/errors';
import { logActivity } from '@/lib/activity-logger';
import { PERMISSIONS } from '@gearup/types';
import { z } from 'zod';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = requireAnyPermission(PERMISSIONS.JOB_CARDS_CREATE, PERMISSIONS.JOB_CARDS_VIEW_OWN);
    // Tenant/scope guard: callers who only hold JOB_CARDS_VIEW_OWN (no broad
    // JOB_CARDS_CREATE) must be the assigned service manager on this job card.
    // Without this clause VIEW_OWN degenerates to "view any" given the id.
    const hasBroad = user.permissions.includes(PERMISSIONS.JOB_CARDS_CREATE);
    const where = hasBroad
      ? { id: params.id }
      : { id: params.id, assignedServiceManagerId: user.sub };
    const jc = await prisma.jobCard.findFirstOrThrow({ where, include: { customer: true, vehicle: true, appointment: true, serviceRequest: true, assignments: { include: { worker: true } }, tasks: { orderBy: { sortOrder: 'asc' } }, parts: { include: { inventoryItem: true } }, invoices: { include: { lineItems: { orderBy: { sortOrder: 'asc' } } } } } });
    return NextResponse.json({ success: true, data: jc });
  } catch (e) { return handleApiError(e); }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = requirePermission(PERMISSIONS.JOB_CARDS_UPDATE_STATUS);
    const body = z.object({
      status: z.string().optional(), approvalStatus: z.string().optional(), diagnosisNotes: z.string().optional(),
      estimateNotes: z.string().optional(), customerVisibleNotes: z.string().optional(), internalNotes: z.string().optional(),
      issueSummary: z.string().optional(), priority: z.string().nullable().optional(),
      estimatedPartsCost: z.number().optional(), estimatedLaborCost: z.number().optional(), estimatedTotal: z.number().optional(),
      finalPartsCost: z.number().optional(), finalLaborCost: z.number().optional(), finalTotal: z.number().optional(),
      odometerAtIntake: z.number().optional(),
    }).parse(await req.json());
    const data: Record<string, unknown> = { ...body };
    if (body.status === 'DELIVERED') data.actualDeliveryAt = new Date();
    // Cancelling a job card must release its reserved parts back to stock —
    // previously only DELETE did this, so a status-cancel leaked reservations
    // (phantom reservedQuantity) forever.
    const jc = await prisma.$transaction(async (tx) => {
      if (body.status === 'CANCELLED') {
        const prev = await tx.jobCard.findUniqueOrThrow({ where: { id: params.id }, select: { status: true } });
        if (prev.status !== 'CANCELLED') {
          const parts = await tx.jobCardPart.findMany({
            where: { jobCardId: params.id },
            select: { id: true, inventoryItemId: true, reservedQty: true, requiredQty: true },
          });
          for (const part of parts) {
            const releaseQty = Number(part.reservedQty) > 0 ? Number(part.reservedQty) : Number(part.requiredQty);
            await adjustStock(tx, part.inventoryItemId, releaseQty, 'RELEASED', params.id);
            await tx.jobCardPart.update({ where: { id: part.id }, data: { reservedQty: 0 } });
          }
        }
      }
      return tx.jobCard.update({ where: { id: params.id }, data });
    });
    logActivity({ entityType: 'JobCard', entityId: jc.id, action: 'job-card.updated', newValue: body, actorType: 'ADMIN', actorId: user.sub });
    return NextResponse.json({ success: true, data: jc });
  } catch (e) { return handleApiError(e); }
}

async function adjustStock(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  inventoryItemId: string,
  qty: number,
  type: 'RELEASED',
  jobCardId: string,
) {
  if (qty <= 0) return;
  const reservedDelta = -qty;
  const stockDelta = qty;
  const updated = await tx.inventoryItem.updateMany({
    where: { id: inventoryItemId, reservedQuantity: { gte: qty } },
    data: {
      quantityInStock: { increment: stockDelta },
      reservedQuantity: { increment: reservedDelta },
    },
  });
  if (updated.count === 0) {
    throw new ValidationError('Reserved stock is lower than the quantity being released.');
  }
  const item = await tx.inventoryItem.findUniqueOrThrow({ where: { id: inventoryItemId } });
  const newQty = Number(item.quantityInStock);
  await tx.stockMovement.create({
    data: {
      inventoryItemId,
      movementType: type,
      quantity: qty,
      previousQuantity: newQty - stockDelta,
      newQuantity: newQty,
      relatedEntityType: 'JobCard',
      relatedEntityId: jobCardId,
    },
  });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = requirePermission(PERMISSIONS.JOB_CARDS_DELETE);

    // Pre-flight guards: cannot delete delivered job cards or job cards with
    // non-DRAFT invoices / recorded payments. Done outside the tx for clarity;
    // re-checked inside the tx to avoid TOCTOU racing with concurrent writers.
    const jc = await prisma.jobCard.findUniqueOrThrow({
      where: { id: params.id },
      select: { id: true, status: true },
    });
    if (jc.status === 'DELIVERED') {
      throw new ValidationError('Cannot delete a job card that has been delivered.');
    }
    const nonDraftInvoiceCount = await prisma.invoice.count({
      where: { jobCardId: params.id, NOT: { invoiceStatus: 'DRAFT' } },
    });
    if (nonDraftInvoiceCount > 0) {
      throw new ValidationError('Cannot delete a job card with finalized or cancelled invoices.');
    }
    const paymentCount = await prisma.payment.count({
      where: { invoice: { jobCardId: params.id } },
    });
    if (paymentCount > 0) {
      throw new ValidationError('Cannot delete a job card that has recorded payments.');
    }

    await prisma.$transaction(async (tx) => {
      // Re-verify guards inside the transaction.
      const fresh = await tx.jobCard.findUniqueOrThrow({
        where: { id: params.id },
        select: { status: true },
      });
      if (fresh.status === 'DELIVERED') {
        throw new ValidationError('Cannot delete a job card that has been delivered.');
      }
      const nonDraft = await tx.invoice.count({
        where: { jobCardId: params.id, NOT: { invoiceStatus: 'DRAFT' } },
      });
      if (nonDraft > 0) {
        throw new ValidationError('Cannot delete a job card with finalized or cancelled invoices.');
      }
      const payments = await tx.payment.count({
        where: { invoice: { jobCardId: params.id } },
      });
      if (payments > 0) {
        throw new ValidationError('Cannot delete a job card that has recorded payments.');
      }

      // Release reserved stock for each part before deletion.
      const parts = await tx.jobCardPart.findMany({
        where: { jobCardId: params.id },
        select: { id: true, inventoryItemId: true, reservedQty: true, requiredQty: true },
      });
      for (const part of parts) {
        const releaseQty = Number(part.reservedQty) > 0
          ? Number(part.reservedQty)
          : Number(part.requiredQty);
        await adjustStock(tx, part.inventoryItemId, releaseQty, 'RELEASED', params.id);
      }

      // Delete related invoices (and their line items + payments — payments
      // count is already guaranteed zero by the guard above, but the
      // deleteMany is kept defensive in case of a race we missed).
      const invoices = await tx.invoice.findMany({
        where: { jobCardId: params.id },
        select: { id: true },
      });
      for (const inv of invoices) {
        await tx.payment.deleteMany({ where: { invoiceId: inv.id } });
        await tx.invoiceLineItem.deleteMany({ where: { invoiceId: inv.id } });
      }
      await tx.invoice.deleteMany({ where: { jobCardId: params.id } });

      // Delete job card related data.
      await tx.jobCardTask.deleteMany({ where: { jobCardId: params.id } });
      await tx.jobCardPart.deleteMany({ where: { jobCardId: params.id } });
      await tx.workerAssignment.deleteMany({ where: { jobCardId: params.id } });
      await tx.jobCard.delete({ where: { id: params.id } });
    });

    logActivity({ entityType: 'JobCard', entityId: params.id, action: 'job-card.deleted', actorType: 'ADMIN', actorId: user.sub });
    return NextResponse.json({ success: true });
  } catch (e) { return handleApiError(e); }
}
