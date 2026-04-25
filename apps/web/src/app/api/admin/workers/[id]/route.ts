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
    const body = z.object({
      fullName: z.string().optional(), phoneNumber: z.string().nullable().optional(), email: z.string().nullable().optional(),
      designation: z.string().nullable().optional(), specialization: z.string().nullable().optional(),
      employmentType: z.string().nullable().optional(), shiftStart: z.string().nullable().optional(), shiftEnd: z.string().nullable().optional(),
      dailyCapacity: z.number().nullable().optional(), emergencyContactName: z.string().nullable().optional(),
      emergencyContactPhone: z.string().nullable().optional(), address: z.string().nullable().optional(),
      status: z.enum(['ACTIVE', 'INACTIVE', 'ON_LEAVE']).optional(), notes: z.string().nullable().optional(),
    }).parse(await req.json());
    const worker = await prisma.worker.update({ where: { id: params.id }, data: body as any });
    logActivity({ entityType: 'Worker', entityId: worker.id, action: 'worker.updated', newValue: body, actorType: 'ADMIN', actorId: user.sub });
    return NextResponse.json({ success: true, data: worker });
  } catch (e) { return handleApiError(e); }
}
