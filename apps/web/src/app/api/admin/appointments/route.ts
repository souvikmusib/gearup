import { istDayStart } from '@/lib/time';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { paginate, paginationMeta } from '@/lib/pagination';
import { requirePermission } from '@/lib/auth';
import { AppError, handleApiError } from '@/lib/errors';
import { logActivity } from '@/lib/activity-logger';
import { generateAppointmentRef } from '@/lib/id-generators';
import { PERMISSIONS } from '@gearup/types';
import { z } from 'zod';

const isoDate = z.string().refine((v) => !Number.isNaN(new Date(v).getTime()), {
  message: 'Invalid date string',
});

const createSchema = z.object({
  serviceRequestId: z.string().optional(), customerId: z.string(), vehicleId: z.string(),
  appointmentDate: isoDate, slotStart: isoDate, slotEnd: isoDate,
  bookingSource: z.string().default('ADMIN'), assignedWorkerId: z.string().optional(), bayId: z.string().optional(),
}).refine((d) => new Date(d.slotEnd).getTime() > new Date(d.slotStart).getTime(), {
  message: 'slotEnd must be after slotStart',
  path: ['slotEnd'],
});

function startOfDay(d: Date): Date {

  return istDayStart(d);
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export async function GET(req: NextRequest) {
  try {
    requirePermission(PERMISSIONS.APPOINTMENTS_VIEW);
    const sp = req.nextUrl.searchParams;
    const page = Number(sp.get('page')) || 1;
    const pageSize = Number(sp.get('pageSize')) || 20;
    const status = sp.get('status') || '';
    const date = sp.get('date') || '';
    const search = sp.get('search') || '';
    const p = paginate({ page, pageSize });
    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (date) {
      const d = startOfDay(new Date(date));
      where.appointmentDate = { gte: d, lt: addDays(d, 1) };
    }
    if (search) where.OR = [{ referenceId: { contains: search, mode: 'insensitive' } }, { customer: { fullName: { contains: search, mode: 'insensitive' } } }];
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
    const appointmentDate = new Date(body.appointmentDate);
    const slotStart = new Date(body.slotStart);
    const slotEnd = new Date(body.slotEnd);
    if (!(slotEnd > slotStart)) {
      throw new AppError( 400, 'slotEnd must be after slotStart','VALIDATION_ERROR');
    }

    const appt = await prisma.$transaction(async (tx) => {
      // (a) Overlap on same worker
      if (body.assignedWorkerId) {
        const overlap = await tx.appointment.findFirst({
          where: {
            assignedWorkerId: body.assignedWorkerId,
            status: { notIn: ['CANCELLED', 'NO_SHOW'] },
            slotStart: { lt: slotEnd },
            slotEnd: { gt: slotStart },
          },
          select: { id: true, referenceId: true },
        });
        if (overlap) {
          throw new AppError( 409, `Worker already booked for an overlapping slot (${overlap.referenceId})`,'CONFLICT');
        }

        // (b) Approved leave overlap for worker (date-range only; partial-day windows checked coarsely)
        const leave = await tx.workerLeave.findFirst({
          where: {
            workerId: body.assignedWorkerId,
            status: 'APPROVED',
            startDate: { lte: slotEnd },
            endDate: { gte: slotStart },
          },
          select: { id: true },
        });
        if (leave) {
          throw new AppError( 409, 'Assigned worker is on approved leave during this slot','CONFLICT');
        }
      }

      // (a2) Overlap on same bay
      if (body.bayId) {
        const bayOverlap = await tx.appointment.findFirst({
          where: {
            bayId: body.bayId,
            status: { notIn: ['CANCELLED', 'NO_SHOW'] },
            slotStart: { lt: slotEnd },
            slotEnd: { gt: slotStart },
          },
          select: { id: true, referenceId: true },
        });
        if (bayOverlap) {
          throw new AppError( 409, `Bay already booked for an overlapping slot (${bayOverlap.referenceId})`,'CONFLICT');
        }
      }

      // (c) Capacity check via AppointmentSlotRule for the weekday
      const dayOfWeek = slotStart.getDay();
      const rule = await tx.appointmentSlotRule.findFirst({
        where: { dayOfWeek, isActive: true },
        select: { maxCapacity: true },
      });
      if (rule && rule.maxCapacity > 0) {
        const concurrent = await tx.appointment.count({
          where: {
            status: { notIn: ['CANCELLED', 'NO_SHOW'] },
            slotStart: { lt: slotEnd },
            slotEnd: { gt: slotStart },
          },
        });
        if (concurrent >= rule.maxCapacity) {
          throw new AppError( 409, 'Slot capacity reached for this time window','CONFLICT');
        }
      }

      return tx.appointment.create({
        data: {
          referenceId: generateAppointmentRef(),
          serviceRequestId: body.serviceRequestId,
          customerId: body.customerId,
          vehicleId: body.vehicleId,
          appointmentDate,
          slotStart,
          slotEnd,
          bookingSource: body.bookingSource,
          assignedWorkerId: body.assignedWorkerId,
          bayId: body.bayId,
          status: 'CONFIRMED',
          confirmedByAdminId: user.sub,
        },
      });
    });

    logActivity({ entityType: 'Appointment', entityId: appt.id, action: 'appointment.created', newValue: appt, actorType: 'ADMIN', actorId: user.sub });
    return NextResponse.json({ success: true, data: appt }, { status: 201 });
  } catch (e) { return handleApiError(e); }
}
