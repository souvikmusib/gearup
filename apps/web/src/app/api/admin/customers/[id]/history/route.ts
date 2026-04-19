import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/auth';
import { handleApiError } from '@/lib/errors';
import { PERMISSIONS } from '@gearup/types';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    requirePermission(PERMISSIONS.CUSTOMERS_VIEW);
    const logs = await prisma.activityLog.findMany({ where: { entityType: 'Customer', entityId: params.id }, orderBy: { createdAt: 'desc' }, take: 50 });
    return NextResponse.json({ success: true, data: logs });
  } catch (e) { return handleApiError(e); }
}
