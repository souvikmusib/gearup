import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { paginate, paginationMeta } from '@/lib/pagination';
import { requirePermission } from '@/lib/auth';
import { handleApiError } from '@/lib/errors';
import { PERMISSIONS } from '@gearup/types';
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

    // Generate contract number
    const count = await prisma.amcContract.count();
    const contractNumber = `AMC-${String(count + 1).padStart(5, '0')}`;

    const contract = await prisma.amcContract.create({
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
    return NextResponse.json({ success: true, data: contract }, { status: 201 });
  } catch (e) { return handleApiError(e); }
}
