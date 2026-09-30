/**
 * Parts cost integrity and period profitability.
 *
 * `parts-profit.ts` already answers "what did parts earn". This module answers
 * the prior question: **can that figure be trusted at all**. In live data only
 * ~42% of parts revenue has a recorded buying price, so a blended margin over
 * all parts treats the rest as free stock and reads roughly three times too
 * high. Rather than publish one misleading number, every part line is graded by
 * why its cost is or is not known, and profit is reported as a range.
 *
 * Grades, and what each one costs to fix:
 *
 *   OK           cost resolved from a stock movement or the catalog.
 *   NO_COST      linked to a catalog item whose `costPrice` is 0. Needs data entry.
 *   UNLINKED     billed as a free-typed description with no catalog record.
 *   NO_MOVEMENT  linked, but no STOCK_OUT row was written for the invoice.
 *
 * Only OK carries a usable cost. The other three are all "revenue with no cost
 * basis" and are reported as such.
 *
 * There is deliberately no "recoverable" grade. `StockMovement.costPrice` is
 * stored as an explicit 0 on many rows, and because `COALESCE` only falls back
 * on NULL the naive expression discards a perfectly good catalog price. The
 * report query resolves cost with
 * `COALESCE(NULLIF(sm."costPrice", 0), ii."costPrice")`, so those lines grade as
 * OK here. The size of that correction is surfaced separately as a diagnostic,
 * because a query bug is not a property of the data.
 */

export const PART_GRADES = ['OK', 'NO_COST', 'UNLINKED', 'NO_MOVEMENT'] as const;
export type PartGrade = (typeof PART_GRADES)[number];

export const GRADE_LABELS: Record<PartGrade, string> = {
  OK: 'Costed correctly',
  NO_COST: 'No buying price',
  UNLINKED: 'No inventory link',
  NO_MOVEMENT: 'No stock movement',
};

export const GRADE_DESCRIPTIONS: Record<PartGrade, string> = {
  OK: 'Linked item with a real buying price',
  NO_COST: 'Linked to the catalog, but the item’s costPrice is 0',
  UNLINKED: 'Free-typed description, no catalog record at all',
  NO_MOVEMENT: 'Linked, but no STOCK_OUT row was written',
};

export const GRADE_FIXES: Record<PartGrade, string> = {
  OK: '—',
  NO_COST: 'Fill in costPrice on the item',
  UNLINKED: 'Add the part to the catalog',
  NO_MOVEMENT: 'Investigate the stock-movement write path',
};

/** One aggregated row per (grade, item-or-description) from the report query. */
export type PartIntegrityRow = {
  grade: PartGrade;
  itemId: string | null;
  sku: string | null;
  itemName: string | null;
  category: string | null;
  description: string | null;
  lines: number;
  qty: number;
  revenue: number;
  cost: number;
  maxUnitPrice: number;
};

export type GradeSummary = {
  grade: PartGrade;
  label: string;
  description: string;
  fix: string;
  lines: number;
  qty: number;
  revenue: number;
  cost: number;
  /** Share of total parts revenue, 0–100. */
  sharePct: number;
};

export type ProblemItem = {
  sku: string | null;
  name: string;
  category: string | null;
  lines: number;
  qty: number;
  revenue: number;
  maxUnitPrice: number;
};

export type PartsIntegrity = {
  lines: number;
  qty: number;
  revenue: number;
  /** Cost actually established (grade OK only). */
  cost: number;
  /** Revenue whose cost could not be established — every grade except OK. */
  revenueWithoutCost: number;
  /** Share of parts revenue with a real buying price, 0–100. */
  coveragePct: number;
  /** Margin over ALL parts revenue. Misleading when coverage is low; kept only to be shown crossed out. */
  naiveMarginPct: number | null;
  /** Margin over the costed subset. The only defensible figure. */
  costedMarginPct: number | null;
  byGrade: GradeSummary[];
  /** Complete list, highest revenue first. Not truncated. */
  noCostItems: ProblemItem[];
  /** Complete list of free-typed descriptions, highest revenue first. */
  unlinkedItems: ProblemItem[];
};

const round2 = (n: number) => Math.round(n * 100) / 100;
const pctOf = (part: number, whole: number) => (whole > 0 ? round2((part / whole) * 100) : 0);
const marginOf = (revenue: number, cost: number) =>
  revenue > 0 ? round2(((revenue - cost) / revenue) * 100) : null;

const toProblemItem = (r: PartIntegrityRow): ProblemItem => ({
  sku: r.sku,
  name: (r.itemName ?? r.description ?? '').trim() || 'Unnamed',
  category: r.category,
  lines: r.lines,
  qty: round2(r.qty),
  revenue: round2(r.revenue),
  maxUnitPrice: round2(r.maxUnitPrice),
});

const byRevenueDesc = (a: { revenue: number }, b: { revenue: number }) => b.revenue - a.revenue;

/** Collapse graded rows into headline totals, per-grade summaries and the two problem lists. */
export function buildPartsIntegrity(rows: PartIntegrityRow[]): PartsIntegrity {
  let lines = 0;
  let qty = 0;
  let revenue = 0;
  let cost = 0;
  let revenueWithoutCost = 0;

  const grades = new Map<PartGrade, { lines: number; qty: number; revenue: number; cost: number }>();

  for (const r of rows) {
    const rLines = Number(r.lines ?? 0);
    const rQty = Number(r.qty ?? 0);
    const rRevenue = Number(r.revenue ?? 0);
    const rCost = Number(r.cost ?? 0);

    lines += rLines;
    qty += rQty;
    revenue += rRevenue;

    // Only a grade of OK contributes usable cost. Everything else is revenue we
    // cannot cost, even where a partial cost happens to be present.
    if (r.grade === 'OK') cost += rCost;
    else revenueWithoutCost += rRevenue;

    const g = grades.get(r.grade) ?? { lines: 0, qty: 0, revenue: 0, cost: 0 };
    g.lines += rLines;
    g.qty += rQty;
    g.revenue += rRevenue;
    g.cost += rCost;
    grades.set(r.grade, g);
  }

  // Every grade is listed even at zero, so the table shape is stable and a
  // newly-appearing failure mode is obvious rather than silently absent.
  const byGrade: GradeSummary[] = PART_GRADES.map((grade) => {
    const g = grades.get(grade) ?? { lines: 0, qty: 0, revenue: 0, cost: 0 };
    return {
      grade,
      label: GRADE_LABELS[grade],
      description: GRADE_DESCRIPTIONS[grade],
      fix: GRADE_FIXES[grade],
      lines: g.lines,
      qty: round2(g.qty),
      revenue: round2(g.revenue),
      cost: round2(g.cost),
      sharePct: pctOf(g.revenue, revenue),
    };
  });

  const okRevenue = grades.get('OK')?.revenue ?? 0;

  return {
    lines,
    qty: round2(qty),
    revenue: round2(revenue),
    cost: round2(cost),
    revenueWithoutCost: round2(revenueWithoutCost),
    coveragePct: pctOf(okRevenue, revenue),
    naiveMarginPct: marginOf(revenue, cost),
    costedMarginPct: marginOf(okRevenue, cost),
    byGrade,
    noCostItems: rows.filter((r) => r.grade === 'NO_COST').map(toProblemItem).sort(byRevenueDesc),
    unlinkedItems: rows.filter((r) => r.grade === 'UNLINKED').map(toProblemItem).sort(byRevenueDesc),
  };
}

export type ProfitabilityInput = {
  /** Ex-GST income after discounts. */
  netIncome: number;
  /** Parts cost actually recorded. */
  partsCost: number;
  /** Parts revenue with no cost basis. */
  revenueWithoutCost: number;
  /** Margin measured on the costed subset, used to impute cost on the rest. */
  costedMarginPct: number | null;
  /** Overheads already pro-rated onto the period. */
  overheads: number;
};

export type ProfitScenario = {
  netIncome: number;
  partsCostRecorded: number;
  /** Cost imputed onto uncosted parts. Zero in the reported scenario. */
  partsCostImplied: number;
  grossProfit: number;
  overheads: number;
  netProfit: number;
};

export type Profitability = {
  /** Counts uncosted parts as zero-cost. Optimistic; matches what the raw data says. */
  reported: ProfitScenario;
  /** Charges uncosted parts at the measured margin. Realistic lower bound. */
  adjusted: ProfitScenario;
  /** Spread between the two net-profit figures — the cost of the missing data. */
  uncertainty: number;
};

/**
 * Build both profit scenarios.
 *
 * They share income, recorded cost and overheads, and differ only in how
 * `revenueWithoutCost` is treated: free stock in `reported`, or carrying the
 * same margin as properly-costed parts in `adjusted`. Publishing both makes the
 * uncertainty visible instead of picking a number and implying confidence.
 *
 * With no measured margin to extrapolate from (`costedMarginPct` null, i.e. no
 * costed parts at all) no cost can be imputed, and the two scenarios coincide.
 */
export function buildProfitability({
  netIncome,
  partsCost,
  revenueWithoutCost,
  costedMarginPct,
  overheads,
}: ProfitabilityInput): Profitability {
  const impliedCost =
    costedMarginPct === null ? 0 : round2(revenueWithoutCost * (1 - costedMarginPct / 100));

  const scenario = (implied: number): ProfitScenario => {
    const grossProfit = round2(netIncome - partsCost - implied);
    return {
      netIncome: round2(netIncome),
      partsCostRecorded: round2(partsCost),
      partsCostImplied: round2(implied),
      grossProfit,
      overheads: round2(overheads),
      netProfit: round2(grossProfit - overheads),
    };
  };

  const reported = scenario(0);
  const adjusted = scenario(impliedCost);

  return {
    reported,
    adjusted,
    uncertainty: round2(reported.netProfit - adjusted.netProfit),
  };
}
