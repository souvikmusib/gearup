import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { handleApiError, NotFoundError } from '@/lib/errors';
import { z } from 'zod';

// Minimal projection for a public tracking endpoint. We intentionally do NOT
// return internal DB ids, customer name/phone, staff names, monetary amounts,
// invoice numbers, job-card numbers, or appointment reference ids — that would
// turn this unauthenticated endpoint into an enumeration + PII oracle.
const requestSelect = {
  referenceId: true,
  serviceCategory: true,
  preferredDate: true,
  preferredSlotLabel: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  vehicle: { select: { registrationNumber: true, vehicleType: true, brand: true, model: true } },
  appointment: { select: { status: true, appointmentDate: true, slotStart: true, slotEnd: true } },
  jobCards: {
    orderBy: { createdAt: 'desc' as const },
    take: 1,
    select: {
      status: true,
      intakeDate: true,
      estimatedDeliveryAt: true,
      actualDeliveryAt: true,
      invoices: {
        orderBy: { createdAt: 'desc' as const },
        take: 1,
        select: { invoiceStatus: true, paymentStatus: true },
      },
    },
  },
};

function normalizePhone(value: string) {
  return value.replace(/\D/g, '');
}

function normalizeVehicle(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function summarize(sr: any) {
  const jc = sr.jobCards?.[0] ?? null;
  const invoice = jc?.invoices?.[0] ?? null;
  return {
    referenceId: sr.referenceId,
    serviceCategory: sr.serviceCategory,
    serviceRequestStatus: sr.status,
    bookingDate: sr.createdAt,
    updatedAt: sr.updatedAt,
    preferredDate: sr.preferredDate,
    preferredSlotLabel: sr.preferredSlotLabel,
    vehicle: sr.vehicle,
    appointment: sr.appointment
      ? {
          status: sr.appointment.status,
          appointmentDate: sr.appointment.appointmentDate,
          slotStart: sr.appointment.slotStart,
          slotEnd: sr.appointment.slotEnd,
        }
      : null,
    jobCard: jc
      ? {
          status: jc.status,
          intakeDate: jc.intakeDate,
          estimatedDeliveryAt: jc.estimatedDeliveryAt,
          actualDeliveryAt: jc.actualDeliveryAt,
        }
      : null,
    invoice: invoice
      ? {
          invoiceStatus: invoice.invoiceStatus,
          paymentStatus: invoice.paymentStatus,
        }
      : null,
  };
}

// Strict input schema: phone must be exactly 10 digits after normalisation,
// referenceId / vehicleNumber are length-capped to defeat ReDoS / huge payloads.
const trackSchema = z
  .object({
    referenceId: z.string().trim().max(32).optional(),
    phoneNumber: z
      .string()
      .min(10)
      .max(20)
      .refine((v) => v.replace(/\D/g, '').length === 10, 'Phone must be 10 digits'),
    vehicleNumber: z.string().trim().max(20).optional(),
    lookupType: z.enum(['reference', 'vehicle']).optional(),
  })
  .strict();

// Uniform user-facing error so hit vs miss can't be distinguished by message.
const GENERIC_MISS = 'No matching request found. Check your phone number and reference / vehicle number.';

export async function POST(req: NextRequest) {
  try {
    const parsed = trackSchema.parse(await req.json());
    const phone = normalizePhone(parsed.phoneNumber);
    const lookupType = parsed.lookupType ?? 'reference';

    if (lookupType === 'vehicle') {
      const needle = normalizeVehicle(parsed.vehicleNumber ?? '');
      // Require a meaningful vehicle number (full plate-ish length) so this
      // mode can't be used as a "does this phone exist" oracle by submitting
      // an empty / 1-char substring.
      if (needle.length < 6) throw new NotFoundError(GENERIC_MISS);

      // Phone + registration filter pushed into the DB so we never materialize
      // the customer's entire SR history in Node just to filter it.
      const requests = await prisma.serviceRequest.findMany({
        where: {
          customer: { phoneNumber: phone },
          vehicle: { registrationNumber: { contains: needle, mode: 'insensitive' } },
        },
        orderBy: { createdAt: 'desc' },
        take: 12,
        select: requestSelect,
      });
      if (!requests.length) throw new NotFoundError(GENERIC_MISS);
      const matches = requests;
      return NextResponse.json({ success: true, data: { lookupType: 'vehicle', requests: matches.map(summarize) } });
    }

    const ref = (parsed.referenceId ?? '').trim().toUpperCase();
    if (!ref) throw new NotFoundError(GENERIC_MISS);
    const sr = await prisma.serviceRequest.findFirst({
      where: { referenceId: ref, customer: { phoneNumber: phone } },
      select: requestSelect,
    });
    if (!sr) throw new NotFoundError(GENERIC_MISS);
    return NextResponse.json({ success: true, data: { lookupType: 'reference', request: summarize(sr) } });
  } catch (e) {
    return handleApiError(e);
  }
}
