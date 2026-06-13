import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { NotificationChannel, NotificationStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { paginate, paginationMeta } from '@/lib/pagination';
import { requirePermission } from '@/lib/auth';
import { handleApiError } from '@/lib/errors';
import { PERMISSIONS } from '@gearup/types';

const querySchema = z.object({
  channel: z.nativeEnum(NotificationChannel).optional(),
  eventType: z.string().max(64).optional(),
  q: z.string().trim().max(100).optional(),
  sendStatus: z.nativeEnum(NotificationStatus).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(20),
});

export async function GET(req: NextRequest) {
  try {
    requirePermission(PERMISSIONS.NOTIFICATIONS_VIEW);
    const sp = req.nextUrl.searchParams;
    const parsed = querySchema.parse(Object.fromEntries(sp));
    const { page, pageSize, channel, eventType, q, sendStatus } = parsed;
    const p = paginate({ page, pageSize });
    const where: Record<string, unknown> = {};
    if (channel) where.channel = channel;
    if (eventType) where.eventType = eventType;
    if (sendStatus) where.sendStatus = sendStatus;
    if (q) {
      where.OR = [
        { eventType: { contains: q, mode: 'insensitive' } },
        { recipientPhone: { contains: q, mode: 'insensitive' } },
        { recipientEmail: { contains: q, mode: 'insensitive' } },
        { providerMessageId: { contains: q, mode: 'insensitive' } },
      ];
    }
    const [data, total] = await Promise.all([prisma.notification.findMany({ where, ...p, orderBy: { createdAt: 'desc' } }), prisma.notification.count({ where })]);
    return NextResponse.json({ success: true, data, meta: paginationMeta(total, page, pageSize) });
  } catch (e) { return handleApiError(e); }
}
