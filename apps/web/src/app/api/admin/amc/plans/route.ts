import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/auth';
import { handleApiError } from '@/lib/errors';
import { PERMISSIONS } from '@gearup/types';
import { z } from 'zod';

const createSchema = z.object({
  planName: z.string().min(1),
  description: z.string().optional(),
  vehicleType: z.enum(['CAR', 'BIKE', 'SCOOTY', 'OTHER']),
  ccRange: z.string().optional(),
  durationMonths: z.number().int().positive(),
  totalServicesIncluded: z.number().int().positive(),
  price: z.number().positive(),
  extraDiscountPercent: z.number().min(0).max(100).default(0),
  laborDiscountPercent: z.number().min(0).max(100).default(100),
  coveredItems: z.array(z.string().min(1).max(200)).max(200).optional(),
  exclusions: z.string().optional(),
});

export async function GET() {
  try {
    requirePermission(PERMISSIONS.AMC_CONTRACTS_VIEW);
    const data = await prisma.amcPlan.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { contracts: true } } },
    });
    return NextResponse.json({ success: true, data });
  } catch (e) { return handleApiError(e); }
}

export async function POST(req: NextRequest) {
  try {
    requirePermission(PERMISSIONS.AMC_PLANS_MANAGE);
    const body = createSchema.parse(await req.json());
    const plan = await prisma.amcPlan.create({ data: body as any });
    return NextResponse.json({ success: true, data: plan }, { status: 201 });
  } catch (e) { return handleApiError(e); }
}
