import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/auth';
import { handleApiError } from '@/lib/errors';
import { PERMISSIONS } from '@gearup/types';

export async function GET() {
  try {
    requirePermission(PERMISSIONS.REPORTS_VIEW);
    const stats = await prisma.jobCard.groupBy({ by: ['status'], _count: true });
    return NextResponse.json({ success: true, data: stats.map((s) => ({ status: s.status, _count: s._count })) });
  } catch (e) { return handleApiError(e); }
}
