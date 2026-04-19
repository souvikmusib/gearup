import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/auth';
import { handleApiError } from '@/lib/errors';
import { logActivity } from '@/lib/activity-logger';
import { PERMISSIONS } from '@gearup/types';
import { z } from 'zod';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    requirePermission(PERMISSIONS.WORKERS_MANAGE);
    const worker = await prisma.worker.findUniqueOrThrow({ where: { id: params.id }, include: { assignments: { include: { jobCard: { select: { jobCardNumber: true, status: true } } }, orderBy: { assignedAt: 'desc' }, take: 20 }, leaves: { orderBy: { startDate: 'desc' }, take: 10 } } });
    return NextResponse.json({ success: true, data: worker });
  } catch (e) { return handleApiError(e); }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = requirePermission(PERMISSIONS.WORKERS_MANAGE);
    const body = z.object({ fullName: z.string().optional(), phoneNumber: z.string().optional(), status: z.enum(['ACTIVE', 'INACTIVE', 'ON_LEAVE']).optional(), notes: z.string().optional() }).parse(await req.json());
    const worker = await prisma.worker.update({ where: { id: params.id }, data: body as any });
    await logActivity({ entityType: 'Worker', entityId: worker.id, action: 'worker.updated', newValue: body, actorType: 'ADMIN', actorId: user.sub });
    return NextResponse.json({ success: true, data: worker });
  } catch (e) { return handleApiError(e); }
}
