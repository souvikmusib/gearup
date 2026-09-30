import { describe, it, expect } from 'vitest';
import {
  PART_GRADES,
  buildPartsIntegrity,
  buildProfitability,
  type PartIntegrityRow,
} from './parts-integrity';

const row = (over: Partial<PartIntegrityRow> = {}): PartIntegrityRow => ({
  grade: 'OK',
  itemId: 'itm_1',
  sku: 'SKU-1',
  itemName: 'Brake Shoe',
  category: 'BRAKE & CLUTCH',
  description: 'Brake Shoe',
  lines: 1,
  qty: 1,
  revenue: 1000,
  cost: 700,
  maxUnitPrice: 1000,
  ...over,
});

describe('buildPartsIntegrity', () => {
  it('sums revenue across every grade', () => {
    const out = buildPartsIntegrity([
      row({ grade: 'OK', revenue: 1000, cost: 700 }),
      row({ grade: 'NO_COST', revenue: 500, cost: 0 }),
      row({ grade: 'UNLINKED', revenue: 250, cost: 0 }),
    ]);
    expect(out.revenue).toBe(1750);
    expect(out.lines).toBe(3);
  });

  it('counts cost only from OK rows', () => {
    const out = buildPartsIntegrity([
      row({ grade: 'OK', revenue: 1000, cost: 700 }),
      // A partial cost on a non-OK row must not leak into the usable total.
      row({ grade: 'NO_MOVEMENT', revenue: 500, cost: 400 }),
    ]);
    expect(out.cost).toBe(700);
    expect(out.revenueWithoutCost).toBe(500);
  });

  it('computes coverage as the OK share of revenue', () => {
    const out = buildPartsIntegrity([
      row({ grade: 'OK', revenue: 400, cost: 300 }),
      row({ grade: 'NO_COST', revenue: 600, cost: 0 }),
    ]);
    expect(out.coveragePct).toBe(40);
  });

  it('separates the naive margin from the costed margin', () => {
    const out = buildPartsIntegrity([
      row({ grade: 'OK', revenue: 1000, cost: 800 }),
      row({ grade: 'NO_COST', revenue: 1000, cost: 0 }),
    ]);
    // Naive spreads 800 of cost over 2000 of revenue -> 60%.
    expect(out.naiveMarginPct).toBe(60);
    // Costed subset is the honest figure -> 20%.
    expect(out.costedMarginPct).toBe(20);
  });

  it('lists every grade even when absent, so a new failure mode is visible', () => {
    const out = buildPartsIntegrity([row({ grade: 'OK' })]);
    expect(out.byGrade.map((g) => g.grade)).toEqual([...PART_GRADES]);
    const unlinked = out.byGrade.find((g) => g.grade === 'UNLINKED')!;
    expect(unlinked.lines).toBe(0);
    expect(unlinked.sharePct).toBe(0);
  });

  it('returns the complete problem lists sorted by revenue, not truncated', () => {
    const rows: PartIntegrityRow[] = [
      ...Array.from({ length: 40 }, (_, i) =>
        row({ grade: 'NO_COST', sku: `S${i}`, itemName: `Item ${i}`, revenue: i * 10 }),
      ),
      ...Array.from({ length: 15 }, (_, i) =>
        row({ grade: 'UNLINKED', itemId: null, sku: null, itemName: null, description: `TYRE ${i}`, revenue: i }),
      ),
    ];
    const out = buildPartsIntegrity(rows);
    expect(out.noCostItems).toHaveLength(40);
    expect(out.unlinkedItems).toHaveLength(15);
    expect(out.noCostItems[0].revenue).toBe(390);
    expect(out.unlinkedItems[0].revenue).toBe(14);
  });

  it('falls back to the typed description when an unlinked row has no item name', () => {
    const out = buildPartsIntegrity([
      row({ grade: 'UNLINKED', itemId: null, sku: null, itemName: null, description: '  F CEAT TYRE  ' }),
    ]);
    expect(out.unlinkedItems[0].name).toBe('F CEAT TYRE');
  });

  it('handles an empty period without dividing by zero', () => {
    const out = buildPartsIntegrity([]);
    expect(out.revenue).toBe(0);
    expect(out.coveragePct).toBe(0);
    expect(out.naiveMarginPct).toBeNull();
    expect(out.costedMarginPct).toBeNull();
    expect(out.noCostItems).toEqual([]);
  });

  it('reproduces the figures measured against production for 2026-08-30..2026-09-28', () => {
    // Aggregates verified by two independently-shaped SQL queries. OK includes the
    // 13 lines / 8501.24 revenue / 7056 cost that the NULLIF-corrected resolution
    // recovers, which the naive COALESCE expression would have dropped.
    const out = buildPartsIntegrity([
      row({ grade: 'OK', lines: 437, qty: 468, revenue: 172181.34, cost: 136086.7 }),
      row({ grade: 'NO_COST', lines: 553, qty: 610, revenue: 183199.88, cost: 0 }),
      row({ grade: 'UNLINKED', lines: 96, qty: 107, revenue: 35413, cost: 0 }),
    ]);
    expect(out.lines).toBe(1086);
    expect(out.revenue).toBeCloseTo(390794.22, 2);
    expect(out.coveragePct).toBeCloseTo(44.06, 1);
    expect(out.costedMarginPct).toBeCloseTo(20.96, 1);
    expect(out.naiveMarginPct).toBeCloseTo(65.18, 1);
    expect(out.revenueWithoutCost).toBeCloseTo(218612.88, 2);
  });
});

describe('buildProfitability', () => {
  const base = {
    netIncome: 100000,
    partsCost: 20000,
    revenueWithoutCost: 40000,
    costedMarginPct: 25,
    overheads: 10000,
  };

  it('treats uncosted parts as free stock in the reported scenario', () => {
    const { reported } = buildProfitability(base);
    expect(reported.partsCostImplied).toBe(0);
    expect(reported.grossProfit).toBe(80000);
    expect(reported.netProfit).toBe(70000);
  });

  it('imputes cost at the measured margin in the adjusted scenario', () => {
    const { adjusted } = buildProfitability(base);
    // 40000 uncosted at a 25% margin implies 75% cost -> 30000.
    expect(adjusted.partsCostImplied).toBe(30000);
    expect(adjusted.grossProfit).toBe(50000);
    expect(adjusted.netProfit).toBe(40000);
  });

  it('reports the spread between scenarios as the cost of missing data', () => {
    expect(buildProfitability(base).uncertainty).toBe(30000);
  });

  it('subtracts the same overheads from both scenarios', () => {
    const { reported, adjusted } = buildProfitability(base);
    expect(reported.overheads).toBe(10000);
    expect(adjusted.overheads).toBe(10000);
  });

  it('collapses the two scenarios when there is no margin to extrapolate from', () => {
    const out = buildProfitability({ ...base, costedMarginPct: null });
    expect(out.adjusted.partsCostImplied).toBe(0);
    expect(out.uncertainty).toBe(0);
    expect(out.reported.netProfit).toBe(out.adjusted.netProfit);
  });

  it('collapses the two scenarios when every part is already costed', () => {
    const out = buildProfitability({ ...base, revenueWithoutCost: 0 });
    expect(out.uncertainty).toBe(0);
  });

  it('reports a loss as a negative net profit rather than clamping', () => {
    const out = buildProfitability({ ...base, overheads: 200000 });
    expect(out.reported.netProfit).toBe(-120000);
  });

  it('reproduces the production profitability spread at the example overheads', () => {
    const out = buildProfitability({
      netIncome: 518794.22,
      partsCost: 136086.7,
      revenueWithoutCost: 218612.88,
      costedMarginPct: 20.96,
      overheads: 127000,
    });
    expect(out.reported.grossProfit).toBeCloseTo(382707.52, 1);
    expect(out.reported.netProfit).toBeCloseTo(255707.52, 1);
    expect(out.adjusted.netProfit).toBeCloseTo(82915.9, 0);
    // The missing cost data is worth more than a lakh of reported profit.
    expect(out.uncertainty).toBeGreaterThan(170000);
  });
});
