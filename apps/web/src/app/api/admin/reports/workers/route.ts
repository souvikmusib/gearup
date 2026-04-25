import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/auth';
import { handleApiError } from '@/lib/errors';
import { PERMISSIONS } from '@gearup/types';

export async function GET() {
  try {
    requirePermission(PERMISSIONS.REPORTS_VIEW);
    const workers = await prisma.worker.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, fullName: true, designation: true, _count: { select: { assignments: true, tasks: true } } },
      orderBy: { fullName: 'asc' },
    });
    return NextResponse.json({ success: true, data: workers.map((w) => ({ id: w.id, fullName: w.fullName, designation: w.designation, activeAssignments: w._count.assignments, totalTasks: w._count.tasks })) });
  } catch (e) { return handleApiError(e); }
}
