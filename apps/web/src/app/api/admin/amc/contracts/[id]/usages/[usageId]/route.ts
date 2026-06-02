import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/auth';
import { handleApiError } from '@/lib/errors';
import { PERMISSIONS } from '@gearup/types';

export async function DELETE(_req: NextRequest, { params }: { params: { id: string; usageId: string } }) {
  try {
    requirePermission(PERMISSIONS.AMC_CONTRACTS_MANAGE);
    await prisma.$transaction(async (tx: any) => {
      await tx.amcServiceUsage.delete({ where: { id: params.usageId } });
      await tx.amcContract.update({
        where: { id: params.id },
        data: { servicesUsed: { decrement: 1 }, servicesRemaining: { increment: 1 } },
      });
    });
    return NextResponse.json({ success: true });
  } catch (e) { return handleApiError(e); }
}
