import { Router } from 'express';
import { asyncHandler } from '../../common/utils/async-handler';
import { prisma } from '@gearup/db';
import { paginate, paginationMeta } from '@gearup/db';
import { requirePermission } from '../../common/middleware/auth';
import { PERMISSIONS } from '@gearup/types';
import { logActivity } from '../../common/utils/activity-logger';
import { generateAppointmentRef } from '../../common/utils/id-generators';
import { z } from 'zod';

const router: Router = Router();

router.get('/', requirePermission(PERMISSIONS.APPOINTMENTS_VIEW), asyncHandler(async (req, res) => {
  const { page, pageSize, status, date } = req.query as Record<string, string>;
  const p = paginate({ page: Number(page) || 1, pageSize: Number(pageSize) || 20 });
  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  if (date) where.appointmentDate = new Date(date);
  const [data, total] = await Promise.all([
    prisma.appointment.findMany({ where, ...p, orderBy: { appointmentDate: 'asc' }, include: { customer: { select: { fullName: true, phoneNumber: true } }, vehicle: { select: { registrationNumber: true, brand: true, model: true } }, worker: { select: { fullName: true } } } }),
    prisma.appointment.count({ where }),
  ]);
  res.json({ success: true, data, meta: paginationMeta(total, Number(page) || 1, Number(pageSize) || 20) });
}));

const createSchema = z.object({
  serviceRequestId: z.string().optional(),
  customerId: z.string(),
  vehicleId: z.string(),
  appointmentDate: z.string(),
  slotStart: z.string(),
  slotEnd: z.string(),
  bookingSource: z.string().default('ADMIN'),
  assignedWorkerId: z.string().optional(),
  bayId: z.string().optional(),
});

router.post('/', requirePermission(PERMISSIONS.APPOINTMENTS_CONFIRM), asyncHandler(async (req, res) => {
  const body = createSchema.parse(req.body);
  const appt = await prisma.appointment.create({
    data: {
      referenceId: generateAppointmentRef(),
      ...body,
      appointmentDate: new Date(body.appointmentDate),
      slotStart: new Date(body.slotStart),
      slotEnd: new Date(body.slotEnd),
      status: 'CONFIRMED',
      confirmedByAdminId: req.user!.sub,
    },
  });
  await logActivity({ entityType: 'Appointment', entityId: appt.id, action: 'appointment.created', newValue: appt, actorType: 'ADMIN', actorId: req.user!.sub, requestId: req.requestId });
  res.status(201).json({ success: true, data: appt });
}));

router.get('/:id', requirePermission(PERMISSIONS.APPOINTMENTS_VIEW), asyncHandler(async (req, res) => {
  const appt = await prisma.appointment.findUniqueOrThrow({ where: { id: req.params.id }, include: { customer: true, vehicle: true, serviceRequest: true, worker: true, confirmedBy: { select: { fullName: true } } } });
  res.json({ success: true, data: appt });
}));

router.patch('/:id', requirePermission(PERMISSIONS.APPOINTMENTS_CONFIRM), asyncHandler(async (req, res) => {
  const body = createSchema.partial().parse(req.body);
  const data: Record<string, unknown> = { ...body };
  if (body.appointmentDate) data.appointmentDate = new Date(body.appointmentDate);
  if (body.slotStart) data.slotStart = new Date(body.slotStart);
  if (body.slotEnd) data.slotEnd = new Date(body.slotEnd);
  const appt = await prisma.appointment.update({ where: { id: req.params.id }, data });
  res.json({ success: true, data: appt });
}));

router.post('/:id/confirm', requirePermission(PERMISSIONS.APPOINTMENTS_CONFIRM), asyncHandler(async (req, res) => {
  const appt = await prisma.appointment.update({ where: { id: req.params.id }, data: { status: 'CONFIRMED', confirmedByAdminId: req.user!.sub } });
  await logActivity({ entityType: 'Appointment', entityId: appt.id, action: 'appointment.confirmed', actorType: 'ADMIN', actorId: req.user!.sub, requestId: req.requestId });
  res.json({ success: true, data: appt });
}));

router.post('/:id/reschedule', requirePermission(PERMISSIONS.APPOINTMENTS_CONFIRM), asyncHandler(async (req, res) => {
  const { appointmentDate, slotStart, slotEnd, reason } = z.object({ appointmentDate: z.string(), slotStart: z.string(), slotEnd: z.string(), reason: z.string().optional() }).parse(req.body);
  const appt = await prisma.appointment.update({ where: { id: req.params.id }, data: { appointmentDate: new Date(appointmentDate), slotStart: new Date(slotStart), slotEnd: new Date(slotEnd), status: 'RESCHEDULED', rescheduleReason: reason } });
  await logActivity({ entityType: 'Appointment', entityId: appt.id, action: 'appointment.rescheduled', newValue: { appointmentDate, reason }, actorType: 'ADMIN', actorId: req.user!.sub, requestId: req.requestId });
  res.json({ success: true, data: appt });
}));

router.post('/:id/cancel', requirePermission(PERMISSIONS.APPOINTMENTS_CONFIRM), asyncHandler(async (req, res) => {
  const { reason } = z.object({ reason: z.string().optional() }).parse(req.body);
  const appt = await prisma.appointment.update({ where: { id: req.params.id }, data: { status: 'CANCELLED', cancellationReason: reason } });
  await logActivity({ entityType: 'Appointment', entityId: appt.id, action: 'appointment.cancelled', actorType: 'ADMIN', actorId: req.user!.sub, requestId: req.requestId });
  res.json({ success: true, data: appt });
}));

router.post('/:id/check-in', requirePermission(PERMISSIONS.APPOINTMENTS_CHECKIN), asyncHandler(async (req, res) => {
  const appt = await prisma.appointment.update({ where: { id: req.params.id }, data: { status: 'CHECKED_IN' } });
  await logActivity({ entityType: 'Appointment', entityId: appt.id, action: 'appointment.checked-in', actorType: 'ADMIN', actorId: req.user!.sub, requestId: req.requestId });
  res.json({ success: true, data: appt });
}));

router.post('/:id/no-show', requirePermission(PERMISSIONS.APPOINTMENTS_NOSHOW), asyncHandler(async (req, res) => {
  const appt = await prisma.appointment.update({ where: { id: req.params.id }, data: { status: 'NO_SHOW' } });
  await logActivity({ entityType: 'Appointment', entityId: appt.id, action: 'appointment.no-show', actorType: 'ADMIN', actorId: req.user!.sub, requestId: req.requestId });
  res.json({ success: true, data: appt });
}));

export default router;
