import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/auth';
import { handleApiError } from '@/lib/errors';
import { logActivity } from '@/lib/activity-logger';
import { PERMISSIONS } from '@gearup/types';
import { z } from 'zod';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = requirePermission(PERMISSIONS.EXPENSES_MANAGE);
    const body = z.object({ categoryName: z.string().min(1).optional(), description: z.string().nullable().optional() }).parse(await req.json());
    const cat = await prisma.expenseCategory.update({ where: { id: params.id }, data: body });
    logActivity({ entityType: 'ExpenseCategory', entityId: cat.id, action: 'expense-category.updated', newValue: body, actorType: 'ADMIN', actorId: user.sub });
    return NextResponse.json({ success: true, data: cat });
  } catch (e) { return handleApiError(e); }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = requirePermission(PERMISSIONS.EXPENSES_MANAGE);
    await prisma.expenseCategory.delete({ where: { id: params.id } });
    logActivity({ entityType: 'ExpenseCategory', entityId: params.id, action: 'expense-category.deleted', actorType: 'ADMIN', actorId: user.sub });
    return NextResponse.json({ success: true });
  } catch (e) { return handleApiError(e); }
}
