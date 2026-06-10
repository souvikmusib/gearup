import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { paginate, paginationMeta } from '@/lib/pagination';
import { requirePermission } from '@/lib/auth';
import { handleApiError } from '@/lib/errors';
import { PERMISSIONS } from '@gearup/types';
import { z } from 'zod';

const ACTOR_TYPES = ['ADMIN', 'WORKER', 'SYSTEM', 'PUBLIC'] as const;
const actorTypeSchema = z.enum(ACTOR_TYPES).optional();

// Whitelist of entityType values the audit log can be filtered by. Keeping this
// explicit prevents the API from being used to fish for arbitrary entityType
// strings injected via clients or scripts.
const ENTITY_TYPES = [
  'Appointment', 'AdminUser', 'AmcContract', 'BusinessHour', 'Customer',
  'Expense', 'ExpenseCategory', 'Holiday', 'Invoice', 'InventoryItem',
  'JobCard', 'NotificationTemplate', 'Role', 'ServiceRequest', 'Vehicle',
  'Worker', 'WorkerShift',
] as const;
const entityTypeSchema = z.enum(ENTITY_TYPES).optional();

export async function GET(req: NextRequest) {
  try {
    requirePermission(PERMISSIONS.LOGS_VIEW);
    const sp = req.nextUrl.searchParams;
    const page = Number(sp.get('page')) || 1;
    const pageSize = Number(sp.get('pageSize')) || 50;
    const p = paginate({ page, pageSize });
    const where: Record<string, unknown> = {};
    const entityType = entityTypeSchema.parse(sp.get('entityType') || undefined);
    if (entityType) where.entityType = entityType;
    const actorType = actorTypeSchema.parse(sp.get('actorType') || undefined);
    if (actorType) where.actorType = actorType;
    const action = sp.get('action'); if (action && action.length >= 2 && action.length <= 64) where.action = { contains: action };
    const from = sp.get('from'); const to = sp.get('to');
    if (from || to) {
      const createdAt: Record<string, Date> = {};
      if (from) createdAt.gte = new Date(from);
      if (to) { const d = new Date(to); d.setHours(23, 59, 59, 999); createdAt.lte = d; }
      where.createdAt = createdAt;
    }
    const [data, total] = await Promise.all([
      prisma.activityLog.findMany({ where, ...p, orderBy: { createdAt: 'desc' }, include: { adminUser: { select: { fullName: true, adminUserId: true } } } }),
      prisma.activityLog.count({ where }),
    ]);
    return NextResponse.json({ success: true, data, meta: paginationMeta(total, page, pageSize) });
  } catch (e) { return handleApiError(e); }
}
