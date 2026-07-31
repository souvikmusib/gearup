import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/auth';
import { handleApiError } from '@/lib/errors';
import { PERMISSIONS } from '@gearup/types';
import { generateSalarySlipHTML } from '@/lib/salary-slip-template';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    requirePermission(PERMISSIONS.EXPENSES_VIEW);

    const expense = await prisma.expense.findUniqueOrThrow({
      where: { id: params.id },
    });

    // Parse metadata from notes (JSON format)
    let metadata: any = {};
    try { metadata = JSON.parse(expense.notes || '{}'); } catch { /* fallback below */ }

    const workerName = metadata.workerName || expense.vendorName || 'Unknown';
    const designation = metadata.designation || undefined;
    const month = metadata.month || (new Date(expense.expenseDate).getMonth() + 1);
    const year = metadata.year || new Date(expense.expenseDate).getFullYear();
    const lineItems = metadata.lineItems || [{ label: 'Salary', amount: Number(expense.amount) }];
    const userNotes = metadata.userNotes || undefined;

    const settingsRaw = await prisma.setting.findMany();
    const settings = Object.fromEntries(settingsRaw.map((s: any) => [s.key, s.value]));
    const logoUrl = `${req.nextUrl.origin}/brand/gearup.svg`;

    const html = generateSalarySlipHTML(
      {
        workerName,
        designation,
        month,
        year,
        lineItems,
        paymentMode: expense.paymentMode || undefined,
        paymentDate: expense.expenseDate,
        notes: userNotes,
      },
      settings,
      logoUrl,
    );

    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Disposition': `inline; filename="salary-slip-${workerName.replace(/\s+/g, '-').toLowerCase()}-${month}-${year}.html"`,
      },
    });
  } catch (e) {
    return handleApiError(e);
  }
}
