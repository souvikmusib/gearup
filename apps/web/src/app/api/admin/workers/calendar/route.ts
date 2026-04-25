import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/auth';
import { handleApiError } from '@/lib/errors';
import { PERMISSIONS } from '@gearup/types';

export async function GET() {
  try {
    requirePermission(PERMISSIONS.WORKERS_MANAGE);
    const [workers, leaves, assignments] = await Promise.all([
      prisma.worker.findMany({ where: { status: { not: 'INACTIVE' } }, select: { id: true, fullName: true, shiftStart: true, shiftEnd: true, status: true }, orderBy: { fullName: 'asc' } }),
      prisma.workerLeave.findMany({ where: { status: { in: ['APPROVED', 'PENDING'] } }, select: { id: true, workerId: true, leaveType: true, startDate: true, endDate: true, status: true } }),
      prisma.workerAssignment.findMany({ include: { worker: { select: { fullName: true } }, jobCard: { select: { jobCardNumber: true, status: true, intakeDate: true, estimatedDeliveryAt: true } } }, orderBy: { assignedAt: 'desc' }, take: 200 }),
    ]);
    return NextResponse.json({ success: true, data: { workers, leaves, assignments } });
  } catch (e) { return handleApiError(e); }
}
