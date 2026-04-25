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
    if (from && to) where.expenseDate = { gte: new Date(from), lte: new Date(to) };
    const [byCategory, total] = await Promise.all([
      prisma.expense.groupBy({ by: ['categoryId'], where, _sum: { amount: true }, _count: true }),
      prisma.expense.aggregate({ where, _sum: { amount: true } }),
    ]);
    const categories = await prisma.expenseCategory.findMany({ select: { id: true, categoryName: true } });
    const catMap = Object.fromEntries(categories.map((c) => [c.id, c.categoryName]));
    return NextResponse.json({ success: true, data: { byCategory: byCategory.map((b) => ({ categoryId: b.categoryId, category: catMap[b.categoryId] || b.categoryId, _count: b._count, _sum: Number(b._sum.amount ?? 0) })), totalExpenses: Number(total._sum.amount ?? 0) } });
  } catch (e) { return handleApiError(e); }
}
