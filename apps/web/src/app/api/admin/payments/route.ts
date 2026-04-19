import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { paginate, paginationMeta } from '@/lib/pagination';
import { requirePermission } from '@/lib/auth';
import { handleApiError } from '@/lib/errors';
import { PERMISSIONS } from '@gearup/types';

export async function GET(req: NextRequest) {
  try {
    requirePermission(PERMISSIONS.PAYMENTS_RECORD);
    const sp = req.nextUrl.searchParams;
    const page = Number(sp.get('page')) || 1;
    const pageSize = Number(sp.get('pageSize')) || 20;
    const p = paginate({ page, pageSize });
    const [data, total] = await Promise.all([
      prisma.payment.findMany({ ...p, orderBy: { paymentDate: 'desc' }, include: { invoice: { select: { invoiceNumber: true, customer: { select: { fullName: true } } } } } }),
      prisma.payment.count(),
    ]);
    return NextResponse.json({ success: true, data, meta: paginationMeta(total, page, pageSize) });
  } catch (e) { return handleApiError(e); }
}
