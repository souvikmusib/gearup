import { Router } from 'express';
import { asyncHandler } from '../../common/utils/async-handler';
import { prisma } from '@gearup/db';
import { z } from 'zod';
import { generateReferenceId, generateAppointmentRef } from '../../common/utils/id-generators';
import { ValidationError, NotFoundError } from '../../common/errors';
import { logActivity } from '../../common/utils/activity-logger';

const router: Router = Router();

const serviceRequestSchema = z.object({
  fullName: z.string().min(1),
  phoneNumber: z.string().min(5),
  alternatePhone: z.string().optional(),
  email: z.string().email().optional(),
  vehicleType: z.enum(['CAR', 'BIKE', 'OTHER']),
  brand: z.string().min(1),
  model: z.string().min(1),
  variant: z.string().optional(),
  registrationNumber: z.string().min(1),
  serviceCategory: z.string().min(1),
  issueDescription: z.string().min(1),
  preferredDate: z.string().optional(),
  preferredSlotLabel: z.string().optional(),
  pickupDropRequired: z.boolean().default(false),
  notes: z.string().optional(),
});

router.post('/service-requests', asyncHandler(async (req, res) => {
  const body = serviceRequestSchema.parse(req.body);

  const result = await prisma.$transaction(async (tx: any) => {
    // Upsert customer by phone
    let customer = await tx.customer.findFirst({ where: { phoneNumber: body.phoneNumber } });
    if (!customer) {
      customer = await tx.customer.create({
        data: { fullName: body.fullName, phoneNumber: body.phoneNumber, alternatePhone: body.alternatePhone, email: body.email, source: 'PUBLIC_FORM' },
      });
    }

    // Upsert vehicle by registration + customer
    let vehicle = await tx.vehicle.findFirst({ where: { registrationNumber: body.registrationNumber, customerId: customer.id } });
    if (!vehicle) {
      vehicle = await tx.vehicle.create({
        data: { customerId: customer.id, vehicleType: body.vehicleType, registrationNumber: body.registrationNumber, brand: body.brand, model: body.model, variant: body.variant },
      });
    }

    const referenceId = generateReferenceId();
    const sr = await tx.serviceRequest.create({
      data: {
        referenceId,
        customerId: customer.id,
        vehicleId: vehicle.id,
        serviceCategory: body.serviceCategory,
        issueDescription: body.issueDescription,
        preferredDate: body.preferredDate ? new Date(body.preferredDate) : undefined,
        preferredSlotLabel: body.preferredSlotLabel,
        pickupDropRequired: body.pickupDropRequired,
        notes: body.notes,
        source: 'PUBLIC_FORM',
        status: body.preferredDate ? 'APPOINTMENT_PENDING' : 'SUBMITTED',
      },
    });

    let appointment = null;
    if (body.preferredDate) {
      appointment = await tx.appointment.create({
        data: {
          referenceId: generateAppointmentRef(),
          serviceRequestId: sr.id,
          customerId: customer.id,
          vehicleId: vehicle.id,
          appointmentDate: new Date(body.preferredDate),
          slotStart: new Date(body.preferredDate),
          slotEnd: new Date(new Date(body.preferredDate).getTime() + 30 * 60_000),
          bookingSource: 'PUBLIC_FORM',
          status: 'REQUESTED',
        },
      });
    }

    return { referenceId, serviceRequestId: sr.id, appointmentId: appointment?.id ?? null, status: sr.status };
  });

  await logActivity({ entityType: 'ServiceRequest', entityId: result.serviceRequestId, action: 'service-request.created', newValue: result, actorType: 'PUBLIC' });

  res.status(201).json({
    success: true,
    data: { ...result, message: 'Service request submitted successfully. Use your reference ID to track progress.' },
  });
}));

router.get('/available-slots', asyncHandler(async (req, res) => {
  const { date } = req.query as { date?: string };
  if (!date) throw new ValidationError('date query parameter required');

  const targetDate = new Date(date);
  const dayOfWeek = targetDate.getDay();

  const rules = await prisma.appointmentSlotRule.findMany({ where: { dayOfWeek, isActive: true } });
  const holidays = await prisma.holiday.findMany({ where: { holidayDate: targetDate, isFullDay: true } });
  if (holidays.length) {
    return res.json({ success: true, data: { date, slots: [], message: 'Closed – ' + holidays[0].holidayName } });
  }

  const blocked = await prisma.blockedSlot.findMany({ where: { blockDate: targetDate, appliesToAll: true } });
  const existingAppts = await prisma.appointment.count({
    where: { appointmentDate: targetDate, status: { notIn: ['CANCELLED', 'NO_SHOW'] } },
  });

  const slots = rules.flatMap((rule: any) => {
    const result: { label: string; start: string; end: string; available: boolean }[] = [];
    const [openH, openM] = rule.openTime.split(':').map(Number);
    const [closeH, closeM] = rule.closeTime.split(':').map(Number);
    const openMin = openH * 60 + openM;
    const closeMin = closeH * 60 + closeM;

    for (let m = openMin; m + rule.slotDurationMinutes <= closeMin; m += rule.slotDurationMinutes) {
      const startH = Math.floor(m / 60);
      const startM = m % 60;
      const endM = m + rule.slotDurationMinutes;
      const endH = Math.floor(endM / 60);
      const endMn = endM % 60;
      const fmt = (h: number, mn: number) => `${h.toString().padStart(2, '0')}:${mn.toString().padStart(2, '0')}`;
      const start = new Date(targetDate); start.setHours(startH, startM, 0, 0);
      const end = new Date(targetDate); end.setHours(endH, endMn, 0, 0);
      const isBlocked = blocked.some((b: any) => start >= b.blockStartTime && end <= b.blockEndTime);
      result.push({
        label: `${fmt(startH, startM)} - ${fmt(endH, endMn)}`,
        start: start.toISOString(),
        end: end.toISOString(),
        available: !isBlocked && existingAppts < rule.maxCapacity,
      });
    }
    return result;
  });

  res.json({ success: true, data: { date, slots } });
}));

const trackSchema = z.object({
  referenceId: z.string().min(1),
  phoneNumber: z.string().min(5),
  email: z.string().email().optional(),
});

router.post('/track', asyncHandler(async (req, res) => {
  const { referenceId, phoneNumber } = trackSchema.parse(req.body);

  const sr = await prisma.serviceRequest.findUnique({
    where: { referenceId },
    include: {
      customer: { select: { phoneNumber: true } },
      appointment: { select: { status: true, appointmentDate: true, slotStart: true, slotEnd: true } },
      jobCards: { select: { status: true, jobCardNumber: true }, orderBy: { createdAt: 'desc' }, take: 1 },
    },
  });

  if (!sr || sr.customer.phoneNumber !== phoneNumber) {
    throw new NotFoundError('No matching request found. Please check your reference ID and phone number.');
  }

  const jc = sr.jobCards[0];
  const invoice = jc ? await prisma.invoice.findFirst({ where: { jobCard: { jobCardNumber: jc.jobCardNumber } }, select: { paymentStatus: true, invoiceStatus: true } }) : null;

  const timeline: { label: string; timestamp: string | null; status: string }[] = [
    { label: 'Request Submitted', timestamp: sr.createdAt.toISOString(), status: 'COMPLETED' },
  ];
  if (sr.appointment) {
    timeline.push({ label: 'Appointment', timestamp: sr.appointment.appointmentDate.toISOString(), status: sr.appointment.status });
  }
  if (jc) {
    timeline.push({ label: 'Job Card', timestamp: null, status: jc.status });
  }

  res.json({
    success: true,
    data: {
      referenceId: sr.referenceId,
      serviceRequestStatus: sr.status,
      appointmentStatus: sr.appointment?.status ?? null,
      jobCardStatus: jc?.status ?? null,
      invoiceStatus: invoice?.invoiceStatus ?? null,
      paymentStatus: invoice?.paymentStatus ?? null,
      publicTimeline: timeline,
    },
  });
}));

export default router;
