/**
 * Parts gross-profit aggregation.
 *
 * Input rows come from the revenue report's raw query: one row per
 * (invoice day, inventory item) with the parts revenue billed and the cost of
 * the stock issued for it. Kept separate from the route so the arithmetic is
 * unit-testable without a database.
 */

export type PartProfitRow = {
  date: string;
  itemId: string | null;
  sku: string | null;
  itemName: string | null;
  qty: number;
  revenue: number;
  cost: number;
};

export type PartProfitItem = {
  itemId: string | null;
  sku: string | null;
  itemName: string;
  qty: number;
  revenue: number;
  cost: number;
  profit: number;
  marginPct: number | null;
  hasCostBasis: boolean;
};

export type PartsProfit = {
  revenue: number;
  cost: number;
  profit: number;
  marginPct: number | null;
  /** Parts revenue we have no buying price for — margin above is optimistic by this much. */
  revenueWithoutCost: number;
  daily: { date: string; revenue: number; cost: number; profit: number }[];
  items: PartProfitItem[];
};

export const UNLINKED_ITEM_KEY = '__unlinked__';
export const UNLINKED_ITEM_LABEL = 'Unlinked parts';

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Margin as a percentage of revenue. Null when there is no revenue to divide by. */
const marginOf = (revenue: number, profit: number) => (revenue > 0 ? round2((profit / revenue) * 100) : null);

/**
 * Collapse per-(day, item) rows into the shapes the report renders: headline
 * totals, a daily trend, and a per-item leaderboard sorted by profit.
 *
 * PART lines with no linked inventory item (manually typed) and items with a
 * zero cost price are counted into `revenueWithoutCost` rather than silently
 * inflating the margin.
 */
export function buildPartsProfit(rows: PartProfitRow[]): PartsProfit {
  let revenue = 0;
  let cost = 0;
  let revenueWithoutCost = 0;
  const byDate = new Map<string, { date: string; revenue: number; cost: number; profit: number }>();
  const byItem = new Map<
    string,
    { itemId: string | null; sku: string | null; itemName: string; qty: number; revenue: number; cost: number }
  >();

  for (const r of rows) {
    const rRevenue = Number(r.revenue ?? 0);
    const rCost = Number(r.cost ?? 0);
    const rQty = Number(r.qty ?? 0);

    revenue += rRevenue;
    cost += rCost;
    if (rCost === 0 && rRevenue > 0) revenueWithoutCost += rRevenue;

    const day = byDate.get(r.date) ?? { date: r.date, revenue: 0, cost: 0, profit: 0 };
    day.revenue += rRevenue;
    day.cost += rCost;
    day.profit = day.revenue - day.cost;
    byDate.set(r.date, day);

    const key = r.itemId ?? UNLINKED_ITEM_KEY;
    const item =
      byItem.get(key) ??
      { itemId: r.itemId, sku: r.sku, itemName: r.itemName ?? UNLINKED_ITEM_LABEL, qty: 0, revenue: 0, cost: 0 };
    item.qty += rQty;
    item.revenue += rRevenue;
    item.cost += rCost;
    byItem.set(key, item);
  }

  const profit = revenue - cost;

  return {
    revenue: round2(revenue),
    cost: round2(cost),
    profit: round2(profit),
    marginPct: marginOf(revenue, profit),
    revenueWithoutCost: round2(revenueWithoutCost),
    daily: [...byDate.values()]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((d) => ({ date: d.date, revenue: round2(d.revenue), cost: round2(d.cost), profit: round2(d.profit) })),
    items: [...byItem.values()]
      .map((i) => {
        const itemProfit = i.revenue - i.cost;
        return {
          itemId: i.itemId,
          sku: i.sku,
          itemName: i.itemName,
          qty: round2(i.qty),
          revenue: round2(i.revenue),
          cost: round2(i.cost),
          profit: round2(itemProfit),
          marginPct: marginOf(i.revenue, itemProfit),
          hasCostBasis: i.cost > 0,
        };
      })
      .sort((a, b) => b.profit - a.profit),
  };
}
