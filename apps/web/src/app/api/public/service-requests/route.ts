import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { handleApiError } from '@/lib/errors';
import { logActivity } from '@/lib/activity-logger';
import { generateReferenceId, generateAppointmentRef } from '@/lib/id-generators';
import { z } from 'zod';

const schema = z.object({
  fullName: z.string().min(1), phoneNumber: z.string().min(5), alternatePhone: z.string().optional(),
  email: z.string().email().optional(), vehicleType: z.enum(['CAR', 'BIKE', 'OTHER']),
  brand: z.string().min(1), model: z.string().min(1), variant: z.string().optional(),
  registrationNumber: z.string().min(1), serviceCategory: z.string().min(1), issueDescription: z.string().min(1),
  preferredDate: z.string().optional(), preferredSlotLabel: z.string().optional(),
  pickupDropRequired: z.boolean().default(false), notes: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const body = schema.parse(await req.json());
    const result = await prisma.$transaction(async (tx: any) => {
      let customer = await tx.customer.findFirst({ where: { phoneNumber: body.phoneNumber } });
      if (!customer) customer = await tx.customer.create({ data: { fullName: body.fullName, phoneNumber: body.phoneNumber, alternatePhone: body.alternatePhone, email: body.email, source: 'PUBLIC_FORM' } });
      let vehicle = await tx.vehicle.findFirst({ where: { registrationNumber: body.registrationNumber, customerId: customer.id } });
      if (!vehicle) vehicle = await tx.vehicle.create({ data: { customerId: customer.id, vehicleType: body.vehicleType, registrationNumber: body.registrationNumber, brand: body.brand, model: body.model, variant: body.variant } });
      const referenceId = generateReferenceId();
      const sr = await tx.serviceRequest.create({ data: { referenceId, customerId: customer.id, vehicleId: vehicle.id, serviceCategory: body.serviceCategory, issueDescription: body.issueDescription, preferredDate: body.preferredDate ? new Date(body.preferredDate) : undefined, preferredSlotLabel: body.preferredSlotLabel, pickupDropRequired: body.pickupDropRequired, notes: body.notes, source: 'PUBLIC_FORM', status: body.preferredDate ? 'APPOINTMENT_PENDING' : 'SUBMITTED' } });
      let appointment = null;
      if (body.preferredDate) {
        const preferredDate = new Date(body.preferredDate);
        const slotRule = await tx.appointmentSlotRule.findFirst({ where: { dayOfWeek: preferredDate.getUTCDay(), isActive: true } });
        const duration = (slotRule?.slotDurationMinutes ?? 30) * 60_000;
        appointment = await tx.appointment.create({ data: { referenceId: generateAppointmentRef(), serviceRequestId: sr.id, customerId: customer.id, vehicleId: vehicle.id, appointmentDate: preferredDate, slotStart: preferredDate, slotEnd: new Date(preferredDate.getTime() + duration), bookingSource: 'PUBLIC_FORM', status: 'REQUESTED' } });
      }
      return { referenceId, serviceRequestId: sr.id, appointmentId: appointment?.id ?? null, status: sr.status };
    });
    await logActivity({ entityType: 'ServiceRequest', entityId: result.serviceRequestId, action: 'service-request.created', newValue: result, actorType: 'PUBLIC' });
    return NextResponse.json({ success: true, data: { ...result, message: 'Service request submitted successfully.' } }, { status: 201 });
  } catch (e) { return handleApiError(e); }
}
