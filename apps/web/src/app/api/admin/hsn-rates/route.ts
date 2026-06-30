import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/auth';
import { handleApiError } from '@/lib/errors';
import { invalidateHsnRateCache } from '@/lib/hsn-rate';
import { PERMISSIONS } from '@gearup/types';
import { z } from 'zod';

export async function GET(_req: NextRequest) {
  try {
    requirePermission(PERMISSIONS.SETTINGS_VIEW);
    const rates = await prisma.hsnRate.findMany({ orderBy: { hsnCode: 'asc' } });
    return NextResponse.json({ success: true, data: rates });
  } catch (e) { return handleApiError(e); }
}

const createSchema = z.object({
  hsnCode: z.string().trim().min(4).max(8),
  rate: z.number().min(0).max(100),
  description: z.string().trim().optional(),
});

export async function POST(req: NextRequest) {
  try {
    requirePermission(PERMISSIONS.SETTINGS_MANAGE);
    const body = createSchema.parse(await req.json());
    const rate = await prisma.hsnRate.upsert({
      where: { hsnCode: body.hsnCode },
      update: { rate: body.rate, description: body.description },
      create: body,
    });
    invalidateHsnRateCache();
    return NextResponse.json({ success: true, data: rate }, { status: 201 });
  } catch (e) { return handleApiError(e); }
}
