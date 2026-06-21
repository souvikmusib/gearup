import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/auth';
import { handleApiError } from '@/lib/errors';
import { PERMISSIONS } from '@gearup/types';
import { z } from 'zod';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    requirePermission(PERMISSIONS.AMC_CONTRACTS_VIEW);
    const plan = await prisma.amcPlan.findUniqueOrThrow({
      where: { id: params.id },
      include: { contracts: { orderBy: { createdAt: 'desc' }, take: 20, include: { customer: { select: { fullName: true } }, vehicle: { select: { registrationNumber: true } } } } },
    });
    return NextResponse.json({ success: true, data: plan });
  } catch (e) { return handleApiError(e); }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    requirePermission(PERMISSIONS.AMC_PLANS_MANAGE);
    const body = z.object({
      planName: z.string().optional(),
      description: z.string().optional(),
      ccRange: z.string().optional(),
      durationMonths: z.number().int().positive().optional(),
      totalServicesIncluded: z.number().int().positive().optional(),
      price: z.number().positive().optional(),
      mrpPrice: z.number().positive().nullable().optional(),
      extraDiscountPercent: z.number().min(0).max(100).optional(),
      laborDiscountPercent: z.number().min(0).max(100).optional(),
      coveredItems: z.array(z.string().min(1).max(200)).max(200).optional(),
      exclusions: z.string().optional(),
      isActive: z.boolean().optional(),
    }).parse(await req.json());
    const plan = await prisma.amcPlan.update({ where: { id: params.id }, data: body as any });
    return NextResponse.json({ success: true, data: plan });
  } catch (e) { return handleApiError(e); }
}

// DELETE is restricted to plans that have NEVER had a contract. Once any
// contract references a plan, it is permanently retained for historical/
// audit integrity — use `isActive: false` (via PATCH) as the canonical
// "archived" state to hide it from selection lists.
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    requirePermission(PERMISSIONS.AMC_PLANS_MANAGE);
    const contracts = await prisma.amcContract.count({ where: { amcPlanId: params.id } });
    if (contracts > 0) {
      return NextResponse.json({ success: false, error: { message: `Cannot delete — plan has ${contracts} contract(s). Deactivate instead.` } }, { status: 409 });
    }
    await prisma.amcPlan.delete({ where: { id: params.id } });
    return NextResponse.json({ success: true });
  } catch (e) { return handleApiError(e); }
}
