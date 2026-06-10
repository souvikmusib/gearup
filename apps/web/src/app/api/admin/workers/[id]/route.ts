import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/auth';
import { AppError, handleApiError } from '@/lib/errors';
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
      status: z.enum(['ACTIVE', 'INACTIVE', 'ON_LEAVE']).optional(), notes: z.string().nullable().optional(), monthlySalary: z.number().nullable().optional(),
    }).parse(await req.json());

    if (body.status === 'INACTIVE') {
      const openAssignments = await prisma.workerAssignment.count({
        where: {
          workerId: params.id,
          jobCard: { status: { notIn: ['DELIVERED', 'CANCELLED', 'CLOSED'] } },
        },
      });
      if (openAssignments > 0) {
        throw new AppError(
          409,
          `Cannot set worker INACTIVE: ${openAssignments} open job-card assignment(s) still active. Reassign or close those jobs first.`,
          'WORKER_HAS_OPEN_ASSIGNMENTS',
        );
      }
    }

    const data: Record<string, unknown> = {};
    if (body.fullName !== undefined) data.fullName = body.fullName;
    if (body.phoneNumber !== undefined) data.phoneNumber = body.phoneNumber;
    if (body.email !== undefined) data.email = body.email;
    if (body.designation !== undefined) data.designation = body.designation;
    if (body.specialization !== undefined) data.specialization = body.specialization;
    if (body.employmentType !== undefined) data.employmentType = body.employmentType;
    if (body.shiftStart !== undefined) data.shiftStart = body.shiftStart;
    if (body.shiftEnd !== undefined) data.shiftEnd = body.shiftEnd;
    if (body.dailyCapacity !== undefined) data.dailyCapacity = body.dailyCapacity;
    if (body.emergencyContactName !== undefined) data.emergencyContactName = body.emergencyContactName;
    if (body.emergencyContactPhone !== undefined) data.emergencyContactPhone = body.emergencyContactPhone;
    if (body.address !== undefined) data.address = body.address;
    if (body.status !== undefined) data.status = body.status;
    if (body.notes !== undefined) data.notes = body.notes;
    if (body.monthlySalary !== undefined) data.monthlySalary = body.monthlySalary;

    const worker = await prisma.worker.update({ where: { id: params.id }, data });
    logActivity({ entityType: 'Worker', entityId: worker.id, action: 'worker.updated', newValue: body, actorType: 'ADMIN', actorId: user.sub });
    return NextResponse.json({ success: true, data: worker });
  } catch (e) { return handleApiError(e); }
}
