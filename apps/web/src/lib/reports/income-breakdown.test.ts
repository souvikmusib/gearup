import { describe, expect, it } from 'vitest';
import { buildIncomeBreakdown, type LineTypeRow } from './income-breakdown';

/**
 * Amounts below are ex-GST (`lineTotal - taxAmount`), matching what the report's
 * raw query returns. Parts: 10,000 sold, 6,000 bought.
 */
const ROWS: LineTypeRow[] = [
  { lineType: 'PART', amount: 10_000, tax: 1_800 },
  { lineType: 'LABOR', amount: 5_000, tax: 900 },
  { lineType: 'SERVICE_CHARGE', amount: 2_000, tax: 360 },
  { lineType: 'CUSTOM_CHARGE', amount: 500, tax: 90 },
  { lineType: 'AMC', amount: 2_500, tax: 0 },
  { lineType: 'DISCOUNT_ADJUSTMENT', amount: -1_000, tax: 0 },
];

const build = (over: Partial<Parameters<typeof buildIncomeBreakdown>[0]> = {}) =>
  buildIncomeBreakdown({ lineTypeRows: ROWS, invoiceDiscount: 500, partsCost: 6_000, ...over });

describe('buildIncomeBreakdown', () => {
  it('totals income ex-GST and excludes discount lines from the total', () => {
    const r = build();
    // 10000 + 5000 + 2000 + 500 + 2500 — the -1000 discount line is not a category.
    expect(r.totalIncome).toBe(20_000);
    expect(r.taxCollected).toBe(3_150);
  });

  it('sums both discount mechanisms', () => {
    const r = build();
    expect(r.discounts).toEqual({ fromLines: 1_000, invoiceLevel: 500, total: 1_500 });
    expect(r.netInvoiced).toBe(18_500);
  });

  it('splits parts into buying cost and margin so the bar still sums to total income', () => {
    const r = build();
    const cost = r.segments.find((s) => s.key === 'partsCost')!;
    const margin = r.segments.find((s) => s.key === 'partsMargin')!;
    expect(cost.amount).toBe(6_000);
    expect(margin.amount).toBe(4_000);
    expect(cost.amount + margin.amount).toBe(r.parts.revenue);
    const segmentSum = r.segments.reduce((s, x) => s + x.amount, 0);
    expect(segmentSum).toBe(r.totalIncome);
  });

  it('orders bar segments parts-cost, parts-margin, then the other categories', () => {
    expect(build().segments.map((s) => s.key)).toEqual([
      'partsCost',
      'partsMargin',
      'labour',
      'service',
      'custom',
      'amc',
    ]);
  });

  it('reports parts margin and percentage', () => {
    const r = build();
    expect(r.parts).toMatchObject({ revenue: 10_000, cost: 6_000, margin: 4_000, marginPct: 40, soldBelowCost: false });
  });

  it('keeps parts as one row in the category strip, with percentages of total income', () => {
    const r = build();
    expect(r.categories.map((c) => [c.key, c.amount, c.pct])).toEqual([
      ['parts', 10_000, 50],
      ['labour', 5_000, 25],
      ['service', 2_000, 10],
      ['custom', 500, 2.5],
      ['amc', 2_500, 12.5],
    ]);
  });

  it('omits categories with no activity', () => {
    const r = buildIncomeBreakdown({
      lineTypeRows: [{ lineType: 'LABOR', amount: 800, tax: 0 }],
      invoiceDiscount: 0,
      partsCost: 0,
    });
    expect(r.categories.map((c) => c.key)).toEqual(['labour']);
    expect(r.segments.map((s) => s.key)).toEqual(['labour']);
  });

  it('caps the cost segment at parts revenue when parts were sold below cost, but keeps the real margin', () => {
    const r = build({ lineTypeRows: [{ lineType: 'PART', amount: 1_000, tax: 0 }], partsCost: 1_500, invoiceDiscount: 0 });
    expect(r.parts).toMatchObject({ margin: -500, marginPct: -50, soldBelowCost: true });
    // Bar must not render a negative segment, and must still sum to the total.
    expect(r.segments.find((s) => s.key === 'partsCost')!.amount).toBe(1_000);
    expect(r.segments.find((s) => s.key === 'partsMargin')!.amount).toBe(0);
    expect(r.segments.reduce((s, x) => s + x.amount, 0)).toBe(r.totalIncome);
  });

  it('carries through parts revenue that has no recorded buying price', () => {
    expect(build({ partsRevenueWithoutCost: 750 }).parts.revenueWithoutCost).toBe(750);
  });

  it('handles an empty period without dividing by zero', () => {
    const r = buildIncomeBreakdown({ lineTypeRows: [], invoiceDiscount: 0, partsCost: 0 });
    expect(r).toMatchObject({ totalIncome: 0, taxCollected: 0, netInvoiced: 0 });
    expect(r.parts.marginPct).toBeNull();
    expect(r.segments).toEqual([]);
    expect(r.categories).toEqual([]);
  });

  it('reports discounts even when nothing was billed as income', () => {
    const r = buildIncomeBreakdown({
      lineTypeRows: [{ lineType: 'DISCOUNT_ADJUSTMENT', amount: -200, tax: 0 }],
      invoiceDiscount: 50,
      partsCost: 0,
    });
    expect(r.totalIncome).toBe(0);
    expect(r.discounts.total).toBe(250);
    expect(r.netInvoiced).toBe(-250);
  });
});
