/**
 * Income breakdown for the revenue report.
 *
 * Composes the "where did the money come from" bar and its totals from
 * finalized-invoice line items, all figures EXCLUSIVE of GST.
 *
 * Why ex-GST: `InvoiceLineItem.lineTotal` is stored tax-inclusive
 * (`invoice-calc.ts`: lineTotal = net + taxAmount) and GST is treated as
 * inclusive pricing. Tax collected is remitted to the government, so counting
 * it as income overstates both revenue and margin. The ex-GST amount is
 * therefore `lineTotal - taxAmount`, and the tax is reported separately.
 *
 * Discounts are deliberately NOT a bar segment. Every segment is money billed
 * to a customer for something; a discount is a reduction, not a category. It is
 * reported as its own figure and reconciled beneath the bar instead.
 */

/** Per-`lineType` ex-GST totals from the report's raw query. */
export type LineTypeRow = {
  lineType: string;
  /** Ex-GST amount: SUM(lineTotal - taxAmount). Negative for DISCOUNT_ADJUSTMENT. */
  amount: number;
  /** GST component: SUM(taxAmount). */
  tax: number;
};

export type IncomeBreakdownInput = {
  lineTypeRows: LineTypeRow[];
  /** SUM(Invoice.discountAmount) — the invoice-level discount, separate from discount lines. */
  invoiceDiscount: number;
  /** Cost of goods sold for parts billed in the period (from the parts-profit query). */
  partsCost: number;
  /** Parts revenue with no recorded buying price — makes the margin look better than it is. */
  partsRevenueWithoutCost?: number;
};

export type IncomeSlice = { key: string; label: string; amount: number; pct: number };

export type IncomeBreakdown = {
  /** Bar total. Ex-GST, before any discount. */
  totalIncome: number;
  /** GST billed in the period. Excluded from totalIncome; shown for transparency. */
  taxCollected: number;
  discounts: { fromLines: number; invoiceLevel: number; total: number };
  /** totalIncome − discounts.total. What customers actually owe, ex-GST. */
  netInvoiced: number;
  parts: {
    revenue: number;
    cost: number;
    margin: number;
    marginPct: number | null;
    /** True when cost exceeded revenue — parts were billed below what they cost. */
    soldBelowCost: boolean;
    /** Parts revenue with no cost basis; margin above is optimistic by this much. */
    revenueWithoutCost: number;
  };
  /** Bar segments, in stack order. Parts is split into buying cost + margin. */
  segments: IncomeSlice[];
  /** One row per income category, parts combined. Drives the breakdown strip and CSV. */
  categories: IncomeSlice[];
};

export const DISCOUNT_LINE_TYPE = 'DISCOUNT_ADJUSTMENT';

/**
 * Income line types in bar-stack order, with display labels.
 *
 * AMC is labelled "sold" on purpose: a contract is booked in full on its
 * invoice date, so the figure is AMC *sold* in the period, not AMC earned
 * across the contract term.
 */
export const INCOME_LINE_TYPES: { lineType: string; key: string; label: string }[] = [
  { lineType: 'PART', key: 'parts', label: 'Parts' },
  { lineType: 'LABOR', key: 'labour', label: 'Labour' },
  { lineType: 'SERVICE_CHARGE', key: 'service', label: 'Service charge' },
  { lineType: 'CUSTOM_CHARGE', key: 'custom', label: 'Custom charge' },
  { lineType: 'AMC', key: 'amc', label: 'AMC sold' },
];

const round2 = (n: number) => Math.round(n * 100) / 100;
const pctOf = (amount: number, total: number) => (total > 0 ? round2((amount / total) * 100) : 0);

export function buildIncomeBreakdown({
  lineTypeRows,
  invoiceDiscount,
  partsCost,
  partsRevenueWithoutCost = 0,
}: IncomeBreakdownInput): IncomeBreakdown {
  const amountByType = new Map<string, number>();
  let taxCollected = 0;
  let discountFromLines = 0;

  for (const row of lineTypeRows) {
    const amount = Number(row.amount ?? 0);
    if (row.lineType === DISCOUNT_LINE_TYPE) {
      // Stored negative; report as a positive "amount given away".
      discountFromLines += -amount;
      continue;
    }
    amountByType.set(row.lineType, (amountByType.get(row.lineType) ?? 0) + amount);
    taxCollected += Number(row.tax ?? 0);
  }

  const totalIncome = [...amountByType.values()].reduce((s, n) => s + n, 0);

  const partsRevenue = amountByType.get('PART') ?? 0;
  const cost = Number(partsCost ?? 0);
  const margin = partsRevenue - cost;

  // The bar must still sum to totalIncome when parts were billed below cost, so
  // the cost segment is capped at parts revenue for display. The true (negative)
  // margin is preserved in `parts` and surfaced by the card.
  const costSegment = Math.min(cost, partsRevenue);
  const marginSegment = Math.max(margin, 0);

  const segments: IncomeSlice[] = [];
  if (partsRevenue !== 0) {
    segments.push({ key: 'partsCost', label: 'Parts — buying cost', amount: round2(costSegment), pct: pctOf(costSegment, totalIncome) });
    segments.push({ key: 'partsMargin', label: 'Parts — margin', amount: round2(marginSegment), pct: pctOf(marginSegment, totalIncome) });
  }
  for (const t of INCOME_LINE_TYPES) {
    if (t.lineType === 'PART') continue;
    const amount = amountByType.get(t.lineType) ?? 0;
    if (amount === 0) continue;
    segments.push({ key: t.key, label: t.label, amount: round2(amount), pct: pctOf(amount, totalIncome) });
  }

  const categories: IncomeSlice[] = INCOME_LINE_TYPES.map((t) => {
    const amount = amountByType.get(t.lineType) ?? 0;
    return { key: t.key, label: t.label, amount: round2(amount), pct: pctOf(amount, totalIncome) };
  }).filter((c) => c.amount !== 0);

  const discountTotal = discountFromLines + Number(invoiceDiscount ?? 0);

  return {
    totalIncome: round2(totalIncome),
    taxCollected: round2(taxCollected),
    discounts: {
      fromLines: round2(discountFromLines),
      invoiceLevel: round2(Number(invoiceDiscount ?? 0)),
      total: round2(discountTotal),
    },
    netInvoiced: round2(totalIncome - discountTotal),
    parts: {
      revenue: round2(partsRevenue),
      cost: round2(cost),
      margin: round2(margin),
      marginPct: partsRevenue > 0 ? round2((margin / partsRevenue) * 100) : null,
      soldBelowCost: margin < 0,
      revenueWithoutCost: round2(Number(partsRevenueWithoutCost ?? 0)),
    },
    segments,
    categories,
  };
}
