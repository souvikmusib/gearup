import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { handleApiError, NotFoundError } from '@/lib/errors';
import { z } from 'zod';

const requestSelect = {
  id: true,
  referenceId: true,
  serviceCategory: true,
  issueDescription: true,
  preferredDate: true,
  preferredSlotLabel: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  customer: { select: { fullName: true, phoneNumber: true } },
  vehicle: { select: { registrationNumber: true, vehicleType: true, brand: true, model: true } },
  appointment: { select: { referenceId: true, status: true, appointmentDate: true, slotStart: true, slotEnd: true } },
  jobCards: {
    orderBy: { createdAt: 'desc' as const },
    take: 1,
    select: {
      id: true,
      jobCardNumber: true,
      status: true,
      intakeDate: true,
      estimatedDeliveryAt: true,
      actualDeliveryAt: true,
      invoices: {
        orderBy: { createdAt: 'desc' as const },
        take: 1,
        select: { invoiceNumber: true, invoiceStatus: true, paymentStatus: true, grandTotal: true, amountDue: true },
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
    id: sr.id,
    referenceId: sr.referenceId,
    serviceCategory: sr.serviceCategory,
    issueDescription: sr.issueDescription,
    serviceRequestStatus: sr.status,
    bookingDate: sr.createdAt,
    updatedAt: sr.updatedAt,
    preferredDate: sr.preferredDate,
    preferredSlotLabel: sr.preferredSlotLabel,
    customer: sr.customer,
    vehicle: sr.vehicle,
    appointment: sr.appointment,
    jobCard: jc ? {
      jobCardNumber: jc.jobCardNumber,
      status: jc.status,
      intakeDate: jc.intakeDate,
      estimatedDeliveryAt: jc.estimatedDeliveryAt,
      actualDeliveryAt: jc.actualDeliveryAt,
    } : null,
    invoice: invoice ? {
      invoiceNumber: invoice.invoiceNumber,
      invoiceStatus: invoice.invoiceStatus,
      paymentStatus: invoice.paymentStatus,
      grandTotal: invoice.grandTotal,
      amountDue: invoice.amountDue,
    } : null,
  };
}

export async function POST(req: NextRequest) {
  try {
    const { referenceId, phoneNumber, vehicleNumber, lookupType } = z.object({
      referenceId: z.string().optional(),
      phoneNumber: z.string().min(5),
      vehicleNumber: z.string().optional(),
      lookupType: z.enum(['reference', 'vehicle']).optional(),
    }).parse(await req.json());
    const phone = normalizePhone(phoneNumber);

    if ((lookupType ?? 'reference') === 'vehicle') {
      const vehicle = (vehicleNumber ?? '').trim();
      if (!vehicle) throw new NotFoundError('Enter a vehicle number to search.');
      const requests = await prisma.serviceRequest.findMany({
        where: {
          customer: { phoneNumber: phone },
        },
        orderBy: { createdAt: 'desc' },
        select: requestSelect,
      });
      const needle = normalizeVehicle(vehicle);
      const matches = requests.filter((sr: any) => normalizeVehicle(sr.vehicle.registrationNumber).includes(needle)).slice(0, 12);
      if (!matches.length) throw new NotFoundError('No matching request found.');
      return NextResponse.json({ success: true, data: { lookupType: 'vehicle', requests: matches.map(summarize) } });
    }

    if (!referenceId?.trim()) throw new NotFoundError('Enter a reference ID to search.');
    const sr = await prisma.serviceRequest.findFirst({
      where: { referenceId: referenceId.trim().toUpperCase(), customer: { phoneNumber: phone } },
      select: requestSelect,
    });
    if (!sr) throw new NotFoundError('No matching request found.');
    return NextResponse.json({ success: true, data: { lookupType: 'reference', request: summarize(sr) } });
  } catch (e) { return handleApiError(e); }
}
