import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/auth';
import { AppError, handleApiError } from '@/lib/errors';
import { PERMISSIONS } from '@gearup/types';

/**
 * Daily digest — one endpoint returning every business signal for a given date
 * (default: today in IST). Consumed by /admin/reports/daily.
 *
 * All boundaries are computed in IST (Asia/Kolkata). Queries stay per-date
 * (fast) and use raw SQL only where groupBy can't express it.
 */
export const revalidate = 0;

const querySchema = z.object({
  date: z.string().date().optional(),
});

export async function GET(req: NextRequest) {
  try {
    requirePermission(PERMISSIONS.REPORTS_VIEW);
    const parsed = querySchema.safeParse({ date: req.nextUrl.searchParams.get('date') ?? undefined });
    if (!parsed.success) throw new AppError(400, 'Invalid date (YYYY-MM-DD)', 'VALIDATION_ERROR');

    // Resolve "today" in IST when no date passed.
    const istOffsetMs = 5.5 * 60 * 60 * 1000;
    const istNow = new Date(Date.now() + istOffsetMs);
    const dateStr = parsed.data.date ?? istNow.toISOString().slice(0, 10);
    const dayStart = new Date(`${dateStr}T00:00:00+05:30`);
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
    // Comparable date for "opened before today, still active" queries.
    const dayEndStr = new Date(dayEnd.getTime() - 1).toISOString();

    const [
      // ─── Revenue
      paymentsByMode,
      paymentsTotal,
      invoicesFinalizedToday,
      lineTypeToday,
      // ─── Job cards
      jobCardsOpened,
      jobCardsClosed,
      jobCardStatusFunnel,
      jobCardCycleTimes,
      // ─── Appointments
      apptCountsByStatus,
      apptSlotUtil,
      // ─── Customers & vehicles
      newCustomers,
      newVehicles,
      returningCustomers,
      // ─── Inventory
      partsConsumedTop,
      stockMovementsCount,
      lowStockItems,
      // ─── Workers
      workerLabourRevenue,
      workerJobsClosed,
      workersOnLeave,
      // ─── Expenses
      expensesTotal,
      expensesByCategory,
      expensesTopVendors,
      // ─── AMC
      amcContractsNew,
      amcServicesRendered,
      amcSavings,
      // ─── Estimates
      estimatesNew,
      estimatesConverted,
      // ─── P&L
      cogsToday,
    ] = await Promise.all([
      // Revenue: cash inflow by mode
      prisma.payment.groupBy({
        by: ['paymentMode'],
        where: { paymentDate: { gte: dayStart, lt: dayEnd } },
        _sum: { amount: true },
        _count: true,
      }),
      prisma.payment.aggregate({ where: { paymentDate: { gte: dayStart, lt: dayEnd } }, _sum: { amount: true } }),
      // Invoices finalized today (accrual view)
      prisma.invoice.aggregate({
        where: { invoiceStatus: 'FINALIZED', finalizedAt: { gte: dayStart, lt: dayEnd } },
        _sum: { grandTotal: true, subtotal: true, taxTotal: true, discountAmount: true },
        _count: true,
      }),
      // Split by line-type across today's finalized invoices
      prisma.$queryRawUnsafe<{ lineType: string; total: number }[]>(
        `SELECT li."lineType"::text AS "lineType", SUM(li."lineTotal")::float AS total
         FROM "InvoiceLineItem" li
         JOIN "Invoice" i ON i.id = li."invoiceId"
         WHERE i."invoiceStatus" = 'FINALIZED'
           AND i."finalizedAt" >= $1::timestamptz AND i."finalizedAt" < $2::timestamptz
         GROUP BY 1 ORDER BY total DESC`,
        dayStart.toISOString(),
        dayEnd.toISOString(),
      ),
      // Job cards
      prisma.jobCard.count({ where: { createdAt: { gte: dayStart, lt: dayEnd } } }),
      prisma.jobCard.count({ where: { status: { in: ['DELIVERED', 'CLOSED'] }, updatedAt: { gte: dayStart, lt: dayEnd } } }),
      prisma.jobCard.groupBy({
        by: ['status'],
        where: { status: { notIn: ['DELIVERED', 'CLOSED', 'CANCELLED'] } },
        _count: true,
      }),
      // Avg cycle time (hours) for job cards closed today
      prisma.$queryRawUnsafe<{ avg_hours: number | null; n: number }[]>(
        `SELECT AVG(EXTRACT(EPOCH FROM ("updatedAt" - "createdAt"))/3600)::float AS avg_hours,
                COUNT(*)::int AS n
         FROM "JobCard"
         WHERE status IN ('DELIVERED','CLOSED')
           AND "updatedAt" >= $1::timestamptz AND "updatedAt" < $2::timestamptz`,
        dayStart.toISOString(),
        dayEnd.toISOString(),
      ),
      // Appointments by status for this date
      prisma.appointment.groupBy({
        by: ['status'],
        where: { appointmentDate: { gte: dayStart, lt: dayEnd } },
        _count: true,
      }),
      // Slot utilisation: total slots vs booked (day-of-week rule)
      prisma.$queryRawUnsafe<{ capacity: number; booked: number }[]>(
        `SELECT
           COALESCE(SUM(r."maxCapacity"), 0)::int AS capacity,
           (SELECT COUNT(*)::int FROM "Appointment" a
             WHERE a."appointmentDate" >= $1::timestamptz AND a."appointmentDate" < $2::timestamptz
               AND a.status NOT IN ('CANCELLED','NO_SHOW')) AS booked
         FROM "AppointmentSlotRule" r
         WHERE r."isActive" = true AND r."dayOfWeek" = EXTRACT(DOW FROM $1::timestamptz AT TIME ZONE 'Asia/Kolkata')::int`,
        dayStart.toISOString(),
        dayEnd.toISOString(),
      ),
      // Customers & vehicles
      prisma.customer.count({ where: { createdAt: { gte: dayStart, lt: dayEnd } } }),
      prisma.vehicle.count({ where: { createdAt: { gte: dayStart, lt: dayEnd } } }),
      // Returning customer count (customers with a job card today whose earliest job card is before today)
      prisma.$queryRawUnsafe<{ n: number }[]>(
        `SELECT COUNT(DISTINCT jc."customerId")::int AS n
         FROM "JobCard" jc
         WHERE jc."createdAt" >= $1::timestamptz AND jc."createdAt" < $2::timestamptz
           AND EXISTS (
             SELECT 1 FROM "JobCard" prior
             WHERE prior."customerId" = jc."customerId" AND prior."createdAt" < $1::timestamptz
           )`,
        dayStart.toISOString(),
        dayEnd.toISOString(),
      ),
      // Inventory — top parts consumed (from STOCK_OUT movements today)
      prisma.$queryRawUnsafe<{ itemId: string; itemName: string; sku: string; qty: number; value: number }[]>(
        `SELECT sm."inventoryItemId" AS "itemId",
                ii."itemName" AS "itemName",
                ii.sku AS sku,
                SUM(sm.quantity)::float AS qty,
                SUM(sm.quantity * COALESCE(sm."costPrice", ii."costPrice"))::float AS value
         FROM "StockMovement" sm
         JOIN "InventoryItem" ii ON ii.id = sm."inventoryItemId"
         WHERE sm."movementType" = 'STOCK_OUT'
           AND sm."createdAt" >= $1::timestamptz AND sm."createdAt" < $2::timestamptz
         GROUP BY 1,2,3
         ORDER BY value DESC
         LIMIT 10`,
        dayStart.toISOString(),
        dayEnd.toISOString(),
      ),
      prisma.stockMovement.count({ where: { createdAt: { gte: dayStart, lt: dayEnd } } }),
      // Low-stock right now (not a per-day metric — it's the actionable list)
      prisma.$queryRawUnsafe<{ id: string; itemName: string; sku: string; qty: number; reorder: number }[]>(
        `SELECT id, "itemName", sku, "quantityInStock"::float AS qty, "reorderLevel"::float AS reorder
         FROM "InventoryItem"
         WHERE "isActive" = true AND "quantityInStock" <= "reorderLevel"
         ORDER BY ("reorderLevel" - "quantityInStock") DESC
         LIMIT 10`,
      ),
      // Workers — labour revenue attributed via WorkerAssignment on today's finalized invoices
      prisma.$queryRawUnsafe<{ workerId: string; name: string; labour: number; jobs: number }[]>(
        `WITH todays_invoiced_jobs AS (
           SELECT DISTINCT jc.id
           FROM "JobCard" jc
           JOIN "Invoice" i ON i."jobCardId" = jc.id
           WHERE i."invoiceStatus" = 'FINALIZED'
             AND i."finalizedAt" >= $1::timestamptz AND i."finalizedAt" < $2::timestamptz
         ),
         labour_lines AS (
           SELECT jc.id AS "jobCardId", SUM(li."lineTotal") AS total
           FROM "Invoice" i
           JOIN "InvoiceLineItem" li ON li."invoiceId" = i.id
           JOIN "JobCard" jc ON jc.id = i."jobCardId"
           WHERE i."invoiceStatus" = 'FINALIZED'
             AND i."finalizedAt" >= $1::timestamptz AND i."finalizedAt" < $2::timestamptz
             AND li."lineType" = 'LABOR'
           GROUP BY 1
         )
         SELECT w.id AS "workerId",
                w."fullName" AS name,
                COALESCE(SUM(l.total), 0)::float AS labour,
                COUNT(DISTINCT wa."jobCardId")::int AS jobs
         FROM "Worker" w
         LEFT JOIN "WorkerAssignment" wa ON wa."workerId" = w.id
                 AND wa."jobCardId" IN (SELECT id FROM todays_invoiced_jobs)
         LEFT JOIN labour_lines l ON l."jobCardId" = wa."jobCardId"
         GROUP BY 1,2
         HAVING COALESCE(SUM(l.total), 0) > 0 OR COUNT(DISTINCT wa."jobCardId") > 0
         ORDER BY labour DESC`,
        dayStart.toISOString(),
        dayEnd.toISOString(),
      ),
      // Jobs closed per worker today
      prisma.$queryRawUnsafe<{ workerId: string; name: string; closed: number }[]>(
        `SELECT w.id AS "workerId", w."fullName" AS name, COUNT(DISTINCT jc.id)::int AS closed
         FROM "Worker" w
         JOIN "WorkerAssignment" wa ON wa."workerId" = w.id
         JOIN "JobCard" jc ON jc.id = wa."jobCardId"
         WHERE jc.status IN ('DELIVERED','CLOSED')
           AND jc."updatedAt" >= $1::timestamptz AND jc."updatedAt" < $2::timestamptz
         GROUP BY 1,2
         ORDER BY closed DESC`,
        dayStart.toISOString(),
        dayEnd.toISOString(),
      ),
      // Workers on leave for this date
      prisma.$queryRawUnsafe<{ workerId: string; name: string; reason: string | null }[]>(
        `SELECT w.id AS "workerId", w."fullName" AS name, wl.reason
         FROM "WorkerLeave" wl
         JOIN "Worker" w ON w.id = wl."workerId"
         WHERE wl.status = 'APPROVED'
           AND wl."startDate" < $2::timestamptz AND wl."endDate" >= $1::timestamptz`,
        dayStart.toISOString(),
        dayEnd.toISOString(),
      ),
      // Expenses
      prisma.expense.aggregate({ where: { expenseDate: { gte: dayStart, lt: dayEnd } }, _sum: { amount: true }, _count: true }),
      prisma.$queryRawUnsafe<{ category: string; total: number; n: number }[]>(
        `SELECT c."categoryName" AS category, SUM(e.amount)::float AS total, COUNT(*)::int AS n
         FROM "Expense" e
         JOIN "ExpenseCategory" c ON c.id = e."categoryId"
         WHERE e."expenseDate" >= $1::timestamptz AND e."expenseDate" < $2::timestamptz
         GROUP BY 1 ORDER BY total DESC`,
        dayStart.toISOString(),
        dayEnd.toISOString(),
      ),
      prisma.$queryRawUnsafe<{ vendor: string; total: number; n: number }[]>(
        `SELECT COALESCE("vendorName",'—') AS vendor, SUM(amount)::float AS total, COUNT(*)::int AS n
         FROM "Expense"
         WHERE "expenseDate" >= $1::timestamptz AND "expenseDate" < $2::timestamptz
         GROUP BY 1 ORDER BY total DESC LIMIT 5`,
        dayStart.toISOString(),
        dayEnd.toISOString(),
      ),
      // AMC
      prisma.amcContract.count({ where: { createdAt: { gte: dayStart, lt: dayEnd } } }),
      prisma.amcServiceUsage.count({ where: { serviceDate: { gte: dayStart, lt: dayEnd } } }),
      // AMC savings: value of AMC-covered line items (lineTotal = 0 with unitPrice > 0) on today's finalized invoices
      prisma.$queryRawUnsafe<{ saved: number }[]>(
        `SELECT COALESCE(SUM(li.quantity * li."unitPrice"), 0)::float AS saved
         FROM "InvoiceLineItem" li
         JOIN "Invoice" i ON i.id = li."invoiceId"
         WHERE i."invoiceStatus" = 'FINALIZED'
           AND i."finalizedAt" >= $1::timestamptz AND i."finalizedAt" < $2::timestamptz
           AND li."lineType" = 'AMC' AND li."lineTotal" = 0 AND li."unitPrice" > 0`,
        dayStart.toISOString(),
        dayEnd.toISOString(),
      ),
      // Estimates
      prisma.estimate.count({ where: { createdAt: { gte: dayStart, lt: dayEnd } } }),
      prisma.estimate.count({
        where: {
          createdAt: { gte: dayStart, lt: dayEnd },
          OR: [{ convertedJobCardId: { not: null } }, { convertedInvoiceId: { not: null } }],
        },
      }),
      // COGS today (STOCK_OUT × costPrice tied to invoice line items on FINALIZED invoices today)
      prisma.$queryRawUnsafe<{ cogs: number }[]>(
        `SELECT COALESCE(SUM(sm.quantity * COALESCE(sm."costPrice", ii."costPrice")), 0)::float AS cogs
         FROM "StockMovement" sm
         JOIN "InventoryItem" ii ON ii.id = sm."inventoryItemId"
         WHERE sm."movementType" = 'STOCK_OUT'
           AND sm."relatedEntityType" = 'Invoice'
           AND sm."createdAt" >= $1::timestamptz AND sm."createdAt" < $2::timestamptz`,
        dayStart.toISOString(),
        dayEnd.toISOString(),
      ),
    ]);

    // Assemble
    const revenue = {
      collected: {
        total: Number(paymentsTotal._sum.amount ?? 0),
        byMode: paymentsByMode.map((r) => ({ mode: r.paymentMode, amount: Number(r._sum.amount ?? 0), count: r._count })),
      },
      invoiced: {
        total: Number(invoicesFinalizedToday._sum.grandTotal ?? 0),
        subtotal: Number(invoicesFinalizedToday._sum.subtotal ?? 0),
        tax: Number(invoicesFinalizedToday._sum.taxTotal ?? 0),
        discount: Number(invoicesFinalizedToday._sum.discountAmount ?? 0),
        count: invoicesFinalizedToday._count,
      },
      byLineType: lineTypeToday,
    };
    const cogs = Number(cogsToday[0]?.cogs ?? 0);
    const expensesSum = Number(expensesTotal._sum.amount ?? 0);
    const netCash = revenue.collected.total - expensesSum;
    const netAccrual = revenue.invoiced.total - cogs - expensesSum;

    // Suppress unused (kept for clarity that we DO query them)
    void dayEndStr;

    return NextResponse.json({
      success: true,
      data: {
        date: dateStr,
        revenue,
        jobCards: {
          opened: jobCardsOpened,
          closed: jobCardsClosed,
          statusFunnel: jobCardStatusFunnel.map((r) => ({ status: r.status, count: r._count })),
          avgCycleHours: jobCardCycleTimes[0]?.avg_hours ?? null,
          closedCount: jobCardCycleTimes[0]?.n ?? 0,
        },
        appointments: {
          byStatus: apptCountsByStatus.map((r) => ({ status: r.status, count: r._count })),
          capacity: apptSlotUtil[0]?.capacity ?? 0,
          booked: apptSlotUtil[0]?.booked ?? 0,
        },
        customers: { new: newCustomers, returning: returningCustomers[0]?.n ?? 0, newVehicles },
        inventory: {
          partsConsumed: partsConsumedTop,
          movementsCount: stockMovementsCount,
          lowStock: lowStockItems,
        },
        workers: { labour: workerLabourRevenue, jobsClosed: workerJobsClosed, onLeave: workersOnLeave },
        expenses: {
          total: expensesSum,
          count: expensesTotal._count,
          byCategory: expensesByCategory,
          topVendors: expensesTopVendors,
        },
        amc: {
          contractsNew: amcContractsNew,
          servicesRendered: amcServicesRendered,
          savings: Number(amcSavings[0]?.saved ?? 0),
        },
        estimates: { new: estimatesNew, converted: estimatesConverted },
        pnl: { cogs, netCash, netAccrual },
      },
    });
  } catch (e) {
    return handleApiError(e);
  }
}
