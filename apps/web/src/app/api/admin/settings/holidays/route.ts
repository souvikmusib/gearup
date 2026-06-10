import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/auth';
import { handleApiError, AppError } from '@/lib/errors';
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
      holidayName: z.string().min(1),
      holidayDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'holidayDate must be YYYY-MM-DD'),
      holidayType: z.enum(['PUBLIC_HOLIDAY', 'WEEKLY_OFF', 'BUSINESS_CLOSURE', 'MAINTENANCE_SHUTDOWN', 'CUSTOM_BLOCK']),
      isFullDay: z.boolean().default(true),
      startTime: z.string().regex(/^\d{2}:\d{2}$/, 'startTime must be HH:MM').optional(),
      endTime: z.string().regex(/^\d{2}:\d{2}$/, 'endTime must be HH:MM').optional(),
      notes: z.string().optional(),
    }).refine((d) => d.isFullDay || (d.startTime && d.endTime), {
      message: 'startTime and endTime are required when isFullDay is false',
      path: ['startTime'],
    }).refine((d) => d.isFullDay || !d.startTime || !d.endTime || d.endTime > d.startTime, {
      message: 'endTime must be after startTime',
      path: ['endTime'],
    }).parse(await req.json());
    const parsedDate = new Date(`${body.holidayDate}T00:00:00.000Z`);
    if (Number.isNaN(parsedDate.getTime())) throw new AppError(400, 'Invalid holidayDate', 'INVALID_DATE');
    const duplicate = await prisma.holiday.findFirst({ where: { holidayDate: parsedDate, holidayType: body.holidayType } });
    if (duplicate) throw new AppError(409, 'A holiday with the same date and type already exists', 'HOLIDAY_DUPLICATE');
    const holiday = await prisma.holiday.create({ data: { ...body, holidayDate: parsedDate } });
    logActivity({ entityType: 'Holiday', entityId: holiday.id, action: 'holiday.created', newValue: body, actorType: 'ADMIN', actorId: user.sub });
    return NextResponse.json({ success: true, data: holiday }, { status: 201 });
  } catch (e) { return handleApiError(e); }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = requirePermission(PERMISSIONS.SETTINGS_MANAGE);
    const id = req.nextUrl.searchParams.get('id');
    if (!id) return NextResponse.json({ success: false, error: { message: 'id required' } }, { status: 400 });
    const existing = await prisma.holiday.findUnique({ where: { id } });
    if (!existing) throw new AppError(404, 'Holiday not found', 'HOLIDAY_NOT_FOUND');
    const today = new Date(); today.setUTCHours(0, 0, 0, 0);
    if (existing.holidayDate < today) {
      throw new AppError(409, 'Past holidays cannot be deleted; appointments may have been rescheduled around them', 'HOLIDAY_IN_PAST');
    }
    await prisma.holiday.delete({ where: { id } });
    logActivity({ entityType: 'Holiday', entityId: id, action: 'holiday.deleted', actorType: 'ADMIN', actorId: user.sub });
    return NextResponse.json({ success: true });
  } catch (e) { return handleApiError(e); }
}
