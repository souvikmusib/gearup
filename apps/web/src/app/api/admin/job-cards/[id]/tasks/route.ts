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
    const body = z.object({
      taskName: z.string().min(1), taskDescription: z.string().optional(),
      assignedWorkerId: z.string().optional(), estimatedMinutes: z.number().optional(),
    }).parse(await req.json());
    const count = await prisma.jobCardTask.count({ where: { jobCardId: params.id } });
    const task = await prisma.jobCardTask.create({
      data: { jobCardId: params.id, ...body, status: 'PENDING', sortOrder: count },
      include: { assignedWorker: true },
    });
    logActivity({ entityType: 'JobCardTask', entityId: task.id, action: 'job-card.task.added', newValue: { jobCardId: params.id, ...body }, actorType: 'ADMIN', actorId: user.sub });
    return NextResponse.json({ success: true, data: task }, { status: 201 });
  } catch (e) { return handleApiError(e); }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = requirePermission(PERMISSIONS.JOB_CARDS_CREATE);
    const body = z.object({
      taskId: z.string(), status: z.string().optional(), taskName: z.string().optional(),
      assignedWorkerId: z.string().nullable().optional(), actualMinutes: z.number().optional(),
    }).parse(await req.json());
    const { taskId, ...data } = body;
    const task = await prisma.jobCardTask.update({ where: { id: taskId, jobCardId: params.id }, data, include: { assignedWorker: true } });
    logActivity({ entityType: 'JobCardTask', entityId: taskId, action: 'job-card.task.updated', newValue: body, actorType: 'ADMIN', actorId: user.sub });
    return NextResponse.json({ success: true, data: task });
  } catch (e) { return handleApiError(e); }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = requirePermission(PERMISSIONS.JOB_CARDS_CREATE);
    const taskId = req.nextUrl.searchParams.get('taskId');
    if (!taskId) return NextResponse.json({ success: false, error: { message: 'taskId is required' } }, { status: 400 });
    await prisma.jobCardTask.delete({ where: { id: taskId, jobCardId: params.id } });
    logActivity({ entityType: 'JobCardTask', entityId: taskId, action: 'job-card.task.removed', newValue: { jobCardId: params.id, taskId }, actorType: 'ADMIN', actorId: user.sub });
    return NextResponse.json({ success: true });
  } catch (e) { return handleApiError(e); }
}
