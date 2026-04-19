import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { paginate, paginationMeta } from '@/lib/pagination';
import { requirePermission } from '@/lib/auth';
import { handleApiError } from '@/lib/errors';
import { PERMISSIONS } from '@gearup/types';

export async function GET(req: NextRequest) {
  try {
    requirePermission(PERMISSIONS.LOGS_VIEW);
    const sp = req.nextUrl.searchParams;
    const page = Number(sp.get('page')) || 1;
    const pageSize = Number(sp.get('pageSize')) || 50;
    const p = paginate({ page, pageSize });
    const where: Record<string, unknown> = {};
    const entityType = sp.get('entityType'); if (entityType) where.entityType = entityType;
    const actorType = sp.get('actorType'); if (actorType) where.actorType = actorType;
    const action = sp.get('action'); if (action) where.action = { contains: action };
    const [data, total] = await Promise.all([
      prisma.activityLog.findMany({ where, ...p, orderBy: { createdAt: 'desc' }, include: { adminUser: { select: { fullName: true, adminUserId: true } } } }),
      prisma.activityLog.count({ where }),
    ]);
    return NextResponse.json({ success: true, data, meta: paginationMeta(total, page, pageSize) });
  } catch (e) { return handleApiError(e); }
}
