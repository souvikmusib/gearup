import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/auth';
import { AppError, handleApiError } from '@/lib/errors';
import { logActivity } from '@/lib/activity-logger';
import { PERMISSIONS } from '@gearup/types';
import { z } from 'zod';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = requirePermission(PERMISSIONS.WORKERS_MANAGE);
    const body = z.object({
      leaveType: z.string().min(1), startDate: z.string(), endDate: z.string(), reason: z.string().optional(),
    }).parse(await req.json());
    const startDate = new Date(body.startDate);
    const endDate = new Date(body.endDate);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      throw new AppError(400, 'Invalid startDate or endDate', 'INVALID_DATE');
    }
    if (endDate < startDate) {
      throw new AppError(400, 'endDate must be on or after startDate', 'INVALID_DATE_RANGE');
    }
    // Normalize end to end-of-day for overlap checks so same-day ranges count.
    const { istDayEnd } = require('@/lib/time');
    const endOfDay = istDayEnd(new Date(endDate));
    // Refuse overlap with any PENDING/APPROVED leave for this worker.
    const overlap = await prisma.workerLeave.findFirst({
      where: {
        workerId: params.id,
        status: { in: ['PENDING', 'APPROVED'] },
        startDate: { lte: endOfDay },
        endDate: { gte: startDate },
      },
      select: { id: true, startDate: true, endDate: true, status: true },
    });
    if (overlap) {
      throw new AppError(409, 'Leave overlaps with an existing pending or approved leave', 'LEAVE_OVERLAP');
    }
    // Warn if appointments are already assigned to this worker in the window.
    const conflictingAppointments = await prisma.appointment.count({
      where: {
        assignedWorkerId: params.id,
        status: { notIn: ['CANCELLED', 'COMPLETED'] },
        slotStart: { lte: endOfDay },
        slotEnd: { gte: startDate },
      },
    });
    const leave = await prisma.workerLeave.create({
      data: { workerId: params.id, leaveType: body.leaveType, startDate, endDate, reason: body.reason },
    });
    logActivity({ entityType: 'WorkerLeave', entityId: leave.id, action: 'worker.leave.created', newValue: body, actorType: 'ADMIN', actorId: user.sub });
    return NextResponse.json({ success: true, data: leave, warnings: conflictingAppointments > 0 ? [`${conflictingAppointments} appointment(s) already assigned to this worker in the leave window`] : [] }, { status: 201 });
  } catch (e) { return handleApiError(e); }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = requirePermission(PERMISSIONS.WORKERS_MANAGE);
    const body = z.object({ leaveId: z.string(), status: z.enum(['APPROVED', 'REJECTED']) }).parse(await req.json());
    const leave = await prisma.workerLeave.update({ where: { id: body.leaveId, workerId: params.id }, data: { status: body.status, approvedByAdminId: user.sub } });
    if (body.status === 'APPROVED') {
      // Only flip worker to ON_LEAVE if today falls within the approved leave window.
      // Workers outside the window remain ACTIVE; a separate scheduled job (or dynamic
      // computation) is responsible for flipping status when the window opens/closes.
      const now = new Date();
      const start = new Date(leave.startDate);
      const end = new Date(leave.endDate);
      // Normalize end to end-of-day so a same-day leave (start==end) still counts as active today.
      const { istDayEnd: istEnd } = require('@/lib/time');
      const endNorm = istEnd(end);
      if (now >= start && now <= endNorm) {
        await prisma.worker.update({ where: { id: params.id }, data: { status: 'ON_LEAVE' } });
      }
    }
    logActivity({ entityType: 'WorkerLeave', entityId: body.leaveId, action: `worker.leave.${body.status.toLowerCase()}`, newValue: body, actorType: 'ADMIN', actorId: user.sub });
    return NextResponse.json({ success: true, data: leave });
  } catch (e) { return handleApiError(e); }
}
