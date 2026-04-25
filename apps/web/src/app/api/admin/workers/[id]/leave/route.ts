import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/auth';
import { handleApiError } from '@/lib/errors';
import { logActivity } from '@/lib/activity-logger';
import { PERMISSIONS } from '@gearup/types';
import { z } from 'zod';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = requirePermission(PERMISSIONS.WORKERS_MANAGE);
    const body = z.object({
      leaveType: z.string().min(1), startDate: z.string(), endDate: z.string(), reason: z.string().optional(),
    }).parse(await req.json());
    const leave = await prisma.workerLeave.create({
      data: { workerId: params.id, leaveType: body.leaveType, startDate: new Date(body.startDate), endDate: new Date(body.endDate), reason: body.reason },
    });
    logActivity({ entityType: 'WorkerLeave', entityId: leave.id, action: 'worker.leave.created', newValue: body, actorType: 'ADMIN', actorId: user.sub });
    return NextResponse.json({ success: true, data: leave }, { status: 201 });
  } catch (e) { return handleApiError(e); }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = requirePermission(PERMISSIONS.WORKERS_MANAGE);
    const body = z.object({ leaveId: z.string(), status: z.enum(['APPROVED', 'REJECTED']) }).parse(await req.json());
    const leave = await prisma.workerLeave.update({ where: { id: body.leaveId, workerId: params.id }, data: { status: body.status, approvedByAdminId: user.sub } });
    if (body.status === 'APPROVED') await prisma.worker.update({ where: { id: params.id }, data: { status: 'ON_LEAVE' } });
    logActivity({ entityType: 'WorkerLeave', entityId: body.leaveId, action: `worker.leave.${body.status.toLowerCase()}`, newValue: body, actorType: 'ADMIN', actorId: user.sub });
    return NextResponse.json({ success: true, data: leave });
  } catch (e) { return handleApiError(e); }
}
