import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/auth';
import { AppError, handleApiError } from '@/lib/errors';
import { PERMISSIONS } from '@gearup/types';

const querySchema = z
  .object({
    from: z.string().date().optional(),
    to: z.string().date().optional(),
  })
  .refine((v) => !(v.from && v.to) || v.from <= v.to, {
    message: '`from` must be on or before `to`',
    path: ['from'],
  });

export async function GET(req: NextRequest) {
  try {
    requirePermission(PERMISSIONS.REPORTS_VIEW);
    const sp = req.nextUrl.searchParams;
    const parsed = querySchema.safeParse({
      from: sp.get('from') ?? undefined,
      to: sp.get('to') ?? undefined,
    });
    if (!parsed.success) {
      throw new AppError( 400, parsed.error.issues[0]?.message ?? 'Invalid query','VALIDATION_ERROR');
    }
    const { from, to } = parsed.data;
    const where: Record<string, unknown> = {};
    if (from && to) where.paymentDate = { gte: new Date(from), lte: new Date(to) };
    const [byMode, total] = await Promise.all([
      prisma.payment.groupBy({ by: ['paymentMode'], where, _sum: { amount: true }, _count: true }),
      prisma.payment.aggregate({ where, _sum: { amount: true } }),
    ]);
    return NextResponse.json({ success: true, data: { byMode: byMode.map((m) => ({ mode: m.paymentMode, _count: m._count, _sum: Number(m._sum.amount ?? 0) })), totalRevenue: Number(total._sum.amount ?? 0) } });
  } catch (e) { return handleApiError(e); }
}
