import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/auth';
import { handleApiError, ValidationError, AppError } from '@/lib/errors';
import { PERMISSIONS } from '@gearup/types';
import { z } from 'zod';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    requirePermission(PERMISSIONS.AMC_CONTRACTS_VIEW);
    const contract = await prisma.amcContract.findUniqueOrThrow({
      where: { id: params.id },
      include: {
        customer: true,
        vehicle: true,
        plan: true,
        usages: { orderBy: { serviceDate: 'desc' }, include: { jobCard: { select: { id: true, jobCardNumber: true, status: true, issueSummary: true } } } },
      },
    });
    return NextResponse.json({ success: true, data: contract });
  } catch (e) { return handleApiError(e); }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    requirePermission(PERMISSIONS.AMC_CONTRACTS_MANAGE);
    const body = z.object({
      status: z.enum(['ACTIVE', 'EXPIRED', 'CANCELLED']).optional(),
      notes: z.string().optional(),
    }).parse(await req.json());
    const contract = await prisma.amcContract.update({ where: { id: params.id }, data: body as any });
    return NextResponse.json({ success: true, data: contract });
  } catch (e) { return handleApiError(e); }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    requirePermission(PERMISSIONS.AMC_CONTRACTS_MANAGE);
    await prisma.$transaction(async (tx: any) => {
      await tx.amcServiceUsage.deleteMany({ where: { amcContractId: params.id } });
      await tx.amcContract.delete({ where: { id: params.id } });
    });
    return NextResponse.json({ success: true });
  } catch (e) { return handleApiError(e); }
}

// POST /api/admin/amc/contracts/[id] — use a service
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    requirePermission(PERMISSIONS.AMC_CONTRACTS_MANAGE);
    const body = z.object({
      jobCardId: z.string().min(1),
      serviceDate: z.string().optional(),
      notes: z.string().optional(),
    }).parse(await req.json());

    const result = await prisma.$transaction(async (tx: any) => {
      const now = new Date();

      // Conditional update with WHERE-guard — race-safe decrement.
      const updateRes = await tx.amcContract.updateMany({
        where: {
          id: params.id,
          status: 'ACTIVE',
          servicesRemaining: { gt: 0 },
          endDate: { gte: now },
        },
        data: {
          servicesUsed: { increment: 1 },
          servicesRemaining: { decrement: 1 },
        },
      });
      if (updateRes.count !== 1) {
        throw new AppError(409, 'AMC contract is not active, has no remaining services, or has expired', 'CONFLICT');
      }

      // Re-read contract for accurate serviceNumber and ownership comparison.
      const contract = await tx.amcContract.findUniqueOrThrow({ where: { id: params.id } });

      // Verify the job card belongs to the contract's customer + vehicle.
      const jobCard = await tx.jobCard.findUniqueOrThrow({ where: { id: body.jobCardId } });
      if (jobCard.customerId !== contract.customerId || jobCard.vehicleId !== contract.vehicleId) {
        throw new AppError(400, 'Job card does not belong to this AMC contract\'s customer/vehicle', 'VALIDATION_ERROR');
      }

      const usage = await tx.amcServiceUsage.create({
        data: {
          amcContractId: params.id,
          jobCardId: body.jobCardId,
          serviceNumber: contract.servicesUsed, // already incremented above
          serviceDate: body.serviceDate ? new Date(body.serviceDate) : new Date(),
          notes: body.notes,
        },
      });

      return usage;
    });

    return NextResponse.json({ success: true, data: result }, { status: 201 });
  } catch (e) { return handleApiError(e); }
}
