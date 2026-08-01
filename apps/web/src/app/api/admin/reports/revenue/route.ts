import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/auth';
import { AppError, handleApiError } from '@/lib/errors';
import { buildPartsProfit, type PartProfitRow } from '@/lib/reports/parts-profit';
import { buildIncomeBreakdown, type LineTypeRow } from '@/lib/reports/income-breakdown';
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
    if (from && to) paymentWhere.paymentDate = { gte: new Date(from + 'T00:00:00+05:30'), lte: new Date(to + 'T23:59:59+05:30') };

    // Date bounds for raw aggregates — zod has already validated YYYY-MM-DD shape,
    // and we pass them as bind parameters anyway.
    const hasRange = Boolean(from && to);
    const rangeArgs = hasRange ? [from as string, to as string] : [];
    const payRange = hasRange ? `WHERE ("paymentDate" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date BETWEEN $1::date AND $2::date` : '';
    const invRange = hasRange ? `AND (i."invoiceDate" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date BETWEEN $1::date AND $2::date` : '';

    const [byMode, total, daily, byType, partRows, lineTypeRows, invoiceDiscountRows] = await Promise.all([
      prisma.payment.groupBy({ by: ['paymentMode'], where: paymentWhere, _sum: { amount: true }, _count: true }),
      prisma.payment.aggregate({ where: paymentWhere, _sum: { amount: true } }),
      // Revenue trend: payment totals per calendar day (IST)
      prisma.$queryRawUnsafe<{ date: string; amount: number }[]>(
        `SELECT to_char(("paymentDate" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date, 'YYYY-MM-DD') AS date, SUM(amount)::float AS amount
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
      // Parts gross profit: per (day, inventory item) selling revenue vs actual cost of
      // goods sold, for finalized invoices in range.
      //
      // Revenue side  — `InvoiceLineItem` rows with lineType = PART. `lineTotal` is already
      //                 net of the line discount, so this is realised selling value.
      // Cost side     — `StockMovement` STOCK_OUT rows written when the PART line was added
      //                 to the invoice. Each row carries the FIFO batch it consumed and that
      //                 batch's `costPrice`, so this is true per-batch COGS rather than a
      //                 snapshot of the item's current cost. Legacy rows created before batch
      //                 tracking have no costPrice, so we fall back to InventoryItem.costPrice.
      //                 Deleting a PART line deletes its STOCK_OUT rows (see line-items route),
      //                 so what remains matches the invoice as it stands.
      //
      // FULL JOIN keeps both halves visible: PART lines with no linked inventory item
      // (manually typed parts) contribute revenue with zero known cost, and stock issued
      // without a matching PART line still shows its cost. The UI flags the former so an
      // inflated margin is never presented as fact.
      prisma.$queryRawUnsafe<PartProfitRow[]>(
        `WITH inv AS (
           SELECT i.id, (i."invoiceDate" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date AS d
           FROM "Invoice" i
           WHERE i."invoiceStatus" = 'FINALIZED' ${invRange}
         ),
         rev AS (
           SELECT li."invoiceId" AS invoice_id, li."referenceItemId" AS item_id,
                  SUM(li.quantity)::float AS qty, SUM(li."lineTotal")::float AS revenue
           FROM "InvoiceLineItem" li
           JOIN inv ON inv.id = li."invoiceId"
           WHERE li."lineType" = 'PART'
           GROUP BY 1, 2
         ),
         cogs AS (
           SELECT sm."relatedEntityId" AS invoice_id, sm."inventoryItemId" AS item_id,
                  SUM(sm.quantity * COALESCE(sm."costPrice", ii."costPrice"))::float AS cost
           FROM "StockMovement" sm
           JOIN "InventoryItem" ii ON ii.id = sm."inventoryItemId"
           JOIN inv ON inv.id = sm."relatedEntityId"
           WHERE sm."movementType" = 'STOCK_OUT' AND sm."relatedEntityType" = 'Invoice'
           GROUP BY 1, 2
         ),
         joined AS (
           SELECT COALESCE(r.invoice_id, c.invoice_id) AS invoice_id,
                  COALESCE(r.item_id, c.item_id) AS item_id,
                  COALESCE(r.qty, 0) AS qty,
                  COALESCE(r.revenue, 0) AS revenue,
                  COALESCE(c.cost, 0) AS cost
           FROM rev r
           FULL OUTER JOIN cogs c
             ON c.invoice_id = r.invoice_id AND c.item_id = r.item_id
         )
         SELECT to_char(inv.d, 'YYYY-MM-DD') AS date,
                j.item_id AS "itemId", ii.sku AS sku, ii."itemName" AS "itemName",
                j.qty AS qty, j.revenue AS revenue, j.cost AS cost
         FROM joined j
         JOIN inv ON inv.id = j.invoice_id
         LEFT JOIN "InventoryItem" ii ON ii.id = j.item_id`,
        ...rangeArgs,
      ),
      // Income by line type, EX-GST. `lineTotal` is stored tax-inclusive, so the
      // income contribution is `lineTotal - taxAmount`; the tax is returned
      // separately rather than folded into revenue.
      //
      // DISCOUNT_ADJUSTMENT rows come back with a negative amount and are split
      // out downstream — a discount is a reduction, not an income category.
      prisma.$queryRawUnsafe<LineTypeRow[]>(
        `SELECT li."lineType"::text AS "lineType",
                SUM(li."lineTotal" - li."taxAmount")::float AS amount,
                SUM(li."taxAmount")::float AS tax
         FROM "InvoiceLineItem" li
         JOIN "Invoice" i ON i.id = li."invoiceId"
         WHERE i."invoiceStatus" = 'FINALIZED' ${invRange}
         GROUP BY 1`,
        ...rangeArgs,
      ),
      // Invoice-level discount. This is a SECOND, independent discount mechanism
      // alongside DISCOUNT_ADJUSTMENT lines (see invoices POST: grandTotal =
      // subtotal + taxTotal + discountFromLines - discountAmount), so both must
      // be summed to state discounts given. Uses the same `invRange` predicate as
      // the query above so the two cover an identical set of invoices.
      prisma.$queryRawUnsafe<{ invoiceDiscount: number }[]>(
        `SELECT COALESCE(SUM(i."discountAmount"), 0)::float AS "invoiceDiscount"
         FROM "Invoice" i
         WHERE i."invoiceStatus" = 'FINALIZED' ${invRange}`,
        ...rangeArgs,
      ),
    ]);

    const partsProfit = buildPartsProfit(partRows);

    return NextResponse.json({
      success: true,
      data: {
        byMode: byMode.map((m) => ({ mode: m.paymentMode, _count: m._count, _sum: Number(m._sum.amount ?? 0) })),
        totalRevenue: Number(total._sum.amount ?? 0),
        daily,
        byType,
        partsProfit,
        incomeBreakdown: buildIncomeBreakdown({
          lineTypeRows,
          invoiceDiscount: Number(invoiceDiscountRows[0]?.invoiceDiscount ?? 0),
          partsCost: partsProfit.cost,
          partsRevenueWithoutCost: partsProfit.revenueWithoutCost,
        }),
      },
    });
  } catch (e) {
    return handleApiError(e);
  }
}
