import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/auth';
import { handleApiError, ValidationError } from '@/lib/errors';
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
      const contract = await tx.amcContract.findUniqueOrThrow({ where: { id: params.id } });

      if (contract.status !== 'ACTIVE') throw new ValidationError('Contract is not active');
      if (contract.servicesRemaining <= 0) throw new ValidationError('No services remaining on this contract');
      if (new Date() > contract.endDate) throw new ValidationError('Contract has expired');

      const usage = await tx.amcServiceUsage.create({
        data: {
          amcContractId: params.id,
          jobCardId: body.jobCardId,
          serviceNumber: contract.servicesUsed + 1,
          serviceDate: body.serviceDate ? new Date(body.serviceDate) : new Date(),
          notes: body.notes,
        },
      });

      await tx.amcContract.update({
        where: { id: params.id },
        data: { servicesUsed: { increment: 1 }, servicesRemaining: { decrement: 1 } },
      });

      return usage;
    });

    return NextResponse.json({ success: true, data: result }, { status: 201 });
  } catch (e) { return handleApiError(e); }
}
