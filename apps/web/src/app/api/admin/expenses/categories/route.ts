import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/auth';
import { handleApiError } from '@/lib/errors';
import { logActivity } from '@/lib/activity-logger';
import { PERMISSIONS } from '@gearup/types';
import { z } from 'zod';

export async function GET() {
  try {
    requirePermission(PERMISSIONS.EXPENSES_VIEW);
    const data = await prisma.expenseCategory.findMany({ orderBy: { categoryName: 'asc' }, include: { _count: { select: { expenses: true } } } });
    return NextResponse.json({ success: true, data });
  } catch (e) { return handleApiError(e); }
}

export async function POST(req: NextRequest) {
  try {
    const user = requirePermission(PERMISSIONS.EXPENSES_MANAGE);
    const body = z.object({ categoryName: z.string().min(1), description: z.string().optional() }).parse(await req.json());
    const cat = await prisma.expenseCategory.create({ data: body });
    logActivity({ entityType: 'ExpenseCategory', entityId: cat.id, action: 'expense-category.created', newValue: cat, actorType: 'ADMIN', actorId: user.sub });
    return NextResponse.json({ success: true, data: cat }, { status: 201 });
  } catch (e) { return handleApiError(e); }
}
