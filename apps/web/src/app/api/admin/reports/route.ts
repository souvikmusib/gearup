import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/auth';
import { AppError, handleApiError } from '@/lib/errors';
import { PERMISSIONS } from '@gearup/types';

const MAX_REVENUE_RANGE_DAYS = 366; // cap reporting window at ~12 months
const D = (v: unknown) => new Prisma.Decimal((v as Prisma.Decimal | number | string | null | undefined) ?? 0);

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const type = sp.get('type') || 'dashboard';
    const from = sp.get('from'); const to = sp.get('to');

    if (type === 'dashboard') {
      requirePermission(PERMISSIONS.DASHBOARD_VIEW);
    } else {
      requirePermission(PERMISSIONS.REPORTS_VIEW);
    }

    if (type === 'dashboard') {
      // Use IST (UTC+5:30) for "today" boundaries
      const now = new Date();
      const istOffset = 5.5 * 60 * 60 * 1000;
      const istNow = new Date(now.getTime() + istOffset);
      const today = new Date(istNow.toISOString().slice(0, 10) + 'T00:00:00+05:30');
      const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
      const [
        todayAppointments,
        pendingRequests,
        activeJobs,
        unpaidInvoices,
        todayRevenue,
        totalCustomers,
        totalVehicles,
        activeWorkers,
      ] = await Promise.all([
        prisma.appointment.count({ where: { appointmentDate: { gte: today, lt: tomorrow }, status: { notIn: ['CANCELLED', 'NO_SHOW'] } } }),
        prisma.serviceRequest.count({ where: { status: { in: ['SUBMITTED', 'UNDER_REVIEW'] } } }),
        prisma.jobCard.count({ where: { status: { notIn: ['DELIVERED', 'CANCELLED', 'CLOSED'] } } }),
        prisma.invoice.count({ where: { invoiceStatus: 'FINALIZED', paymentStatus: { in: ['UNPAID', 'PARTIALLY_PAID'] } } }),
        prisma.payment.aggregate({ where: { paymentDate: { gte: today, lt: tomorrow } }, _sum: { amount: true } }),
        prisma.customer.count(),
        prisma.vehicle.count(),
        prisma.worker.count({ where: { status: 'ACTIVE' } }),
      ]);
      return NextResponse.json({
        success: true,
        data: {
          todayAppointments,
          pendingRequests,
          activeJobs,
          unpaidInvoices,
          todayRevenue: D(todayRevenue._sum.amount).toFixed(2),
          totalCustomers,
          totalVehicles,
          activeWorkers,
        },
      });
    }

    if (type === 'revenue') {
      // Resolve & validate range. Cap at MAX_REVENUE_RANGE_DAYS to keep this endpoint
      // bounded; callers needing larger windows must paginate by sub-range.
      let rangeFrom: Date | null = null;
      let rangeTo: Date | null = null;
      if (from && to) {
        rangeFrom = new Date(from + 'T00:00:00+05:30');
        rangeTo = new Date(to + 'T23:59:59+05:30');
        if (Number.isNaN(rangeFrom.getTime()) || Number.isNaN(rangeTo.getTime()) || rangeFrom > rangeTo) {
          throw new AppError( 400, 'Invalid from/to date range','VALIDATION_ERROR');
        }
        const spanDays = Math.ceil((rangeTo.getTime() - rangeFrom.getTime()) / (24 * 60 * 60 * 1000));
        if (spanDays > MAX_REVENUE_RANGE_DAYS) {
          throw new AppError(400, `Revenue range cannot exceed ${MAX_REVENUE_RANGE_DAYS} days`, 'VALIDATION_ERROR');
        }
      }
      const where: Prisma.PaymentWhereInput = {};
      if (rangeFrom && rangeTo) where.paymentDate = { gte: rangeFrom, lte: rangeTo };

      // byMode + total via Prisma aggregations (small result sets).
      const [payments, total] = await Promise.all([
        prisma.payment.groupBy({ by: ['paymentMode'], where, _sum: { amount: true }, _count: true }),
        prisma.payment.aggregate({ where, _sum: { amount: true } }),
      ]);

      // Daily roll-up in IST — push GROUP BY to Postgres so we don't stream every payment.
      // date_trunc with the 'Asia/Kolkata' zone gives the local-day bucket; casting to date
      // then to text yields the YYYY-MM-DD label we serialised before.
      const dailyRows = rangeFrom && rangeTo
        ? await prisma.$queryRaw<Array<{ date: string; amount: Prisma.Decimal }>>(
            Prisma.sql`
              SELECT to_char(date_trunc('day', "paymentDate" AT TIME ZONE 'Asia/Kolkata'), 'YYYY-MM-DD') AS date,
                     COALESCE(SUM(amount), 0)::numeric AS amount
              FROM "Payment"
              WHERE "paymentDate" >= ${rangeFrom} AND "paymentDate" <= ${rangeTo}
              GROUP BY 1
              ORDER BY 1 ASC
            `,
          )
        : await prisma.$queryRaw<Array<{ date: string; amount: Prisma.Decimal }>>(
            Prisma.sql`
              SELECT to_char(date_trunc('day', "paymentDate" AT TIME ZONE 'Asia/Kolkata'), 'YYYY-MM-DD') AS date,
                     COALESCE(SUM(amount), 0)::numeric AS amount
              FROM "Payment"
              GROUP BY 1
              ORDER BY 1 ASC
            `,
          );
      const daily = dailyRows.map((r) => ({ date: r.date, amount: D(r.amount).toFixed(2) }));

      // Revenue by line type — SUM the LineItem totals for invoices that received a
      // payment in the window. JOIN done in SQL so we never materialise the row set.
      const byTypeRows = await prisma.$queryRaw<Array<{ lineType: string; total: Prisma.Decimal }>>(
        rangeFrom && rangeTo
          ? Prisma.sql`
              SELECT li."lineType"::text AS "lineType",
                     COALESCE(SUM(li."lineTotal"), 0)::numeric AS total
              FROM "InvoiceLineItem" li
              WHERE li."invoiceId" IN (
                SELECT DISTINCT p."invoiceId" FROM "Payment" p
                WHERE p."paymentDate" >= ${rangeFrom} AND p."paymentDate" <= ${rangeTo}
              )
              GROUP BY li."lineType"
            `
          : Prisma.sql`
              SELECT li."lineType"::text AS "lineType",
                     COALESCE(SUM(li."lineTotal"), 0)::numeric AS total
              FROM "InvoiceLineItem" li
              WHERE li."invoiceId" IN (SELECT DISTINCT p."invoiceId" FROM "Payment" p)
              GROUP BY li."lineType"
            `,
      );

      // byWorker — labor revenue attributed by joining
      // InvoiceLineItem(LABOR) -> Invoice -> JobCard -> WorkerAssignment -> Worker.
      // Each invoice's LABOR total is split equally across the assigned workers on its
      // job card (active or historical). Invoices with no assignment fall into 'Unassigned'.
      // This replaces the prior string-parse on li.description which silently broke on
      // any phrasing change.
      const byWorkerRows = await prisma.$queryRaw<Array<{ name: string; total: Prisma.Decimal }>>(
        rangeFrom && rangeTo
          ? Prisma.sql`
              WITH paid_invoices AS (
                SELECT DISTINCT p."invoiceId" AS id
                FROM "Payment" p
                WHERE p."paymentDate" >= ${rangeFrom} AND p."paymentDate" <= ${rangeTo}
              ),
              labor_per_invoice AS (
                SELECT li."invoiceId", COALESCE(SUM(li."lineTotal"), 0)::numeric AS labor_total
                FROM "InvoiceLineItem" li
                WHERE li."lineType" = 'LABOR'
                  AND li."invoiceId" IN (SELECT id FROM paid_invoices)
                GROUP BY li."invoiceId"
              ),
              invoice_workers AS (
                SELECT i.id AS invoice_id, w.id AS worker_id, w."fullName" AS name
                FROM "Invoice" i
                JOIN "WorkerAssignment" wa ON wa."jobCardId" = i."jobCardId"
                JOIN "Worker" w ON w.id = wa."workerId"
                WHERE i.id IN (SELECT id FROM paid_invoices)
              ),
              worker_counts AS (
                SELECT invoice_id, COUNT(*)::numeric AS n
                FROM invoice_workers
                GROUP BY invoice_id
              )
              SELECT name, SUM(share)::numeric AS total
              FROM (
                SELECT iw.name, (lpi.labor_total / wc.n) AS share
                FROM labor_per_invoice lpi
                JOIN invoice_workers iw ON iw.invoice_id = lpi."invoiceId"
                JOIN worker_counts wc ON wc.invoice_id = lpi."invoiceId"
                UNION ALL
                SELECT 'Unassigned' AS name, lpi.labor_total AS share
                FROM labor_per_invoice lpi
                WHERE NOT EXISTS (SELECT 1 FROM invoice_workers iw WHERE iw.invoice_id = lpi."invoiceId")
              ) t
              GROUP BY name
              ORDER BY total DESC
            `
          : Prisma.sql`
              WITH paid_invoices AS (
                SELECT DISTINCT p."invoiceId" AS id FROM "Payment" p
              ),
              labor_per_invoice AS (
                SELECT li."invoiceId", COALESCE(SUM(li."lineTotal"), 0)::numeric AS labor_total
                FROM "InvoiceLineItem" li
                WHERE li."lineType" = 'LABOR'
                  AND li."invoiceId" IN (SELECT id FROM paid_invoices)
                GROUP BY li."invoiceId"
              ),
              invoice_workers AS (
                SELECT i.id AS invoice_id, w.id AS worker_id, w."fullName" AS name
                FROM "Invoice" i
                JOIN "WorkerAssignment" wa ON wa."jobCardId" = i."jobCardId"
                JOIN "Worker" w ON w.id = wa."workerId"
                WHERE i.id IN (SELECT id FROM paid_invoices)
              ),
              worker_counts AS (
                SELECT invoice_id, COUNT(*)::numeric AS n
                FROM invoice_workers
                GROUP BY invoice_id
              )
              SELECT name, SUM(share)::numeric AS total
              FROM (
                SELECT iw.name, (lpi.labor_total / wc.n) AS share
                FROM labor_per_invoice lpi
                JOIN invoice_workers iw ON iw.invoice_id = lpi."invoiceId"
                JOIN worker_counts wc ON wc.invoice_id = lpi."invoiceId"
                UNION ALL
                SELECT 'Unassigned' AS name, lpi.labor_total AS share
                FROM labor_per_invoice lpi
                WHERE NOT EXISTS (SELECT 1 FROM invoice_workers iw WHERE iw.invoice_id = lpi."invoiceId")
              ) t
              GROUP BY name
              ORDER BY total DESC
            `,
      );

      // workerJobValue — per-worker totals across the grandTotal of paid invoices
      // they were assigned to. DISTINCT join so multi-line invoices aren't double-counted.
      const workerJobRows = await prisma.$queryRaw<Array<{ name: string; total: Prisma.Decimal; jobs: bigint }>>(
        rangeFrom && rangeTo
          ? Prisma.sql`
              WITH paid_invoices AS (
                SELECT DISTINCT p."invoiceId" AS id
                FROM "Payment" p
                WHERE p."paymentDate" >= ${rangeFrom} AND p."paymentDate" <= ${rangeTo}
              ),
              worker_invoices AS (
                SELECT DISTINCT w.id AS worker_id, w."fullName" AS name, i.id AS invoice_id, i."grandTotal" AS grand_total
                FROM "Invoice" i
                JOIN "WorkerAssignment" wa ON wa."jobCardId" = i."jobCardId"
                JOIN "Worker" w ON w.id = wa."workerId"
                WHERE i.id IN (SELECT id FROM paid_invoices)
              )
              SELECT name, COALESCE(SUM(grand_total), 0)::numeric AS total, COUNT(*)::bigint AS jobs
              FROM worker_invoices
              GROUP BY name
              ORDER BY total DESC
            `
          : Prisma.sql`
              WITH paid_invoices AS (
                SELECT DISTINCT p."invoiceId" AS id FROM "Payment" p
              ),
              worker_invoices AS (
                SELECT DISTINCT w.id AS worker_id, w."fullName" AS name, i.id AS invoice_id, i."grandTotal" AS grand_total
                FROM "Invoice" i
                JOIN "WorkerAssignment" wa ON wa."jobCardId" = i."jobCardId"
                JOIN "Worker" w ON w.id = wa."workerId"
                WHERE i.id IN (SELECT id FROM paid_invoices)
              )
              SELECT name, COALESCE(SUM(grand_total), 0)::numeric AS total, COUNT(*)::bigint AS jobs
              FROM worker_invoices
              GROUP BY name
              ORDER BY total DESC
            `,
      );

      return NextResponse.json({
        success: true,
        data: {
          byMode: payments.map((p) => ({
            mode: p.paymentMode,
            _count: p._count,
            _sum: D(p._sum.amount).toFixed(2),
          })),
          totalRevenue: D(total._sum.amount).toFixed(2),
          daily,
          byType: byTypeRows.map((r) => ({ type: r.lineType, total: D(r.total).toFixed(2) })),
          byWorker: byWorkerRows.map((r) => ({ name: r.name, total: D(r.total).toFixed(2) })),
          workerJobValue: workerJobRows.map((r) => ({
            name: r.name,
            total: D(r.total).toFixed(2),
            jobs: Number(r.jobs),
          })),
        },
      });
    }

    if (type === 'jobs') {
      const stats = await prisma.jobCard.groupBy({ by: ['status'], _count: true });
      return NextResponse.json({ success: true, data: stats.map((s) => ({ status: s.status, _count: s._count })) });
    }

    if (type === 'appointments') {
      const stats = await prisma.appointment.groupBy({ by: ['status'], _count: true });
      return NextResponse.json({ success: true, data: stats.map((s) => ({ status: s.status, _count: s._count })) });
    }

    if (type === 'inventory') {
      const [totalItems, stock] = await Promise.all([
        prisma.inventoryItem.count({ where: { isActive: true } }),
        prisma.inventoryItem.aggregate({ where: { isActive: true }, _sum: { quantityInStock: true } }),
      ]);
      return NextResponse.json({ success: true, data: { totalItems, totalStockUnits: Number(stock._sum.quantityInStock ?? 0) } });
    }

    if (type === 'workers') {
      const workers = await prisma.worker.findMany({
        orderBy: { fullName: 'asc' },
        select: {
          id: true,
          fullName: true,
          _count: { select: { assignments: { where: { unassignedAt: null, jobCard: { status: { notIn: ['DELIVERED', 'CANCELLED'] } } } } } },
        },
      });
      const totals = await prisma.workerAssignment.groupBy({ by: ['workerId'], _count: true });
      const totalMap = Object.fromEntries(totals.map((t) => [t.workerId, t._count]));
      return NextResponse.json({ success: true, data: workers.map((w) => ({ id: w.id, fullName: w.fullName, activeAssignments: w._count.assignments, totalAssignments: totalMap[w.id] || 0 })) });
    }

    if (type === 'expenses') {
      const where: Record<string, unknown> = {};
      if (from && to) where.expenseDate = { gte: new Date(from), lte: new Date(to) };
      const [expenses, total] = await Promise.all([
        prisma.expense.groupBy({ by: ['categoryId'], where, _sum: { amount: true }, _count: true }),
        prisma.expense.aggregate({ where, _sum: { amount: true } }),
      ]);
      return NextResponse.json({
        success: true,
        data: {
          byCategory: expenses.map((e) => ({ categoryId: e.categoryId, _count: e._count, _sum: Number(e._sum.amount ?? 0) })),
          totalExpenses: Number(total._sum.amount ?? 0),
        },
      });
    }

    return NextResponse.json({ success: true, data: {} });
  } catch (e) { return handleApiError(e); }
}
