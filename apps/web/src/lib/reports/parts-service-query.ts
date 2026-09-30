/**
 * Data loader for the Parts & Service report.
 *
 * Extracted from the route handler so the JSON endpoint and the PDF endpoint
 * render from one query, and can never drift apart.
 *
 * Basis, matching the existing revenue report:
 *   - finalized invoices only
 *   - amounts EX-GST (`lineTotal - taxAmount`), since GST is collected on behalf
 *     of the government and is not income
 *   - dates bucketed in Asia/Kolkata, so a day boundary means the same thing
 *     here as it does on the revenue report
 *
 * Cost of goods sold resolves as
 *   COALESCE(NULLIF(sm."costPrice", 0), ii."costPrice")
 * on the STOCK_OUT rows tied to the invoice. The `NULLIF` matters: many
 * movements store an explicit 0, and plain `COALESCE` would take that 0 in
 * preference to a valid catalog price. See `parts-integrity.ts`.
 */

import { prisma } from '@/lib/prisma';
import {
  buildPartsIntegrity,
  buildProfitability,
  type PartIntegrityRow,
  type PartsIntegrity,
  type Profitability,
} from '@/lib/reports/parts-integrity';
import {
  daysInRange,
  overheadsFromSettings,
  prorateOverheads,
  type MonthlyOverheads,
  type ProratedOverheads,
} from '@/lib/reports/overheads';

const IST = `AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata'`;

/** Line types that make up service income, as opposed to parts. */
export const SERVICE_LINE_TYPES = ['SERVICE_CHARGE', 'LABOR', 'CUSTOM_CHARGE'] as const;

/**
 * Part lines joined to their resolved cost and graded.
 *
 * `mv` aggregates STOCK_OUT movements per (invoice, item) and computes cost both
 * the naive way and the corrected way, so the difference between them can be
 * reported as a diagnostic without running a second pass.
 */
const PARTS_CTE = `
  WITH inv AS (
    SELECT i.id, (i."invoiceDate" ${IST})::date AS d
    FROM "Invoice" i
    WHERE i."invoiceStatus" = 'FINALIZED'
      AND (i."invoiceDate" ${IST})::date BETWEEN $1::date AND $2::date
  ),
  mv AS (
    SELECT sm."relatedEntityId" AS invoice_id,
           sm."inventoryItemId"  AS item_id,
           SUM(sm.quantity * COALESCE(sm."costPrice", ii."costPrice"))::float               AS cost_naive,
           SUM(sm.quantity * COALESCE(NULLIF(sm."costPrice", 0), ii."costPrice"))::float    AS cost_fixed,
           COUNT(*)::int AS movement_rows
    FROM "StockMovement" sm
    JOIN "InventoryItem" ii ON ii.id = sm."inventoryItemId"
    WHERE sm."movementType" = 'STOCK_OUT' AND sm."relatedEntityType" = 'Invoice'
    GROUP BY 1, 2
  ),
  part_lines AS (
    SELECT inv.d,
           li.id,
           li."referenceItemId" AS item_id,
           li.description,
           li.quantity::float                       AS qty,
           (li."lineTotal" - li."taxAmount")::float AS revenue,
           li."unitPrice"::float                    AS unit_price,
           ii.sku,
           ii."itemName",
           cat."categoryName" AS category,
           COALESCE(mv.cost_naive, 0) AS cost_naive,
           COALESCE(mv.cost_fixed, 0) AS cost_fixed,
           CASE
             WHEN li."referenceItemId" IS NULL      THEN 'UNLINKED'
             WHEN mv.movement_rows IS NULL          THEN 'NO_MOVEMENT'
             WHEN COALESCE(mv.cost_fixed, 0) = 0    THEN 'NO_COST'
             ELSE 'OK'
           END AS grade
    FROM "InvoiceLineItem" li
    JOIN inv ON inv.id = li."invoiceId"
    LEFT JOIN "InventoryItem"     ii  ON ii.id  = li."referenceItemId"
    LEFT JOIN "InventoryCategory" cat ON cat.id = ii."categoryId"
    LEFT JOIN mv ON mv.invoice_id = li."invoiceId" AND mv.item_id = li."referenceItemId"
    WHERE li."lineType" = 'PART'
  )`;

export type IncomeLine = {
  lineType: string;
  lines: number;
  qty: number;
  amount: number;
  tax: number;
};

export type DailyPoint = {
  date: string;
  service: number;
  parts: number;
  /** Portion of `parts` with no cost basis — drawn as a hatched overlay. */
  untraceable: number;
};

export type CatalogHealth = { total: number; missingCostPrice: number };

/**
 * Magnitude of the `NULLIF` correction. Reported so the difference between this
 * report and the older revenue report is explainable rather than mysterious.
 */
export type NullifDiagnostic = {
  stockOutRows: number;
  nullCostRows: number;
  zeroCostRows: number;
  realCostRows: number;
  /** COGS the naive expression would have discarded, for this period. */
  costRecovered: number;
  linesAffected: number;
};

export type PartsServiceReport = {
  range: { from: string; to: string; days: number };
  income: IncomeLine[];
  totals: {
    partsRevenue: number;
    serviceRevenue: number;
    amcRevenue: number;
    totalIncome: number;
    discount: number;
    netIncome: number;
    taxBilled: number;
  };
  partsIntegrity: PartsIntegrity;
  daily: DailyPoint[];
  catalogHealth: CatalogHealth;
  nullifDiagnostic: NullifDiagnostic;
  overheads: { monthly: MonthlyOverheads; prorated: ProratedOverheads };
  profitability: Profitability;
  invoiceCount: number;
};

export async function loadPartsServiceReport(from: string, to: string): Promise<PartsServiceReport> {
  const days = daysInRange(from, to);
  const q = <T>(sql: string) => prisma.$queryRawUnsafe<T[]>(sql, from, to);

  const [
    incomeRows,
    integrityRows,
    dailyRows,
    catalogRows,
    movementRows,
    recoveredRows,
    invoiceRows,
    settingRows,
  ] = await Promise.all([
    // Income by line type, ex-GST.
    q<{ lineType: string; lines: number; qty: number; amount: number; tax: number }>(`
      SELECT li."lineType"::text AS "lineType",
             COUNT(*)::int AS lines,
             SUM(li.quantity)::float AS qty,
             SUM(li."lineTotal" - li."taxAmount")::float AS amount,
             SUM(li."taxAmount")::float AS tax
      FROM "InvoiceLineItem" li
      JOIN "Invoice" i ON i.id = li."invoiceId"
      WHERE i."invoiceStatus" = 'FINALIZED'
        AND (i."invoiceDate" ${IST})::date BETWEEN $1::date AND $2::date
      GROUP BY 1
      ORDER BY amount DESC`),

    // One row per (grade, item/description). The complete problem lists come
    // from here, so it is deliberately not limited.
    q<PartIntegrityRow>(`${PARTS_CTE}
      SELECT grade,
             item_id AS "itemId",
             sku,
             "itemName",
             category,
             CASE WHEN item_id IS NULL THEN description ELSE NULL END AS description,
             COUNT(*)::int AS lines,
             SUM(qty)::float AS qty,
             SUM(revenue)::float AS revenue,
             SUM(cost_fixed)::float AS cost,
             MAX(unit_price)::float AS "maxUnitPrice"
      FROM part_lines
      GROUP BY grade, item_id, sku, "itemName", category,
               CASE WHEN item_id IS NULL THEN description ELSE NULL END`),

    // Daily service vs parts, with the uncosted slice of parts.
    q<DailyPoint>(`${PARTS_CTE},
      svc AS (
        SELECT (i."invoiceDate" ${IST})::date AS d,
               SUM(li."lineTotal" - li."taxAmount")::float AS service
        FROM "InvoiceLineItem" li
        JOIN "Invoice" i ON i.id = li."invoiceId"
        WHERE i."invoiceStatus" = 'FINALIZED'
          AND li."lineType" IN ('SERVICE_CHARGE','LABOR','CUSTOM_CHARGE')
          AND (i."invoiceDate" ${IST})::date BETWEEN $1::date AND $2::date
        GROUP BY 1
      ),
      prt AS (
        SELECT d,
               SUM(revenue)::float AS parts,
               SUM(CASE WHEN grade <> 'OK' THEN revenue ELSE 0 END)::float AS untraceable
        FROM part_lines GROUP BY 1
      )
      SELECT to_char(COALESCE(prt.d, svc.d), 'YYYY-MM-DD') AS date,
             COALESCE(svc.service, 0)::float AS service,
             COALESCE(prt.parts, 0)::float AS parts,
             COALESCE(prt.untraceable, 0)::float AS untraceable
      FROM prt FULL OUTER JOIN svc ON svc.d = prt.d
      ORDER BY 1`),

    // Catalog-wide, not period-scoped — this is the root cause, not a symptom.
    prisma.$queryRawUnsafe<{ total: number; missing: number }[]>(`
      SELECT COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE COALESCE("costPrice", 0) = 0)::int AS missing
      FROM "InventoryItem" WHERE "isActive" = true`),

    prisma.$queryRawUnsafe<{ total: number; nulls: number; zeros: number; reals: number }[]>(`
      SELECT COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE "costPrice" IS NULL)::int AS nulls,
             COUNT(*) FILTER (WHERE "costPrice" = 0)::int     AS zeros,
             COUNT(*) FILTER (WHERE "costPrice" > 0)::int     AS reals
      FROM "StockMovement"
      WHERE "movementType" = 'STOCK_OUT' AND "relatedEntityType" = 'Invoice'`),

    // What the NULLIF correction is worth over this period.
    q<{ recovered: number; lines: number }>(`${PARTS_CTE}
      SELECT COALESCE(SUM(cost_fixed - cost_naive), 0)::float AS recovered,
             COUNT(*) FILTER (WHERE cost_fixed > cost_naive)::int AS lines
      FROM part_lines`),

    q<{ count: number }>(`
      SELECT COUNT(*)::int AS count FROM "Invoice" i
      WHERE i."invoiceStatus" = 'FINALIZED'
        AND (i."invoiceDate" ${IST})::date BETWEEN $1::date AND $2::date`),

    prisma.setting.findMany(),
  ]);

  const income: IncomeLine[] = incomeRows.map((r) => ({
    lineType: r.lineType,
    lines: Number(r.lines ?? 0),
    qty: Number(r.qty ?? 0),
    amount: Number(r.amount ?? 0),
    tax: Number(r.tax ?? 0),
  }));

  const sumOf = (...types: string[]) =>
    income.filter((i) => types.includes(i.lineType)).reduce((s, i) => s + i.amount, 0);

  const partsRevenue = sumOf('PART');
  const serviceRevenue = sumOf(...SERVICE_LINE_TYPES);
  const amcRevenue = sumOf('AMC');
  // Discount lines carry a negative amount; report the magnitude separately so
  // a reduction is never presented as an income category.
  const discount = Math.abs(sumOf('DISCOUNT_ADJUSTMENT'));
  const totalIncome = partsRevenue + serviceRevenue + amcRevenue;
  const netIncome = totalIncome - discount;
  const taxBilled = income.reduce((s, i) => s + i.tax, 0);

  const partsIntegrity = buildPartsIntegrity(
    integrityRows.map((r) => ({
      ...r,
      lines: Number(r.lines ?? 0),
      qty: Number(r.qty ?? 0),
      revenue: Number(r.revenue ?? 0),
      cost: Number(r.cost ?? 0),
      maxUnitPrice: Number(r.maxUnitPrice ?? 0),
    })),
  );

  const settings = Object.fromEntries(settingRows.map((s) => [s.key, s.value as unknown]));
  const monthly = overheadsFromSettings(settings);
  const prorated = prorateOverheads(monthly, days);

  const profitability = buildProfitability({
    netIncome,
    partsCost: partsIntegrity.cost,
    revenueWithoutCost: partsIntegrity.revenueWithoutCost,
    costedMarginPct: partsIntegrity.costedMarginPct,
    overheads: prorated.forPeriodTotal,
  });

  const cat = catalogRows[0] ?? { total: 0, missing: 0 };
  const mov = movementRows[0] ?? { total: 0, nulls: 0, zeros: 0, reals: 0 };
  const rec = recoveredRows[0] ?? { recovered: 0, lines: 0 };

  return {
    range: { from, to, days },
    income,
    totals: {
      partsRevenue,
      serviceRevenue,
      amcRevenue,
      totalIncome,
      discount,
      netIncome,
      taxBilled,
    },
    partsIntegrity,
    daily: dailyRows.map((r) => ({
      date: r.date,
      service: Number(r.service ?? 0),
      parts: Number(r.parts ?? 0),
      untraceable: Number(r.untraceable ?? 0),
    })),
    catalogHealth: { total: cat.total, missingCostPrice: cat.missing },
    nullifDiagnostic: {
      stockOutRows: mov.total,
      nullCostRows: mov.nulls,
      zeroCostRows: mov.zeros,
      realCostRows: mov.reals,
      costRecovered: Number(rec.recovered ?? 0),
      linesAffected: Number(rec.lines ?? 0),
    },
    overheads: { monthly, prorated },
    profitability,
    invoiceCount: invoiceRows[0]?.count ?? 0,
  };
}
