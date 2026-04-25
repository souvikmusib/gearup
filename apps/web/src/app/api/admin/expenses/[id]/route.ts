import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/auth';
import { handleApiError } from '@/lib/errors';
import { logActivity } from '@/lib/activity-logger';
import { PERMISSIONS } from '@gearup/types';
import { z } from 'zod';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    requirePermission(PERMISSIONS.EXPENSES_VIEW);
    const expense = await prisma.expense.findUniqueOrThrow({ where: { id: params.id }, include: { category: true, createdBy: { select: { fullName: true } } } });
    return NextResponse.json({ success: true, data: expense });
  } catch (e) { return handleApiError(e); }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = requirePermission(PERMISSIONS.EXPENSES_MANAGE);
    const body = z.object({
      expenseDate: z.string().optional(), categoryId: z.string().optional(), title: z.string().optional(),
      amount: z.number().optional(), vendorName: z.string().nullable().optional(),
      paymentMode: z.string().optional(), notes: z.string().nullable().optional(),
    }).parse(await req.json());
    const data: Record<string, unknown> = { ...body };
    if (body.expenseDate) data.expenseDate = new Date(body.expenseDate);
    if (body.paymentMode) data.paymentMode = body.paymentMode as any;
    const expense = await prisma.expense.update({ where: { id: params.id }, data });
    logActivity({ entityType: 'Expense', entityId: expense.id, action: 'expense.updated', newValue: body, actorType: 'ADMIN', actorId: user.sub });
    return NextResponse.json({ success: true, data: expense });
  } catch (e) { return handleApiError(e); }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = requirePermission(PERMISSIONS.EXPENSES_MANAGE);
    await prisma.expense.delete({ where: { id: params.id } });
    logActivity({ entityType: 'Expense', entityId: params.id, action: 'expense.deleted', actorType: 'ADMIN', actorId: user.sub });
    return NextResponse.json({ success: true });
  } catch (e) { return handleApiError(e); }
}
