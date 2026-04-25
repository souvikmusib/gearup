import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/auth';
import { handleApiError } from '@/lib/errors';
import { PERMISSIONS } from '@gearup/types';

export async function GET() {
  try {
    requirePermission(PERMISSIONS.REPORTS_VIEW);
    const stats = await prisma.appointment.groupBy({ by: ['status'], _count: true });
    const total = await prisma.appointment.count();
    return NextResponse.json({ success: true, data: { byStatus: stats.map((s) => ({ status: s.status, _count: s._count })), total } });
  } catch (e) { return handleApiError(e); }
}
