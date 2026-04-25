import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/auth';
import { handleApiError } from '@/lib/errors';
import { logActivity } from '@/lib/activity-logger';
import { PERMISSIONS } from '@gearup/types';
import { z } from 'zod';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = requirePermission(PERMISSIONS.JOB_CARDS_CREATE);
    const body = z.object({ workerId: z.string(), assignmentRole: z.string().optional() }).parse(await req.json());
    const assignment = await prisma.workerAssignment.create({
      data: { jobCardId: params.id, workerId: body.workerId, assignmentRole: body.assignmentRole },
      include: { worker: true },
    });
    logActivity({ entityType: 'WorkerAssignment', entityId: assignment.id, action: 'job-card.worker.assigned', newValue: { jobCardId: params.id, ...body }, actorType: 'ADMIN', actorId: user.sub });
    return NextResponse.json({ success: true, data: assignment }, { status: 201 });
  } catch (e) { return handleApiError(e); }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = requirePermission(PERMISSIONS.JOB_CARDS_CREATE);
    const assignmentId = req.nextUrl.searchParams.get('assignmentId');
    if (!assignmentId) return NextResponse.json({ success: false, error: { message: 'assignmentId is required' } }, { status: 400 });
    await prisma.workerAssignment.delete({ where: { id: assignmentId, jobCardId: params.id } });
    logActivity({ entityType: 'WorkerAssignment', entityId: assignmentId, action: 'job-card.worker.unassigned', newValue: { jobCardId: params.id, assignmentId }, actorType: 'ADMIN', actorId: user.sub });
    return NextResponse.json({ success: true });
  } catch (e) { return handleApiError(e); }
}
