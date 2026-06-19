import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/auth';
import { AppError, handleApiError } from '@/lib/errors';
import { logActivity } from '@/lib/activity-logger';
import { PERMISSIONS } from '@gearup/types';
import { AppointmentStatus } from '@prisma/client';
import { z } from 'zod';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    requirePermission(PERMISSIONS.APPOINTMENTS_VIEW);
    const appt = await prisma.appointment.findUniqueOrThrow({ where: { id: params.id }, include: { customer: true, vehicle: true, serviceRequest: true, worker: true, confirmedBy: { select: { fullName: true } } } });
    return NextResponse.json({ success: true, data: appt });
  } catch (e) { return handleApiError(e); }
}

const ALLOWED_TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
  REQUESTED: ['PENDING_REVIEW', 'CONFIRMED', 'CANCELLED', 'RESCHEDULED'],
  PENDING_REVIEW: ['CONFIRMED', 'CANCELLED', 'RESCHEDULED'],
  CONFIRMED: ['RESCHEDULED', 'CANCELLED', 'CHECKED_IN', 'NO_SHOW'],
  RESCHEDULED: ['CONFIRMED', 'CANCELLED', 'CHECKED_IN', 'NO_SHOW'],
  CHECKED_IN: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
};

const patchSchema = z.object({
  status: z.preprocess(v => v === '' ? undefined : v, z.nativeEnum(AppointmentStatus).optional()),
  appointmentDate: z.string().optional(),
  slotStart: z.string().optional(),
  slotEnd: z.string().optional(),
  rescheduleReason: z.string().optional(),
  cancellationReason: z.string().optional(),
  assignedWorkerId: z.string().nullable().optional(),
}).refine(
  (v) => v.status !== 'CANCELLED' || (typeof v.cancellationReason === 'string' && v.cancellationReason.trim().length > 0),
  { message: 'cancellationReason is required when status is CANCELLED', path: ['cancellationReason'] },
).refine(
  (v) => v.status !== 'RESCHEDULED' || (!!v.slotStart && !!v.slotEnd && typeof v.rescheduleReason === 'string' && v.rescheduleReason.trim().length > 0),
  { message: 'slotStart, slotEnd, and rescheduleReason are required when status is RESCHEDULED', path: ['rescheduleReason'] },
);

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = requirePermission(PERMISSIONS.APPOINTMENTS_CONFIRM);
    const body = patchSchema.parse(await req.json());
    if (body.status) {
      const current = await prisma.appointment.findUniqueOrThrow({ where: { id: params.id }, select: { status: true } });
      if (current.status !== body.status && !ALLOWED_TRANSITIONS[current.status].includes(body.status)) {
        throw new AppError(400, `Illegal status transition from ${current.status} to ${body.status}`, 'ILLEGAL_STATUS_TRANSITION');
      }
    }
    const data: Record<string, unknown> = { ...body };
    if (body.appointmentDate) data.appointmentDate = new Date(body.appointmentDate);
    if (body.slotStart) data.slotStart = new Date(body.slotStart);
    if (body.slotEnd) data.slotEnd = new Date(body.slotEnd);
    const appt = await prisma.appointment.update({ where: { id: params.id }, data, include: { customer: true, vehicle: true, serviceRequest: true, worker: true, confirmedBy: { select: { fullName: true } } } });
    logActivity({ entityType: 'Appointment', entityId: appt.id, action: 'appointment.updated', newValue: body, actorType: 'ADMIN', actorId: user.sub });
    return NextResponse.json({ success: true, data: appt });
  } catch (e) { return handleApiError(e); }
}
