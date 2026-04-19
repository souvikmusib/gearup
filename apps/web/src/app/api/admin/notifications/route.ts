import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { paginate, paginationMeta } from '@/lib/pagination';
import { requirePermission } from '@/lib/auth';
import { handleApiError } from '@/lib/errors';
import { PERMISSIONS } from '@gearup/types';

export async function GET(req: NextRequest) {
  try {
    requirePermission(PERMISSIONS.NOTIFICATIONS_VIEW);
    const sp = req.nextUrl.searchParams;
    const page = Number(sp.get('page')) || 1;
    const pageSize = Number(sp.get('pageSize')) || 20;
    const p = paginate({ page, pageSize });
    const where: Record<string, unknown> = {};
    const channel = sp.get('channel'); if (channel) where.channel = channel;
    const eventType = sp.get('eventType'); if (eventType) where.eventType = eventType;
    const sendStatus = sp.get('sendStatus'); if (sendStatus) where.sendStatus = sendStatus;
    const [data, total] = await Promise.all([prisma.notification.findMany({ where, ...p, orderBy: { createdAt: 'desc' } }), prisma.notification.count({ where })]);
    return NextResponse.json({ success: true, data, meta: paginationMeta(total, page, pageSize) });
  } catch (e) { return handleApiError(e); }
}
