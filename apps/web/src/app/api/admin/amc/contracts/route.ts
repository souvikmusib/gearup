import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { paginate, paginationMeta } from '@/lib/pagination';
import { requirePermission } from '@/lib/auth';
import { handleApiError, AppError } from '@/lib/errors';
import { PERMISSIONS } from '@gearup/types';
import { Prisma } from '@prisma/client';
import { z } from 'zod';

const createSchema = z.object({
  customerId: z.string().min(1),
  vehicleId: z.string().min(1),
  amcPlanId: z.string().min(1),
  startDate: z.string(),
  amountPaid: z.number().positive(),
  paymentMode: z.string().optional(),
  paymentDate: z.string().optional(),
  notes: z.string().optional(),
});

export async function GET(req: NextRequest) {
  try {
    requirePermission(PERMISSIONS.AMC_CONTRACTS_VIEW);
    const sp = req.nextUrl.searchParams;
    const page = Number(sp.get('page')) || 1;
    const pageSize = Number(sp.get('pageSize')) || 20;
    const status = sp.get('status') || undefined;
    const p = paginate({ page, pageSize });
    const where = status ? { status: status as any } : {};
    const [data, total] = await Promise.all([
      prisma.amcContract.findMany({
        where, ...p, orderBy: { createdAt: 'desc' },
        include: {
          customer: { select: { fullName: true, phoneNumber: true } },
          vehicle: { select: { registrationNumber: true, brand: true, model: true } },
          plan: { select: { planName: true } },
        },
      }),
      prisma.amcContract.count({ where }),
    ]);
    return NextResponse.json({ success: true, data, meta: paginationMeta(total, page, pageSize) });
  } catch (e) { return handleApiError(e); }
}

export async function POST(req: NextRequest) {
  try {
    requirePermission(PERMISSIONS.AMC_CONTRACTS_MANAGE);
    const body = createSchema.parse(await req.json());

    const plan = await prisma.amcPlan.findUniqueOrThrow({ where: { id: body.amcPlanId } });
    const startDate = new Date(body.startDate);
    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + plan.durationMonths);

    // Reject duplicate ACTIVE AMC contract on the same vehicle (still in coverage window).
    const now = new Date();
    const existingActive = await prisma.amcContract.findFirst({
      where: {
        vehicleId: body.vehicleId,
        status: 'ACTIVE',
        endDate: { gte: now },
      },
      select: { id: true, contractNumber: true },
    });
    if (existingActive) {
      throw new AppError(
        409,
        `Vehicle already has an active AMC contract (${existingActive.contractNumber}).`,
        'CONFLICT',
      );
    }

    // Race-safe contract number generation: wrap count+create in a transaction
    // and retry on unique-constraint collision (P2002 on contractNumber).
    const MAX_ATTEMPTS = 5;
    let contract: Awaited<ReturnType<typeof prisma.amcContract.create>> | null = null;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      try {
        contract = await prisma.$transaction(async (tx) => {
          const count = await tx.amcContract.count();
          const contractNumber = `AMC-${String(count + 1 + attempt).padStart(5, '0')}`;
          return tx.amcContract.create({
            data: {
              contractNumber,
              customerId: body.customerId,
              vehicleId: body.vehicleId,
              amcPlanId: body.amcPlanId,
              startDate,
              endDate,
              totalServices: plan.totalServicesIncluded,
              servicesRemaining: plan.totalServicesIncluded,
              amountPaid: body.amountPaid,
              paymentMode: body.paymentMode as any,
              paymentDate: body.paymentDate ? new Date(body.paymentDate) : new Date(),
              notes: body.notes,
            },
          });
        });
        break;
      } catch (err) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002' &&
          (err.meta?.target as string[] | undefined)?.includes('contractNumber')
        ) {
          // Collision on contractNumber under concurrency — retry with bumped counter.
          continue;
        }
        throw err;
      }
    }
    if (!contract) {
      throw new AppError(
        409,
        'Failed to allocate unique AMC contract number after retries.',
        'CONFLICT',
      );
    }
    return NextResponse.json({ success: true, data: contract }, { status: 201 });
  } catch (e) { return handleApiError(e); }
}
