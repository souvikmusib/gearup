import { describe, expect, it } from 'vitest';
import { buildPartsProfit, UNLINKED_ITEM_LABEL, type PartProfitRow } from './parts-profit';

/**
 * Fixture below is the verbatim output of the revenue report's parts query run
 * against a throwaway Postgres seeded with:
 *   - Brake Pad: 4 sold for 1000, issued from two FIFO batches (2@90 + 2@110 = 400)
 *   - Engine Oil: 2 sold for 240, legacy movement with no batch cost -> item costPrice 40 * 2 = 80
 *   - Air Filter: 1 sold for 300, item costPrice is 0 -> no cost basis
 *   - A manually typed PART line with no inventory link: 150 revenue, no cost
 * A LABOR line, a DRAFT invoice and an out-of-range invoice were correctly excluded by the query.
 */
const ROWS: PartProfitRow[] = [
  { date: '2026-07-10', itemId: 'itm1', sku: 'BRK-01', itemName: 'Brake Pad', qty: 4, revenue: 1000, cost: 400 },
  { date: '2026-07-10', itemId: 'itm3', sku: 'FLT-01', itemName: 'Air Filter', qty: 1, revenue: 300, cost: 0 },
  { date: '2026-07-10', itemId: 'itm2', sku: 'OIL-01', itemName: 'Engine Oil', qty: 2, revenue: 240, cost: 80 },
  { date: '2026-07-10', itemId: null, sku: null, itemName: null, qty: 1, revenue: 150, cost: 0 },
];

describe('buildPartsProfit', () => {
  it('totals revenue, cost and gross profit across all rows', () => {
    const r = buildPartsProfit(ROWS);
    expect(r.revenue).toBe(1690);
    expect(r.cost).toBe(480);
    expect(r.profit).toBe(1210);
    expect(r.marginPct).toBeCloseTo(71.6, 1);
  });

  it('reports parts revenue that has no buying price instead of hiding it', () => {
    // Air Filter (300, zero cost price) + the manually typed line (150).
    expect(buildPartsProfit(ROWS).revenueWithoutCost).toBe(450);
  });

  it('groups by day and orders the trend chronologically', () => {
    const r = buildPartsProfit([
      ...ROWS,
      { date: '2026-07-02', itemId: 'itm1', sku: 'BRK-01', itemName: 'Brake Pad', qty: 1, revenue: 250, cost: 90 },
    ]);
    expect(r.daily.map((d) => d.date)).toEqual(['2026-07-02', '2026-07-10']);
    expect(r.daily[0]).toEqual({ date: '2026-07-02', revenue: 250, cost: 90, profit: 160 });
    expect(r.daily[1]).toEqual({ date: '2026-07-10', revenue: 1690, cost: 480, profit: 1210 });
  });

  it('ranks items by gross profit and flags those without a cost basis', () => {
    const items = buildPartsProfit(ROWS).items;
    expect(items.map((i) => i.itemName)).toEqual(['Brake Pad', 'Air Filter', 'Engine Oil', UNLINKED_ITEM_LABEL]);
    expect(items[0]).toMatchObject({ sku: 'BRK-01', qty: 4, revenue: 1000, cost: 400, profit: 600, hasCostBasis: true });
    expect(items[0].marginPct).toBe(60);
    expect(items.find((i) => i.sku === 'FLT-01')).toMatchObject({ cost: 0, hasCostBasis: false });
    expect(items.find((i) => i.itemName === UNLINKED_ITEM_LABEL)).toMatchObject({ itemId: null, hasCostBasis: false });
  });

  it('merges rows for the same item across multiple days', () => {
    const r = buildPartsProfit([
      { date: '2026-07-01', itemId: 'itm1', sku: 'BRK-01', itemName: 'Brake Pad', qty: 2, revenue: 500, cost: 180 },
      { date: '2026-07-05', itemId: 'itm1', sku: 'BRK-01', itemName: 'Brake Pad', qty: 3, revenue: 750, cost: 300 },
    ]);
    expect(r.items).toHaveLength(1);
    expect(r.items[0]).toMatchObject({ qty: 5, revenue: 1250, cost: 480, profit: 770 });
  });

  it('surfaces a negative margin when parts are sold below cost', () => {
    const r = buildPartsProfit([
      { date: '2026-07-01', itemId: 'itm1', sku: 'BRK-01', itemName: 'Brake Pad', qty: 1, revenue: 80, cost: 100 },
    ]);
    expect(r.profit).toBe(-20);
    expect(r.marginPct).toBe(-25);
  });

  it('returns zeroed totals and a null margin for an empty period', () => {
    const r = buildPartsProfit([]);
    expect(r).toMatchObject({ revenue: 0, cost: 0, profit: 0, marginPct: null, revenueWithoutCost: 0 });
    expect(r.daily).toEqual([]);
    expect(r.items).toEqual([]);
  });

  it('rounds fractional currency to two decimals', () => {
    const r = buildPartsProfit([
      { date: '2026-07-01', itemId: 'itm1', sku: 'A', itemName: 'A', qty: 0.5, revenue: 33.333, cost: 11.111 },
    ]);
    expect(r.revenue).toBe(33.33);
    expect(r.cost).toBe(11.11);
    expect(r.profit).toBe(22.22);
  });
});
