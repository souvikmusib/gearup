import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/auth';
import { handleApiError, AppError } from '@/lib/errors';
import { logActivity } from '@/lib/activity-logger';
import { PERMISSIONS } from '@gearup/types';
import { z } from 'zod';

const updateSchema = z.object({
  fullName: z.string().optional(), phoneNumber: z.string().optional(), alternatePhone: z.string().optional(),
  email: z.preprocess((v) => (typeof v === 'string' ? v.trim() || undefined : v ?? undefined), z.string().optional()), addressLine1: z.string().optional(), addressLine2: z.string().optional(),
  city: z.string().optional(), state: z.string().optional(), postalCode: z.string().optional(),
  notes: z.string().optional(), source: z.string().optional(),
});

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    requirePermission(PERMISSIONS.CUSTOMERS_VIEW);
    const customer = await prisma.customer.findUniqueOrThrow({ where: { id: params.id }, include: { vehicles: true, serviceRequests: { orderBy: { createdAt: 'desc' }, take: 10 }, jobCards: { orderBy: { createdAt: 'desc' }, take: 10, select: { id: true, jobCardNumber: true, status: true, issueSummary: true, createdAt: true } }, invoices: { orderBy: { createdAt: 'desc' }, take: 10, select: { id: true, invoiceNumber: true, invoiceStatus: true, paymentStatus: true, grandTotal: true, createdAt: true } } } });
    return NextResponse.json({ success: true, data: customer });
  } catch (e) { return handleApiError(e); }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = requirePermission(PERMISSIONS.CUSTOMERS_EDIT);
    const body = updateSchema.parse(await req.json());
    const prev = await prisma.customer.findUniqueOrThrow({ where: { id: params.id } });
    const customer = await prisma.customer.update({ where: { id: params.id }, data: body as any });
    logActivity({ entityType: 'Customer', entityId: customer.id, action: 'customer.updated', previousValue: prev, newValue: customer, actorType: 'ADMIN', actorId: user.sub });
    return NextResponse.json({ success: true, data: customer });
  } catch (e) { return handleApiError(e); }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = requirePermission(PERMISSIONS.CUSTOMERS_EDIT);
    await prisma.$transaction(async (tx) => {
      const [vehicles, jobCards, invoices, amcContracts] = await Promise.all([
        tx.vehicle.count({ where: { customerId: params.id } }),
        tx.jobCard.count({ where: { customerId: params.id } }),
        tx.invoice.count({ where: { customerId: params.id } }),
        tx.amcContract.count({ where: { customerId: params.id } }),
      ]);
      if (vehicles > 0 || jobCards > 0 || invoices > 0 || amcContracts > 0) {
        throw new AppError( 409, `Cannot delete — customer has ${vehicles} vehicle(s), ${jobCards} job card(s), ${invoices} invoice(s), ${amcContracts} AMC contract(s)`,'CONFLICT');
      }
      await tx.serviceRequest.deleteMany({ where: { customerId: params.id } });
      await tx.appointment.deleteMany({ where: { customerId: params.id } });
      await tx.customer.delete({ where: { id: params.id } });
    });
    logActivity({ entityType: 'Customer', entityId: params.id, action: 'customer.deleted', actorType: 'ADMIN', actorId: user.sub });
    return NextResponse.json({ success: true });
  } catch (e) { return handleApiError(e); }
}
