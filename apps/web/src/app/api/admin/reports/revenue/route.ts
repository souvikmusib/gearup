import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/auth';
import { AppError, handleApiError } from '@/lib/errors';
import { PERMISSIONS } from '@gearup/types';

const querySchema = z
  .object({
    from: z.string().date().optional(),
    to: z.string().date().optional(),
  })
  .refine((v) => !(v.from && v.to) || v.from <= v.to, {
    message: '`from` must be on or before `to`',
    path: ['from'],
  });

export async function GET(req: NextRequest) {
  try {
    requirePermission(PERMISSIONS.REPORTS_VIEW);
    const sp = req.nextUrl.searchParams;
    const parsed = querySchema.safeParse({
      from: sp.get('from') ?? undefined,
      to: sp.get('to') ?? undefined,
    });
    if (!parsed.success) {
      throw new AppError(400, parsed.error.issues[0]?.message ?? 'Invalid query', 'VALIDATION_ERROR');
    }
    const { from, to } = parsed.data;
    const paymentWhere: Record<string, unknown> = {};
    if (from && to) paymentWhere.paymentDate = { gte: new Date(from), lte: new Date(to) };

    // Date bounds for raw aggregates — zod has already validated YYYY-MM-DD shape,
    // and we pass them as bind parameters anyway.
    const hasRange = Boolean(from && to);
    const rangeArgs = hasRange ? [from as string, to as string] : [];
    const payRange = hasRange ? `WHERE "paymentDate" BETWEEN $1::date AND $2::date` : '';
    const invRange = hasRange ? `AND i."invoiceDate" BETWEEN $1::date AND $2::date` : '';

    const [byMode, total, daily, byType, byWorker, workerJobValue] = await Promise.all([
      prisma.payment.groupBy({ by: ['paymentMode'], where: paymentWhere, _sum: { amount: true }, _count: true }),
      prisma.payment.aggregate({ where: paymentWhere, _sum: { amount: true } }),
      // Revenue trend: payment totals per calendar day
      prisma.$queryRawUnsafe<{ date: string; amount: number }[]>(
        `SELECT to_char("paymentDate"::date, 'YYYY-MM-DD') AS date, SUM(amount)::float AS amount
         FROM "Payment" ${payRange}
         GROUP BY 1 ORDER BY 1`,
        ...rangeArgs,
      ),
      // Revenue by category: finalized-invoice line items bucketed LABOR / PART / other
      prisma.$queryRawUnsafe<{ type: string; total: number }[]>(
        `SELECT CASE WHEN li."lineType" IN ('LABOR','PART') THEN li."lineType"::text ELSE 'OTHER' END AS type,
                SUM(li."lineTotal")::float AS total
         FROM "InvoiceLineItem" li
         JOIN "Invoice" i ON i.id = li."invoiceId"
         WHERE i."invoiceStatus" = 'FINALIZED' ${invRange}
         GROUP BY 1 ORDER BY total DESC`,
        ...rangeArgs,
      ),
      // Labor revenue per worker. Labor lines carry "Labor — <NAME>"; match against
      // Worker.fullName (whitespace-collapsed, case-folded). Unmatched lines surface
      // as 'Unattributed' rather than inventing names.
      prisma.$queryRawUnsafe<{ name: string; total: number }[]>(
        `SELECT COALESCE(w."fullName", 'Unattributed') AS name, SUM(li."lineTotal")::float AS total
         FROM "InvoiceLineItem" li
         JOIN "Invoice" i ON i.id = li."invoiceId"
         LEFT JOIN "Worker" w
           ON regexp_replace(upper(trim(substring(li.description FROM '[—-]\\s*(.*)$'))), '\\s+', ' ', 'g')
            = regexp_replace(upper(trim(w."fullName")), '\\s+', ' ', 'g')
         WHERE li."lineType" = 'LABOR' AND i."invoiceStatus" = 'FINALIZED' ${invRange}
         GROUP BY 1 ORDER BY total DESC`,
        ...rangeArgs,
      ),
      // Total job-card value per assigned worker (PAID invoices), with paid-job counts
      prisma.$queryRawUnsafe<{ name: string; total: number; jobs: number }[]>(
        `SELECT w."fullName" AS name, SUM(i."grandTotal")::float AS total, COUNT(DISTINCT i.id)::int AS jobs
         FROM "WorkerAssignment" wa
         JOIN "Worker" w ON w.id = wa."workerId"
         JOIN "Invoice" i ON i."jobCardId" = wa."jobCardId"
         WHERE i."paymentStatus" = 'PAID' ${invRange}
         GROUP BY 1 ORDER BY total DESC`,
        ...rangeArgs,
      ),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        byMode: byMode.map((m) => ({ mode: m.paymentMode, _count: m._count, _sum: Number(m._sum.amount ?? 0) })),
        totalRevenue: Number(total._sum.amount ?? 0),
        daily,
        byType,
        byWorker,
        workerJobValue,
      },
    });
  } catch (e) {
    return handleApiError(e);
  }
}
