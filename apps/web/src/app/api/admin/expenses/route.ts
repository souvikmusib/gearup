import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { paginate, paginationMeta } from '@/lib/pagination';
import { requirePermission } from '@/lib/auth';
import { handleApiError } from '@/lib/errors';
import { logActivity } from '@/lib/activity-logger';
import { PERMISSIONS } from '@gearup/types';
import { PaymentMode, Prisma } from '@prisma/client';
import { z } from 'zod';

export async function GET(req: NextRequest) {
  try {
    requirePermission(PERMISSIONS.EXPENSES_VIEW);
    const sp = req.nextUrl.searchParams;
    const page = Number(sp.get('page')) || 1;
    const pageSize = Number(sp.get('pageSize')) || 20;
    const categoryId = sp.get('categoryId') || '';
    const search = sp.get('search') || '';
    const paymentMode = sp.get('paymentMode') || '';
    const from = sp.get('from') || '';
    const to = sp.get('to') || '';
    const p = paginate({ page, pageSize });
    const where: Prisma.ExpenseWhereInput = {};
    if (categoryId) where.categoryId = categoryId;
    if (paymentMode) where.paymentMode = paymentMode as PaymentMode;
    if (search) where.OR = [{ title: { contains: search, mode: 'insensitive' } }, { vendorName: { contains: search, mode: 'insensitive' } }];
    if (from || to) {
      const range: Prisma.DateTimeFilter = {};
      if (from) range.gte = new Date(from + 'T00:00:00+05:30');
      if (to) range.lte = new Date(to + 'T23:59:59+05:30');
      where.expenseDate = range;
    }
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
      expenseDate: z.string(), categoryId: z.string(), title: z.string(),
      amount: z.number().nonnegative().multipleOf(0.01).max(99999999.99),
      vendorName: z.string().optional(), paymentMode: z.preprocess(v => v === '' ? undefined : v, z.nativeEnum(PaymentMode).optional()), referenceNumber: z.string().optional(),
      notes: z.string().optional(),
    }).parse(await req.json());
    const expense = await prisma.expense.create({
      data: {
        expenseDate: new Date(body.expenseDate),
        categoryId: body.categoryId,
        title: body.title,
        amount: body.amount,
        vendorName: body.vendorName,
        paymentMode: body.paymentMode,
        referenceNumber: body.referenceNumber,
        notes: body.notes,
        createdByAdminId: user.sub,
      },
    });
    logActivity({ entityType: 'Expense', entityId: expense.id, action: 'expense.created', newValue: expense, actorType: 'ADMIN', actorId: user.sub });
    return NextResponse.json({ success: true, data: expense }, { status: 201 });
  } catch (e) { return handleApiError(e); }
}
