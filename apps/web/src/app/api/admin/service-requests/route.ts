import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { paginate, paginationMeta } from '@/lib/pagination';
import { requirePermission } from '@/lib/auth';
import { handleApiError } from '@/lib/errors';
import { logActivity } from '@/lib/activity-logger';
import { PERMISSIONS } from '@gearup/types';
import { z } from 'zod';

export async function GET(req: NextRequest) {
  try {
    requirePermission(PERMISSIONS.SERVICE_REQUESTS_VIEW);
    const sp = req.nextUrl.searchParams;
    const page = Number(sp.get('page')) || 1;
    const pageSize = Number(sp.get('pageSize')) || 20;
    const status = sp.get('status') || '';
    const search = sp.get('search') || '';
    const p = paginate({ page, pageSize });
    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (search) where.OR = [{ referenceId: { contains: search, mode: 'insensitive' } }, { customer: { fullName: { contains: search, mode: 'insensitive' } } }];
    const [data, total] = await Promise.all([
      prisma.serviceRequest.findMany({ where, ...p, orderBy: { createdAt: 'desc' }, include: { customer: { select: { fullName: true, phoneNumber: true } }, vehicle: { select: { registrationNumber: true, brand: true, model: true } } } }),
      prisma.serviceRequest.count({ where }),
    ]);
    return NextResponse.json({ success: true, data, meta: paginationMeta(total, page, pageSize) });
  } catch (e) { return handleApiError(e); }
}
