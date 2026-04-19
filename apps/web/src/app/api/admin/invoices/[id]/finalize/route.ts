import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/auth';
import { handleApiError } from '@/lib/errors';
import { logActivity } from '@/lib/activity-logger';
import { PERMISSIONS } from '@gearup/types';

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = requirePermission(PERMISSIONS.INVOICES_FINALIZE);
    const invoice = await prisma.invoice.update({
      where: { id: params.id },
      data: { invoiceStatus: 'FINALIZED', finalizedAt: new Date() },
    });
    await logActivity({ entityType: 'Invoice', entityId: invoice.id, action: 'invoice.finalized', actorType: 'ADMIN', actorId: user.sub });
    return NextResponse.json({ success: true, data: invoice });
  } catch (e) { return handleApiError(e); }
}
