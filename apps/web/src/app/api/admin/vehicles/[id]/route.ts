import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/auth';
import { handleApiError } from '@/lib/errors';
import { logActivity } from '@/lib/activity-logger';
import { PERMISSIONS } from '@gearup/types';
import { z } from 'zod';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    requirePermission(PERMISSIONS.VEHICLES_VIEW);
    const vehicle = await prisma.vehicle.findUniqueOrThrow({ where: { id: params.id }, include: { customer: true, serviceRequests: { orderBy: { createdAt: 'desc' }, take: 10 }, jobCards: { orderBy: { createdAt: 'desc' }, take: 20, include: { parts: { include: { inventoryItem: { select: { itemName: true } } } }, assignments: { include: { worker: { select: { fullName: true } } } }, invoices: { select: { id: true, invoiceNumber: true, grandTotal: true, paymentStatus: true } } } }, invoices: { orderBy: { createdAt: 'desc' }, take: 10, select: { id: true, invoiceNumber: true, invoiceStatus: true, paymentStatus: true, grandTotal: true, createdAt: true } } } });
    return NextResponse.json({ success: true, data: vehicle });
  } catch (e) { return handleApiError(e); }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = requirePermission(PERMISSIONS.VEHICLES_EDIT);
    const body = z.object({ registrationNumber: z.string().optional(), brand: z.string().optional(), model: z.string().optional(), variant: z.string().optional(), engineCC: z.number().optional(), odometerReading: z.number().optional(), notes: z.string().optional() }).parse(await req.json());
    const vehicle = await prisma.vehicle.update({ where: { id: params.id }, data: body as any });
    logActivity({ entityType: 'Vehicle', entityId: vehicle.id, action: 'vehicle.updated', newValue: vehicle, actorType: 'ADMIN', actorId: user.sub });
    return NextResponse.json({ success: true, data: vehicle });
  } catch (e) { return handleApiError(e); }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = requirePermission(PERMISSIONS.VEHICLES_EDIT);
    const [jobCards, invoices, serviceRequests] = await Promise.all([
      prisma.jobCard.count({ where: { vehicleId: params.id } }),
      prisma.invoice.count({ where: { vehicleId: params.id } }),
      prisma.serviceRequest.count({ where: { vehicleId: params.id } }),
    ]);
    if (jobCards > 0 || invoices > 0 || serviceRequests > 0) {
      return NextResponse.json({ success: false, error: { message: `Cannot delete — vehicle has ${jobCards} job card(s), ${invoices} invoice(s), ${serviceRequests} service request(s)` } }, { status: 409 });
    }
    await prisma.appointment.deleteMany({ where: { vehicleId: params.id } });
    await prisma.vehicle.delete({ where: { id: params.id } });
    logActivity({ entityType: 'Vehicle', entityId: params.id, action: 'vehicle.deleted', actorType: 'ADMIN', actorId: user.sub });
    return NextResponse.json({ success: true });
  } catch (e) { return handleApiError(e); }
}
