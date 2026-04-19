import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/auth';
import { handleApiError } from '@/lib/errors';
import { logActivity } from '@/lib/activity-logger';
import { PERMISSIONS } from '@gearup/types';
import { z } from 'zod';

const schema = z.object({
  amount: z.number().positive(),
  paymentMode: z.string(),
  paymentDate: z.string(),
  referenceNumber: z.string().optional(),
  notes: z.string().optional(),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = requirePermission(PERMISSIONS.PAYMENTS_RECORD);
    const body = schema.parse(await req.json());

    const result = await prisma.$transaction(async (tx: any) => {
      const payment = await tx.payment.create({
        data: {
          invoiceId: params.id,
          amount: body.amount,
          paymentMode: body.paymentMode as any,
          paymentDate: new Date(body.paymentDate),
          referenceNumber: body.referenceNumber,
          notes: body.notes,
          receivedByAdminId: user.sub,
        },
      });
      const invoice = await tx.invoice.findUniqueOrThrow({ where: { id: params.id } });
      const newPaid = Number(invoice.amountPaid) + body.amount;
      const newDue = Number(invoice.grandTotal) - newPaid;
      const paymentStatus = newDue <= 0 ? 'PAID' : newPaid > 0 ? 'PARTIALLY_PAID' : 'UNPAID';
      await tx.invoice.update({
        where: { id: params.id },
        data: { amountPaid: newPaid, amountDue: Math.max(0, newDue), paymentStatus: paymentStatus as any },
      });
      return payment;
    });

    await logActivity({ entityType: 'Payment', entityId: result.id, action: 'payment.recorded', newValue: body, actorType: 'ADMIN', actorId: user.sub });
    return NextResponse.json({ success: true, data: result }, { status: 201 });
  } catch (e) { return handleApiError(e); }
}
