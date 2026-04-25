import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/auth';
import { handleApiError } from '@/lib/errors';
import { PERMISSIONS } from '@gearup/types';

export async function GET() {
  try {
    requirePermission(PERMISSIONS.NOTIFICATIONS_VIEW);
    const templates = await prisma.notificationTemplate.findMany({
      orderBy: [{ eventType: 'asc' }, { channel: 'asc' }],
    });
    return NextResponse.json({ success: true, data: templates });
  } catch (e) {
    return handleApiError(e);
  }
}
