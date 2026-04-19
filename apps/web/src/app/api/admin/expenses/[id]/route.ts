import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/auth';
import { handleApiError } from '@/lib/errors';
import { logActivity } from '@/lib/activity-logger';
import { PERMISSIONS } from '@gearup/types';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    requirePermission(PERMISSIONS.EXPENSES_VIEW);
    const expense = await prisma.expense.findUniqueOrThrow({ where: { id: params.id }, include: { category: true, createdBy: { select: { fullName: true } } } });
    return NextResponse.json({ success: true, data: expense });
  } catch (e) { return handleApiError(e); }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = requirePermission(PERMISSIONS.EXPENSES_MANAGE);
    await prisma.expense.delete({ where: { id: params.id } });
    await logActivity({ entityType: 'Expense', entityId: params.id, action: 'expense.deleted', actorType: 'ADMIN', actorId: user.sub });
    return NextResponse.json({ success: true });
  } catch (e) { return handleApiError(e); }
}
