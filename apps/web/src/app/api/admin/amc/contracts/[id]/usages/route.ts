import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/auth';
import { handleApiError } from '@/lib/errors';
import { PERMISSIONS } from '@gearup/types';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    requirePermission(PERMISSIONS.AMC_CONTRACTS_VIEW);
    const usages = await prisma.amcServiceUsage.findMany({
      where: { amcContractId: params.id },
      orderBy: { serviceDate: 'desc' },
      include: { jobCard: { select: { id: true, jobCardNumber: true, status: true, issueSummary: true } } },
    });
    return NextResponse.json({ success: true, data: usages });
  } catch (e) { return handleApiError(e); }
}
