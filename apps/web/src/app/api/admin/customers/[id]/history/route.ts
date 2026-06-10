import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/auth';
import { handleApiError } from '@/lib/errors';
import { PERMISSIONS } from '@gearup/types';
import { paginate, paginationMeta } from '@/lib/pagination';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    requirePermission(PERMISSIONS.CUSTOMERS_VIEW);
    // Heavy customers (years of edits) can have thousands of activity rows; the
    // previous hard `take: 50` silently truncated history. Honor standard
    // page/pageSize query params and return paginationMeta so the UI can scroll
    // back through the full audit trail.
    // Index hint: ActivityLog should have a composite index on
    // (entityType, entityId, createdAt DESC) for this query to stay fast.
    const url = new URL(req.url);
    const page = Math.max(1, Number(url.searchParams.get('page') ?? '1') || 1);
    const pageSize = Math.max(1, Number(url.searchParams.get('pageSize') ?? '50') || 50);
    const { skip, take } = paginate({ page, pageSize });
    const where = { entityType: 'Customer', entityId: params.id } as const;
    const [logs, total] = await Promise.all([
      prisma.activityLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
      prisma.activityLog.count({ where }),
    ]);
    return NextResponse.json({ success: true, data: logs, pagination: paginationMeta(total, page, take) });
  } catch (e) { return handleApiError(e); }
}
