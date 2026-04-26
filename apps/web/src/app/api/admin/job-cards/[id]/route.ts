import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/auth';
import { handleApiError } from '@/lib/errors';
import { logActivity } from '@/lib/activity-logger';
import { PERMISSIONS } from '@gearup/types';
import { z } from 'zod';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    requirePermission(PERMISSIONS.JOB_CARDS_CREATE);
    const jc = await prisma.jobCard.findUniqueOrThrow({ where: { id: params.id }, include: { customer: true, vehicle: true, appointment: true, serviceRequest: true, assignments: { include: { worker: true } }, tasks: { orderBy: { sortOrder: 'asc' } }, parts: { include: { inventoryItem: true } }, invoices: true } });
    return NextResponse.json({ success: true, data: jc });
  } catch (e) { return handleApiError(e); }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = requirePermission(PERMISSIONS.JOB_CARDS_UPDATE_STATUS);
    const body = z.object({
      status: z.string().optional(), approvalStatus: z.string().optional(), diagnosisNotes: z.string().optional(),
      estimateNotes: z.string().optional(), customerVisibleNotes: z.string().optional(), internalNotes: z.string().optional(),
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
