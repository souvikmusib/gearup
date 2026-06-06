import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission, requireAnyPermission } from '@/lib/auth';
import { handleApiError } from '@/lib/errors';
import { logActivity } from '@/lib/activity-logger';
import { PERMISSIONS } from '@gearup/types';
import { z } from 'zod';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    requireAnyPermission(PERMISSIONS.JOB_CARDS_CREATE, PERMISSIONS.JOB_CARDS_VIEW_OWN);
    const jc = await prisma.jobCard.findUniqueOrThrow({ where: { id: params.id }, include: { customer: true, vehicle: true, appointment: true, serviceRequest: true, assignments: { include: { worker: true } }, tasks: { orderBy: { sortOrder: 'asc' } }, parts: { include: { inventoryItem: true } }, invoices: { include: { lineItems: { orderBy: { sortOrder: 'asc' } } } } } });
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
    const jc = await prisma.jobCard.update({ where: { id: params.id }, data });
    logActivity({ entityType: 'JobCard', entityId: jc.id, action: 'job-card.updated', newValue: body, actorType: 'ADMIN', actorId: user.sub });
    return NextResponse.json({ success: true, data: jc });
  } catch (e) { return handleApiError(e); }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = requirePermission(PERMISSIONS.JOB_CARDS_CREATE);
    // Delete related invoices (and their line items + payments)
    const invoices = await prisma.invoice.findMany({ where: { jobCardId: params.id }, select: { id: true } });
    for (const inv of invoices) {
      await prisma.payment.deleteMany({ where: { invoiceId: inv.id } });
      await prisma.invoiceLineItem.deleteMany({ where: { invoiceId: inv.id } });
    }
    await prisma.invoice.deleteMany({ where: { jobCardId: params.id } });
    // Delete job card related data
    await prisma.jobCardTask.deleteMany({ where: { jobCardId: params.id } });
    await prisma.jobCardPart.deleteMany({ where: { jobCardId: params.id } });
    await prisma.workerAssignment.deleteMany({ where: { jobCardId: params.id } });
    await prisma.jobCard.delete({ where: { id: params.id } });
    logActivity({ entityType: 'JobCard', entityId: params.id, action: 'job-card.deleted', actorType: 'ADMIN', actorId: user.sub });
    return NextResponse.json({ success: true });
  } catch (e) { return handleApiError(e); }
}
