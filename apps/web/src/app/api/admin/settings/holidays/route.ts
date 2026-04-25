import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/auth';
import { handleApiError } from '@/lib/errors';
import { logActivity } from '@/lib/activity-logger';
import { PERMISSIONS } from '@gearup/types';
import { z } from 'zod';

export async function GET() {
  try {
    requirePermission(PERMISSIONS.SETTINGS_MANAGE);
    const data = await prisma.holiday.findMany({ orderBy: { holidayDate: 'asc' } });
    return NextResponse.json({ success: true, data });
  } catch (e) { return handleApiError(e); }
}

export async function POST(req: NextRequest) {
  try {
    const user = requirePermission(PERMISSIONS.SETTINGS_MANAGE);
    const body = z.object({
      holidayName: z.string().min(1), holidayDate: z.string(), holidayType: z.enum(['PUBLIC_HOLIDAY', 'WEEKLY_OFF', 'BUSINESS_CLOSURE', 'MAINTENANCE_SHUTDOWN', 'CUSTOM_BLOCK']),
      isFullDay: z.boolean().default(true), startTime: z.string().optional(), endTime: z.string().optional(), notes: z.string().optional(),
    }).parse(await req.json());
    const holiday = await prisma.holiday.create({ data: { ...body, holidayDate: new Date(body.holidayDate) } });
    logActivity({ entityType: 'Holiday', entityId: holiday.id, action: 'holiday.created', newValue: body, actorType: 'ADMIN', actorId: user.sub });
    return NextResponse.json({ success: true, data: holiday }, { status: 201 });
  } catch (e) { return handleApiError(e); }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = requirePermission(PERMISSIONS.SETTINGS_MANAGE);
    const id = req.nextUrl.searchParams.get('id');
    if (!id) return NextResponse.json({ success: false, error: { message: 'id required' } }, { status: 400 });
    await prisma.holiday.delete({ where: { id } });
    logActivity({ entityType: 'Holiday', entityId: id, action: 'holiday.deleted', actorType: 'ADMIN', actorId: user.sub });
    return NextResponse.json({ success: true });
  } catch (e) { return handleApiError(e); }
}
