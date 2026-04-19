import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/auth';
import { handleApiError } from '@/lib/errors';
import { logActivity } from '@/lib/activity-logger';
import { PERMISSIONS } from '@gearup/types';
import { z } from 'zod';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    requirePermission(PERMISSIONS.APPOINTMENTS_VIEW);
    const appt = await prisma.appointment.findUniqueOrThrow({ where: { id: params.id }, include: { customer: true, vehicle: true, serviceRequest: true, worker: true, confirmedBy: { select: { fullName: true } } } });
    return NextResponse.json({ success: true, data: appt });
  } catch (e) { return handleApiError(e); }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = requirePermission(PERMISSIONS.APPOINTMENTS_CONFIRM);
    const body = z.object({ status: z.string().optional(), appointmentDate: z.string().optional(), slotStart: z.string().optional(), slotEnd: z.string().optional(), rescheduleReason: z.string().optional(), cancellationReason: z.string().optional(), assignedWorkerId: z.string().optional() }).parse(await req.json());
    const data: Record<string, unknown> = { ...body };
    if (body.appointmentDate) data.appointmentDate = new Date(body.appointmentDate);
    if (body.slotStart) data.slotStart = new Date(body.slotStart);
    if (body.slotEnd) data.slotEnd = new Date(body.slotEnd);
    const appt = await prisma.appointment.update({ where: { id: params.id }, data });
    logActivity({ entityType: 'Appointment', entityId: appt.id, action: 'appointment.updated', newValue: body, actorType: 'ADMIN', actorId: user.sub });
    return NextResponse.json({ success: true, data: appt });
  } catch (e) { return handleApiError(e); }
}
