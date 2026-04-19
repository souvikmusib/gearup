import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { handleApiError, NotFoundError } from '@/lib/errors';
import { z } from 'zod';

export async function POST(req: NextRequest) {
  try {
    const { referenceId, phoneNumber } = z.object({ referenceId: z.string().min(1), phoneNumber: z.string().min(5) }).parse(await req.json());
    const sr = await prisma.serviceRequest.findUnique({
      where: { referenceId },
      include: { customer: { select: { phoneNumber: true } }, appointment: { select: { status: true, appointmentDate: true } }, jobCards: { select: { status: true, jobCardNumber: true }, orderBy: { createdAt: 'desc' }, take: 1 } },
    });
    if (!sr || sr.customer.phoneNumber !== phoneNumber) throw new NotFoundError('No matching request found.');
    const jc = sr.jobCards[0];
    const invoice = jc ? await prisma.invoice.findFirst({ where: { jobCard: { jobCardNumber: jc.jobCardNumber } }, select: { paymentStatus: true, invoiceStatus: true } }) : null;
    return NextResponse.json({ success: true, data: { referenceId: sr.referenceId, serviceRequestStatus: sr.status, appointmentStatus: sr.appointment?.status ?? null, jobCardStatus: jc?.status ?? null, invoiceStatus: invoice?.invoiceStatus ?? null, paymentStatus: invoice?.paymentStatus ?? null } });
  } catch (e) { return handleApiError(e); }
}
