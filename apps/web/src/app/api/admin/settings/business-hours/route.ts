import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/auth';
import { handleApiError } from '@/lib/errors';
import { PERMISSIONS } from '@gearup/types';

export async function GET() {
  try {
    requirePermission(PERMISSIONS.SETTINGS_VIEW);
    const rules = await prisma.appointmentSlotRule.findMany({
      where: { isActive: true },
      orderBy: [{ dayOfWeek: 'asc' }, { openTime: 'asc' }],
    });
    return NextResponse.json({ success: true, data: { rules } });
  } catch (e) {
    return handleApiError(e);
  }
}
