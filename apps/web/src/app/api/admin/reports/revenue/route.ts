import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/auth';
import { handleApiError } from '@/lib/errors';
import { PERMISSIONS } from '@gearup/types';

export async function GET(req: NextRequest) {
  try {
    requirePermission(PERMISSIONS.REPORTS_VIEW);
    const sp = req.nextUrl.searchParams;
    const from = sp.get('from'); const to = sp.get('to');
    const where: Record<string, unknown> = {};
    if (from && to) where.paymentDate = { gte: new Date(from), lte: new Date(to) };
    const [byMode, total] = await Promise.all([
      prisma.payment.groupBy({ by: ['paymentMode'], where, _sum: { amount: true }, _count: true }),
      prisma.payment.aggregate({ where, _sum: { amount: true } }),
    ]);
    return NextResponse.json({ success: true, data: { byMode: byMode.map((m) => ({ mode: m.paymentMode, _count: m._count, _sum: Number(m._sum.amount ?? 0) })), totalRevenue: Number(total._sum.amount ?? 0) } });
  } catch (e) { return handleApiError(e); }
}
