import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/auth';
import { handleApiError } from '@/lib/errors';
import { PERMISSIONS } from '@gearup/types';

export async function GET(req: NextRequest) {
  try {
    requirePermission(PERMISSIONS.WORKERS_MANAGE);
    const { searchParams } = new URL(req.url);
    const fromParam = searchParams.get('from');
    const toParam = searchParams.get('to');

    const from = fromParam ? new Date(fromParam) : null;
    const to = toParam ? new Date(toParam) : null;
    const validFrom = from && !isNaN(from.getTime()) ? from : null;
    const validTo = to && !isNaN(to.getTime()) ? to : null;

    // Default window: last 90 days through next 90 days if no range given
    const now = new Date();
    const defaultFrom = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    const defaultTo = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
    const rangeFrom = validFrom ?? defaultFrom;
    const rangeTo = validTo ?? defaultTo;

    const assignmentsWhere = {
      OR: [
        { jobCard: { intakeDate: { gte: rangeFrom, lte: rangeTo } } },
        { jobCard: { estimatedDeliveryAt: { gte: rangeFrom, lte: rangeTo } } },
        { assignedAt: { gte: rangeFrom, lte: rangeTo } },
      ],
    };

    const leavesWhere = {
      status: { in: ['APPROVED', 'PENDING'] as ('APPROVED' | 'PENDING')[] },
      OR: [
        { startDate: { gte: rangeFrom, lte: rangeTo } },
        { endDate: { gte: rangeFrom, lte: rangeTo } },
        { AND: [{ startDate: { lte: rangeFrom } }, { endDate: { gte: rangeTo } }] },
      ],
    };

    const [workers, leaves, assignments] = await Promise.all([
      prisma.worker.findMany({ where: { status: { not: 'INACTIVE' } }, select: { id: true, fullName: true, shiftStart: true, shiftEnd: true, status: true }, orderBy: { fullName: 'asc' } }),
      prisma.workerLeave.findMany({ where: leavesWhere, select: { id: true, workerId: true, leaveType: true, startDate: true, endDate: true, status: true } }),
      prisma.workerAssignment.findMany({ where: assignmentsWhere, include: { worker: { select: { fullName: true } }, jobCard: { select: { jobCardNumber: true, status: true, intakeDate: true, estimatedDeliveryAt: true } } }, orderBy: { assignedAt: 'desc' } }),
    ]);
    return NextResponse.json({ success: true, data: { workers, leaves, assignments, range: { from: rangeFrom.toISOString(), to: rangeTo.toISOString() } } });
  } catch (e) { return handleApiError(e); }
}
