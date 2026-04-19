import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { paginate, paginationMeta } from '@/lib/pagination';
import { requirePermission } from '@/lib/auth';
import { handleApiError } from '@/lib/errors';
import { logActivity } from '@/lib/activity-logger';
import { generateAppointmentRef } from '@/lib/id-generators';
import { PERMISSIONS } from '@gearup/types';
import { z } from 'zod';

const createSchema = z.object({
  serviceRequestId: z.string().optional(), customerId: z.string(), vehicleId: z.string(),
  appointmentDate: z.string(), slotStart: z.string(), slotEnd: z.string(),
  bookingSource: z.string().default('ADMIN'), assignedWorkerId: z.string().optional(), bayId: z.string().optional(),
});

export async function GET(req: NextRequest) {
  try {
    requirePermission(PERMISSIONS.APPOINTMENTS_VIEW);
    const sp = req.nextUrl.searchParams;
    const page = Number(sp.get('page')) || 1;
    const pageSize = Number(sp.get('pageSize')) || 20;
    const status = sp.get('status') || '';
    const date = sp.get('date') || '';
    const p = paginate({ page, pageSize });
    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (date) where.appointmentDate = new Date(date);
    const [data, total] = await Promise.all([
      prisma.appointment.findMany({ where, ...p, orderBy: { appointmentDate: 'asc' }, include: { customer: { select: { fullName: true, phoneNumber: true } }, vehicle: { select: { registrationNumber: true, brand: true, model: true } }, worker: { select: { fullName: true } } } }),
      prisma.appointment.count({ where }),
    ]);
    return NextResponse.json({ success: true, data, meta: paginationMeta(total, page, pageSize) });
  } catch (e) { return handleApiError(e); }
}

export async function POST(req: NextRequest) {
  try {
    const user = requirePermission(PERMISSIONS.APPOINTMENTS_CONFIRM);
    const body = createSchema.parse(await req.json());
    const appt = await prisma.appointment.create({
      data: { referenceId: generateAppointmentRef(), ...body, appointmentDate: new Date(body.appointmentDate), slotStart: new Date(body.slotStart), slotEnd: new Date(body.slotEnd), status: 'CONFIRMED', confirmedByAdminId: user.sub } as any,
    });
    logActivity({ entityType: 'Appointment', entityId: appt.id, action: 'appointment.created', newValue: appt, actorType: 'ADMIN', actorId: user.sub });
    return NextResponse.json({ success: true, data: appt }, { status: 201 });
  } catch (e) { return handleApiError(e); }
}
