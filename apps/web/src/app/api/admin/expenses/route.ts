import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { paginate, paginationMeta } from '@/lib/pagination';
import { requirePermission } from '@/lib/auth';
import { handleApiError } from '@/lib/errors';
import { logActivity } from '@/lib/activity-logger';
import { PERMISSIONS } from '@gearup/types';
import { z } from 'zod';

export async function GET(req: NextRequest) {
  try {
    requirePermission(PERMISSIONS.EXPENSES_VIEW);
    const sp = req.nextUrl.searchParams;
    const page = Number(sp.get('page')) || 1;
    const pageSize = Number(sp.get('pageSize')) || 20;
    const categoryId = sp.get('categoryId') || '';
    const p = paginate({ page, pageSize });
    const where: Record<string, unknown> = {};
    if (categoryId) where.categoryId = categoryId;
    const [data, total] = await Promise.all([
      prisma.expense.findMany({ where, ...p, orderBy: { expenseDate: 'desc' }, include: { category: { select: { categoryName: true } }, createdBy: { select: { fullName: true } } } }),
      prisma.expense.count({ where }),
    ]);
    return NextResponse.json({ success: true, data, meta: paginationMeta(total, page, pageSize) });
  } catch (e) { return handleApiError(e); }
}

export async function POST(req: NextRequest) {
  try {
    const user = requirePermission(PERMISSIONS.EXPENSES_MANAGE);
    const body = z.object({
      expenseDate: z.string(), categoryId: z.string(), title: z.string(), amount: z.number(),
      vendorName: z.string().optional(), paymentMode: z.string().optional(), referenceNumber: z.string().optional(),
      notes: z.string().optional(),
    }).parse(await req.json());
    const expense = await prisma.expense.create({ data: { ...body, expenseDate: new Date(body.expenseDate), paymentMode: body.paymentMode as any, createdByAdminId: user.sub } as any });
    logActivity({ entityType: 'Expense', entityId: expense.id, action: 'expense.created', newValue: expense, actorType: 'ADMIN', actorId: user.sub });
    return NextResponse.json({ success: true, data: expense }, { status: 201 });
  } catch (e) { return handleApiError(e); }
}
