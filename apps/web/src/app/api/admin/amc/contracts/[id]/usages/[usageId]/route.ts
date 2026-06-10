import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/auth';
import { handleApiError } from '@/lib/errors';
import { PERMISSIONS } from '@gearup/types';

export async function DELETE(_req: NextRequest, { params }: { params: { id: string; usageId: string } }) {
  try {
    requirePermission(PERMISSIONS.AMC_CONTRACTS_MANAGE);
    await prisma.$transaction(async (tx: any) => {
      // Verify usage belongs to this contract before deletion
      await tx.amcServiceUsage.findUniqueOrThrow({
        where: { id: params.usageId, amcContractId: params.id },
      });
      await tx.amcServiceUsage.delete({ where: { id: params.usageId } });
      const contract = await tx.amcContract.findUniqueOrThrow({
        where: { id: params.id },
        select: { totalServices: true, servicesRemaining: true },
      });
      // Guard: only decrement servicesUsed if > 0, and cap servicesRemaining at totalServices
      const nextRemaining = Math.min(contract.totalServices, contract.servicesRemaining + 1);
      await tx.amcContract.updateMany({
        where: { id: params.id, servicesUsed: { gt: 0 } },
        data: { servicesUsed: { decrement: 1 }, servicesRemaining: nextRemaining },
      });
    });
    return NextResponse.json({ success: true });
  } catch (e) { return handleApiError(e); }
}
