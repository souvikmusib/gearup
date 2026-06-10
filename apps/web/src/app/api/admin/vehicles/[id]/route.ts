import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/auth';
import { handleApiError, AppError } from '@/lib/errors';
import { logActivity } from '@/lib/activity-logger';
import { PERMISSIONS } from '@gearup/types';
import { z } from 'zod';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    requirePermission(PERMISSIONS.VEHICLES_VIEW);
    const vehicle = await prisma.vehicle.findUniqueOrThrow({
      where: { id: params.id },
      select: {
        id: true,
        customerId: true,
        vehicleType: true,
        registrationNumber: true,
        brand: true,
        model: true,
        variant: true,
        yearOfManufacture: true,
        fuelType: true,
        engineCC: true,
        odometerReading: true,
        notes: true,
        createdAt: true,
        updatedAt: true,
        customer: {
          select: { id: true, fullName: true, phoneNumber: true, email: true },
        },
        serviceRequests: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: { id: true, referenceId: true, status: true, createdAt: true, issueDescription: true },
        },
        jobCards: {
          orderBy: { createdAt: 'desc' },
          take: 20,
          select: {
            id: true,
            jobCardNumber: true,
            status: true,
            intakeDate: true,
            odometerAtIntake: true,
            actualDeliveryAt: true,
            issueSummary: true,
            finalTotal: true,
            parts: {
              select: {
                id: true,
                requiredQty: true,
                unitPrice: true,
                inventoryItem: { select: { itemName: true } },
              },
            },
            assignments: {
              select: {
                id: true,
                worker: { select: { fullName: true } },
              },
            },
            invoices: { select: { id: true, invoiceNumber: true, grandTotal: true, paymentStatus: true } },
          },
        },
        invoices: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: { id: true, invoiceNumber: true, invoiceStatus: true, paymentStatus: true, grandTotal: true, createdAt: true },
        },
      },
    });
    return NextResponse.json({ success: true, data: vehicle });
  } catch (e) { return handleApiError(e); }
}

const patchSchema = z.object({
  registrationNumber: z.string().optional(),
  brand: z.string().optional(),
  model: z.string().optional(),
  variant: z.string().optional(),
  engineCC: z.number().optional(),
  odometerReading: z.number().optional(),
  notes: z.string().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = requirePermission(PERMISSIONS.VEHICLES_EDIT);
    const body = patchSchema.parse(await req.json());
    const data: Record<string, unknown> = {};
    if (body.registrationNumber !== undefined) data.registrationNumber = body.registrationNumber;
    if (body.brand !== undefined) data.brand = body.brand;
    if (body.model !== undefined) data.model = body.model;
    if (body.variant !== undefined) data.variant = body.variant;
    if (body.engineCC !== undefined) data.engineCC = body.engineCC;
    if (body.odometerReading !== undefined) data.odometerReading = body.odometerReading;
    if (body.notes !== undefined) data.notes = body.notes;

    const { previous, updated } = await prisma.$transaction(async (tx) => {
      const previous = await tx.vehicle.findUniqueOrThrow({ where: { id: params.id } });
      const updated = await tx.vehicle.update({ where: { id: params.id }, data });
      await logActivity({
        entityType: 'Vehicle',
        entityId: updated.id,
        action: 'vehicle.updated',
        previousValue: previous,
        newValue: updated,
        actorType: 'ADMIN',
        actorId: user.sub,
        tx,
      });
      return { previous, updated };
    });
    void previous;
    return NextResponse.json({ success: true, data: updated });
  } catch (e) { return handleApiError(e); }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = requirePermission(PERMISSIONS.VEHICLES_EDIT);
    const deleted = await prisma.$transaction(async (tx) => {
      const [jobCards, invoices, serviceRequests, amcContracts] = await Promise.all([
        tx.jobCard.count({ where: { vehicleId: params.id } }),
        tx.invoice.count({ where: { vehicleId: params.id } }),
        tx.serviceRequest.count({ where: { vehicleId: params.id } }),
        tx.amcContract.count({ where: { vehicleId: params.id } }),
      ]);
      if (jobCards > 0 || invoices > 0 || serviceRequests > 0 || amcContracts > 0) {
        throw new AppError(
          409,
          `Cannot delete — vehicle has ${jobCards} job card(s), ${invoices} invoice(s), ${serviceRequests} service request(s), ${amcContracts} AMC contract(s)`,
          'CONFLICT',
        );
      }
      const previous = await tx.vehicle.findUniqueOrThrow({ where: { id: params.id } });
      await tx.appointment.deleteMany({ where: { vehicleId: params.id } });
      await tx.vehicle.delete({ where: { id: params.id } });
      await logActivity({
        entityType: 'Vehicle',
        entityId: params.id,
        action: 'vehicle.deleted',
        previousValue: previous,
        actorType: 'ADMIN',
        actorId: user.sub,
        tx,
      });
      return previous;
    });
    void deleted;
    return NextResponse.json({ success: true });
  } catch (e) { return handleApiError(e); }
}
