import { istDayEnd } from '@/lib/time';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/auth';
import { handleApiError } from '@/lib/errors';
import { PERMISSIONS } from '@gearup/types';

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  if (s.includes('"') || s.includes(',') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function GET(req: NextRequest) {
  try {
    requirePermission(PERMISSIONS.LOGS_VIEW);
    const sp = req.nextUrl.searchParams;
    const where: Record<string, unknown> = {};
    const entityType = sp.get('entityType'); if (entityType) where.entityType = entityType;
    const actorType = sp.get('actorType'); if (actorType) where.actorType = actorType;
    const action = sp.get('action'); if (action && action.length >= 2) where.action = { contains: action };
    const from = sp.get('from'); const to = sp.get('to');
    if (from || to) {
      const createdAt: Record<string, Date> = {};
      if (from) createdAt.gte = new Date(from);
      if (to) { createdAt.lte = istDayEnd(new Date(to)); }
      where.createdAt = createdAt;
    }
    const rows = await prisma.activityLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 10000,
      include: { adminUser: { select: { fullName: true, adminUserId: true } } },
    });
    const header = ['createdAt', 'actorType', 'actor', 'entityType', 'entityId', 'action', 'previousValueJson', 'newValueJson'];
    const lines = [header.join(',')];
    for (const r of rows) {
      lines.push([
        r.createdAt.toISOString(),
        r.actorType,
        (r as { adminUser?: { fullName?: string } }).adminUser?.fullName ?? r.actorId ?? '',
        r.entityType,
        r.entityId ?? '',
        r.action,
        r.previousValueJson,
        r.newValueJson,
      ].map(csvEscape).join(','));
    }
    const body = lines.join('\n');
    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="activity-logs-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  } catch (e) { return handleApiError(e); }
}
