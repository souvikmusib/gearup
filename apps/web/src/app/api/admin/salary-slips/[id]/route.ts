import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/auth';
import { handleApiError } from '@/lib/errors';
import { logActivity } from '@/lib/activity-logger';
import { PERMISSIONS } from '@gearup/types';
import { PaymentMode } from '@prisma/client';
import { z } from 'zod';

/** Edit window: 2 hours after creation */
const EDIT_WINDOW_MS = 2 * 60 * 60 * 1000;

const lineItemSchema = z.object({
  label: z.string().min(1),
  amount: z.number().nonnegative(),
});

const updateSchema = z.object({
  workerName: z.string().min(1).optional(),
  designation: z.string().optional(),
  lineItems: z.array(lineItemSchema).min(1).optional(),
  month: z.number().int().min(1).max(12).optional(),
  year: z.number().int().min(2020).max(2099).optional(),
  paymentMode: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.nativeEnum(PaymentMode).optional(),
  ),
  notes: z.string().optional(),
});

/**
 * PATCH /api/admin/salary-slips/[id] — edit (only within 2 hour window)
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = requirePermission(PERMISSIONS.EXPENSES_MANAGE);

    const expense = await prisma.expense.findUniqueOrThrow({ where: { id: params.id } });

    const elapsed = Date.now() - new Date(expense.createdAt).getTime();
    if (elapsed > EDIT_WINDOW_MS) {
      return NextResponse.json(
        { success: false, error: { code: 'EDIT_WINDOW_CLOSED', message: 'Edit window (2 hours) has passed. You can only delete this slip now.' } },
        { status: 403 },
      );
    }

    const body = updateSchema.parse(await req.json());

    // Parse existing metadata
    let metadata: any = {};
    try { metadata = JSON.parse(expense.notes || '{}'); } catch { /* ignore */ }

    const workerName = body.workerName || metadata.workerName || expense.vendorName || '';
    const designation = body.designation ?? metadata.designation ?? '';
    const lineItems = body.lineItems || metadata.lineItems || [];
    const month = body.month ?? metadata.month;
    const year = body.year ?? metadata.year;
    const totalAmount = lineItems.reduce((sum: number, li: any) => sum + li.amount, 0);

    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const title = `Salary - ${workerName} - ${monthNames[(month || 1) - 1]} ${year || new Date().getFullYear()}`;

    const newMetadata = {
      __salarySlip: true,
      workerName,
      designation,
      month,
      year,
      lineItems,
      userNotes: body.notes ?? metadata.userNotes ?? '',
    };

    const updated = await prisma.expense.update({
      where: { id: params.id },
      data: {
        title,
        amount: totalAmount,
        vendorName: workerName,
        paymentMode: body.paymentMode ?? expense.paymentMode,
        notes: JSON.stringify(newMetadata),
      },
    });

    logActivity({
      entityType: 'SalarySlip',
      entityId: expense.id,
      action: 'salary-slip.updated',
      newValue: { workerName, totalAmount, lineItems },
      actorType: 'ADMIN',
      actorId: user.sub,
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (e) {
    return handleApiError(e);
  }
}

/**
 * DELETE /api/admin/salary-slips/[id] — delete the salary slip (and the expense)
 */
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = requirePermission(PERMISSIONS.EXPENSES_MANAGE);

    const expense = await prisma.expense.findUniqueOrThrow({ where: { id: params.id } });

    await prisma.expense.delete({ where: { id: params.id } });

    logActivity({
      entityType: 'SalarySlip',
      entityId: expense.id,
      action: 'salary-slip.deleted',
      previousValue: expense,
      actorType: 'ADMIN',
      actorId: user.sub,
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    return handleApiError(e);
  }
}
