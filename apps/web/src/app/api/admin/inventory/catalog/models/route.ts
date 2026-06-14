import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/auth';
import { handleApiError } from '@/lib/errors';
import { PERMISSIONS } from '@gearup/types';
import { z } from 'zod';

export async function POST(req: NextRequest) {
  try {
    requirePermission(PERMISSIONS.INVENTORY_EDIT);
    const body = z.object({
      brandId: z.string().min(1),
      name: z.string().min(1),
      engineCC: z.number().optional(),
    }).parse(await req.json());

    const model = await prisma.vehicleModel.upsert({
      where: { brandId_name: { brandId: body.brandId, name: body.name } },
      update: {},
      create: { brandId: body.brandId, name: body.name, engineCC: body.engineCC },
    });
    return NextResponse.json({ success: true, data: model }, { status: 201 });
  } catch (e) { return handleApiError(e); }
}
