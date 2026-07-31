import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { paginate, paginationMeta } from '@/lib/pagination';
import { requirePermission } from '@/lib/auth';
import { handleApiError } from '@/lib/errors';
import { logActivity } from '@/lib/activity-logger';
import { PERMISSIONS } from '@gearup/types';
import { PaymentMode, Prisma } from '@prisma/client';
import { z } from 'zod';

const SALARY_CATEGORY_NAME = 'Salary';

/** Edit window: 2 hours after creation */
const EDIT_WINDOW_MS = 2 * 60 * 60 * 1000;

const lineItemSchema = z.object({
  label: z.string().min(1),
  amount: z.number().nonnegative(),
});

const salarySlipSchema = z.object({
  workerId: z.string().optional(),
  workerName: z.string().min(1),
  designation: z.string().optional(),
  lineItems: z.array(lineItemSchema).min(1, 'At least one line item required'),
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(2020).max(2099),
  paymentMode: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.nativeEnum(PaymentMode).optional(),
  ),
  notes: z.string().optional(),
});

/**
 * GET /api/admin/salary-slips — list salary slips (expenses with category = "Salary")
 */
export async function GET(req: NextRequest) {
  try {
    requirePermission(PERMISSIONS.EXPENSES_VIEW);
    const sp = req.nextUrl.searchParams;
    const page = Number(sp.get('page')) || 1;
    const pageSize = Number(sp.get('pageSize')) || 20;
    const month = sp.get('month') ? Number(sp.get('month')) : null;
    const year = sp.get('year') ? Number(sp.get('year')) : null;
    const search = sp.get('search') || '';

    const p = paginate({ page, pageSize });

    const category = await prisma.expenseCategory.findUnique({
      where: { categoryName: SALARY_CATEGORY_NAME },
    });
    if (!category) {
      return NextResponse.json({ success: true, data: [], meta: paginationMeta(0, page, pageSize) });
    }

    const where: Prisma.ExpenseWhereInput = { categoryId: category.id };

    if (search) {
      where.title = { contains: search, mode: 'insensitive' };
    }

    if (month && year) {
      const start = new Date(`${year}-${String(month).padStart(2, '0')}-01T00:00:00+05:30`);
      const end = new Date(start);
      end.setMonth(end.getMonth() + 1);
      where.expenseDate = { gte: start, lt: end };
    } else if (year) {
      const start = new Date(`${year}-01-01T00:00:00+05:30`);
      const end = new Date(`${year + 1}-01-01T00:00:00+05:30`);
      where.expenseDate = { gte: start, lt: end };
    }

    const [data, total] = await Promise.all([
      prisma.expense.findMany({
        where,
        ...p,
        orderBy: { expenseDate: 'desc' },
        include: {
          category: { select: { categoryName: true } },
          createdBy: { select: { fullName: true } },
        },
      }),
      prisma.expense.count({ where }),
    ]);

    // Enrich with editable flag
    const enriched = data.map((d: any) => ({
      ...d,
      editable: Date.now() - new Date(d.createdAt).getTime() < EDIT_WINDOW_MS,
    }));

    return NextResponse.json({ success: true, data: enriched, meta: paginationMeta(total, page, pageSize) });
  } catch (e) {
    return handleApiError(e);
  }
}

/**
 * POST /api/admin/salary-slips — create a salary slip (stored as Expense)
 * Line items stored as JSON in the `notes` field with a prefix marker.
 */
export async function POST(req: NextRequest) {
  try {
    const user = requirePermission(PERMISSIONS.EXPENSES_MANAGE);
    const body = salarySlipSchema.parse(await req.json());

    // Auto-fetch worker info if workerId provided
    let workerName = body.workerName;
    let designation = body.designation || '';
    if (body.workerId) {
      const worker = await prisma.worker.findUnique({
        where: { id: body.workerId },
        select: { fullName: true, designation: true },
      });
      if (worker) {
        workerName = worker.fullName;
        designation = designation || worker.designation || '';
      }
    }

    // Ensure "Salary" expense category exists
    const category = await prisma.expenseCategory.upsert({
      where: { categoryName: SALARY_CATEGORY_NAME },
      create: { categoryName: SALARY_CATEGORY_NAME, description: 'Monthly salary payments to workers' },
      update: {},
    });

    const totalAmount = body.lineItems.reduce((sum, li) => sum + li.amount, 0);

    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const title = `Salary - ${workerName} - ${monthNames[body.month - 1]} ${body.year}`;

    // Store metadata as JSON in notes field
    const metadata = {
      __salarySlip: true,
      workerName,
      designation,
      month: body.month,
      year: body.year,
      lineItems: body.lineItems,
      userNotes: body.notes || '',
    };

    const expense = await prisma.expense.create({
      data: {
        expenseDate: new Date(),
        categoryId: category.id,
        title,
        amount: totalAmount,
        vendorName: workerName,
        paymentMode: body.paymentMode,
        notes: JSON.stringify(metadata),
        createdByAdminId: user.sub,
      },
    });

    logActivity({
      entityType: 'SalarySlip',
      entityId: expense.id,
      action: 'salary-slip.created',
      newValue: { workerName, designation, totalAmount, lineItems: body.lineItems, month: body.month, year: body.year },
      actorType: 'ADMIN',
      actorId: user.sub,
    });

    const slipUrl = `/api/admin/salary-slips/${expense.id}/pdf`;

    return NextResponse.json(
      { success: true, data: { ...expense, workerName, designation, slipUrl } },
      { status: 201 },
    );
  } catch (e) {
    return handleApiError(e);
  }
}
