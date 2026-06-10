import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { AppError, handleApiError } from '@/lib/errors';
import { logActivity } from '@/lib/activity-logger';
import { generateReferenceId, generateAppointmentRef } from '@/lib/id-generators';
import { createHash } from 'crypto';
import { z } from 'zod';

// Strict zod schema with length caps to prevent abuse / oversized payloads.
const schema = z.object({
  fullName: z.string().trim().min(1).max(120),
  phoneNumber: z.string().trim().min(5).max(20),
  alternatePhone: z.string().trim().max(20).optional(),
  email: z
    .string()
    .max(254)
    .optional()
    .transform((v) => v?.trim() || undefined)
    .pipe(z.string().email().max(254).optional()),
  vehicleType: z.enum(['CAR', 'BIKE', 'OTHER']),
  brand: z.string().trim().min(1).max(80),
  model: z.string().trim().min(1).max(80),
  variant: z.string().trim().max(80).optional(),
  vehicleId: z.string().trim().max(40).optional(),
  registrationNumber: z.string().trim().min(1).max(20),
  serviceCategory: z.string().trim().min(1).max(80),
  issueDescription: z.string().trim().min(1).max(2000),
  preferredDate: z.string().trim().max(40).optional(),
  preferredSlotLabel: z.string().trim().max(80).optional(),
  pickupDropRequired: z.boolean().default(false),
  notes: z.string().trim().max(2000).optional(),
});

// In-process throttle. Per-phone cooldown blocks rapid re-submissions; the
// fingerprint window blocks exact duplicate payloads (e.g. double-submit).
// NOTE: per-process only; behind a multi-instance deploy this is a soft guard
// that complements the DB-level recent-duplicate check below.
const PHONE_COOLDOWN_MS = 60_000; // 1 submission per phone per minute
const FINGERPRINT_WINDOW_MS = 5 * 60_000; // 5 min exact-dup window
const recentByPhone = new Map<string, number>();
const recentFingerprints = new Map<string, number>();

function sweep(map: Map<string, number>, windowMs: number) {
  const cutoff = Date.now() - windowMs;
  for (const [k, t] of map) if (t < cutoff) map.delete(k);
}

function fingerprint(phoneNumber: string, registrationNumber: string, body: z.infer<typeof schema>) {
  return createHash('sha256')
    .update(
      [
        phoneNumber,
        registrationNumber,
        body.serviceCategory,
        body.issueDescription,
        body.preferredDate ?? '',
        body.preferredSlotLabel ?? '',
      ].join('|'),
    )
    .digest('hex');
}

export async function POST(req: NextRequest) {
  try {
    const raw = await req.json();
    const body = schema.parse(raw);
    const phoneNumber = body.phoneNumber.replace(/\D/g, '');
    if (phoneNumber.length < 5) {
      throw new AppError( 400, 'Invalid phone number.','VALIDATION_ERROR');
    }
    const registrationNumber = body.registrationNumber.toUpperCase().trim();

    // --- Throttle: per-phone cooldown ---
    sweep(recentByPhone, PHONE_COOLDOWN_MS);
    const lastForPhone = recentByPhone.get(phoneNumber);
    if (lastForPhone && Date.now() - lastForPhone < PHONE_COOLDOWN_MS) {
      throw new AppError(429, 'Please wait a moment before submitting another request.', 'RATE_LIMITED');
    }

    // --- Throttle: exact-payload fingerprint window (double-submit guard) ---
    sweep(recentFingerprints, FINGERPRINT_WINDOW_MS);
    const fp = fingerprint(phoneNumber, registrationNumber, body);
    const lastForFp = recentFingerprints.get(fp);
    if (lastForFp && Date.now() - lastForFp < FINGERPRINT_WINDOW_MS) {
      throw new AppError(409, 'A matching request was just submitted. Please check your messages.', 'DUPLICATE_SUBMISSION');
    }

    // --- DB-level recent-duplicate guard (covers multi-instance + restart) ---
    const dupWindowStart = new Date(Date.now() - FINGERPRINT_WINDOW_MS);
    const existingCustomer = await prisma.customer.findFirst({ where: { phoneNumber } });
    if (existingCustomer) {
      const recentDup = await prisma.serviceRequest.findFirst({
        where: {
          customerId: existingCustomer.id,
          serviceCategory: body.serviceCategory,
          createdAt: { gte: dupWindowStart },
          vehicle: { registrationNumber },
        },
        select: { id: true },
      });
      if (recentDup) {
        throw new AppError(409, 'A matching request was just submitted. Please check your messages.', 'DUPLICATE_SUBMISSION');
      }
    }

    const result = await prisma.$transaction(async (tx: any) => {
      // Customer.phoneNumber is NOT yet @unique (dedupe migration pending). Use findFirst.
      let customer = await tx.customer.findFirst({ where: { phoneNumber } });
      let nameMismatch = false;
      let emailMismatch = false;
      if (!customer) {
        customer = await tx.customer.create({
          data: {
            fullName: body.fullName,
            phoneNumber,
            alternatePhone: body.alternatePhone,
            email: body.email,
            source: 'PUBLIC_FORM',
          },
        });
      } else {
        // SECURITY: never mutate an existing customer's PII from an
        // unauthenticated form. Phone-number typos / takeover attempts must
        // not silently overwrite another customer's name or email. Surface
        // mismatches via SR notes so admin can reconcile.
        if (
          body.fullName &&
          customer.fullName &&
          body.fullName.trim().toLowerCase() !== customer.fullName.trim().toLowerCase()
        ) {
          nameMismatch = true;
        }
        if (
          body.email &&
          customer.email &&
          body.email.trim().toLowerCase() !== customer.email.trim().toLowerCase()
        ) {
          emailMismatch = true;
        }
      }

      let vehicle = body.vehicleId
        ? await tx.vehicle.findFirst({ where: { id: body.vehicleId, customerId: customer.id } })
        : null;
      if (!vehicle)
        vehicle = await tx.vehicle.findFirst({ where: { registrationNumber, customerId: customer.id } });
      if (!vehicle)
        vehicle = await tx.vehicle.create({
          data: {
            customerId: customer.id,
            vehicleType: body.vehicleType,
            registrationNumber,
            brand: body.brand,
            model: body.model,
            variant: body.variant,
          },
        });

      const referenceId = generateReferenceId();

      // Capture submitted-but-mismatched identity in notes for admin reconcile.
      const reconcileNote: string[] = [];
      if (nameMismatch)
        reconcileNote.push(`[reconcile] submitted name "${body.fullName}" differs from customer-on-file.`);
      if (emailMismatch)
        reconcileNote.push(`[reconcile] submitted email "${body.email}" differs from customer-on-file.`);
      const combinedNotes = [body.notes, ...reconcileNote].filter(Boolean).join('\n').slice(0, 2000) || undefined;

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
          notes: combinedNotes,
          source: 'PUBLIC_FORM',
          status: body.preferredDate ? 'APPOINTMENT_PENDING' : 'SUBMITTED',
        },
      });

      let appointment = null;
      if (body.preferredDate) {
        const preferredDate = new Date(body.preferredDate);
        const slotRule = await tx.appointmentSlotRule.findFirst({
          where: { dayOfWeek: preferredDate.getUTCDay(), isActive: true },
        });
        const duration = (slotRule?.slotDurationMinutes ?? 30) * 60_000;
        appointment = await tx.appointment.create({
          data: {
            referenceId: generateAppointmentRef(),
            serviceRequestId: sr.id,
            customerId: customer.id,
            vehicleId: vehicle.id,
            appointmentDate: preferredDate,
            slotStart: preferredDate,
            slotEnd: new Date(preferredDate.getTime() + duration),
            bookingSource: 'PUBLIC_FORM',
            status: 'REQUESTED',
          },
        });
      }
      return {
        referenceId,
        serviceRequestId: sr.id,
        appointmentId: appointment?.id ?? null,
        status: sr.status,
      };
    });

    // Record throttle state only after successful commit.
    recentByPhone.set(phoneNumber, Date.now());
    recentFingerprints.set(fp, Date.now());

    logActivity({
      entityType: 'ServiceRequest',
      entityId: result.serviceRequestId,
      action: 'service-request.created',
      newValue: result,
      actorType: 'PUBLIC',
    });
    return NextResponse.json(
      { success: true, data: { ...result, message: 'Service request submitted successfully.' } },
      { status: 201 },
    );
  } catch (e) {
    return handleApiError(e);
  }
}
