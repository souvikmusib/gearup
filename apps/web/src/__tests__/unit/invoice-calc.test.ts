import { describe, it, expect } from 'vitest';
import {
  nonDiscountPreSubtotal,
  computeLineTotal,
  type InvoiceLineLike,
} from '../../lib/invoice-calc';

describe('nonDiscountPreSubtotal', () => {
  it('sums quantity*unitPrice of non-discount lines', () => {
    const lines: InvoiceLineLike[] = [
      { lineType: 'LABOR', quantity: 1, unitPrice: 500 },
      { lineType: 'PART', quantity: 2, unitPrice: 100 },
    ];
    expect(nonDiscountPreSubtotal(lines)).toBe(700);
  });

  it('excludes DISCOUNT_ADJUSTMENT lines from the base', () => {
    const lines: InvoiceLineLike[] = [
      { lineType: 'SERVICE_CHARGE', quantity: 1, unitPrice: 600 },
      { lineType: 'DISCOUNT_ADJUSTMENT', quantity: 1, unitPrice: 50, discountMode: 'flat' },
    ];
    expect(nonDiscountPreSubtotal(lines)).toBe(600);
  });

  it('returns 0 for an empty invoice', () => {
    expect(nonDiscountPreSubtotal([])).toBe(0);
  });
});

describe('computeLineTotal — non-discount lines', () => {
  it('applies per-line discountPercent then tax', () => {
    const r = computeLineTotal(
      { lineType: 'PART', quantity: 1, unitPrice: 1000, discountPercent: 10, taxRate: 18 },
      0,
    );
    // net = 1000 * 0.9 = 900; tax = 900 * 0.18 = 162; lineTotal = 1062
    expect(r.netLineTotal).toBe(900);
    expect(r.taxAmount).toBeCloseTo(162, 5);
    expect(r.lineTotal).toBeCloseTo(1062, 5);
  });

  it('defaults discountPercent and taxRate to 0', () => {
    const r = computeLineTotal({ lineType: 'LABOR', quantity: 2, unitPrice: 250 }, 0);
    expect(r.netLineTotal).toBe(500);
    expect(r.taxAmount).toBe(0);
    expect(r.lineTotal).toBe(500);
  });
});

describe('computeLineTotal — DISCOUNT_ADJUSTMENT lines', () => {
  it('flat discount is negative absolute quantity*unitPrice, no tax', () => {
    const r = computeLineTotal(
      { lineType: 'DISCOUNT_ADJUSTMENT', quantity: 1, unitPrice: 100, discountMode: 'flat' },
      999,
    );
    expect(r.lineTotal).toBe(-100);
    expect(r.taxAmount).toBe(0);
  });

  it('flat discount magnitude is always negative even if inputs are positive', () => {
    const r = computeLineTotal(
      { lineType: 'DISCOUNT_ADJUSTMENT', quantity: 3, unitPrice: 50, discountMode: 'flat' },
      0,
    );
    expect(r.lineTotal).toBe(-150);
  });

  it('percent discount is computed off the passed base, NOT the line qty/price', () => {
    // 10% off a 600 base => -60 (regression: the live E2E proved 600 -> 540)
    const r = computeLineTotal(
      { lineType: 'DISCOUNT_ADJUSTMENT', quantity: 1, unitPrice: 10, discountMode: 'percent' },
      600,
    );
    expect(r.lineTotal).toBe(-60);
    expect(r.taxAmount).toBe(0);
  });

  it('defaults discountMode to flat when omitted', () => {
    const r = computeLineTotal(
      { lineType: 'DISCOUNT_ADJUSTMENT', quantity: 1, unitPrice: 25 },
      1000,
    );
    expect(r.lineTotal).toBe(-25);
  });
});

describe('end-to-end invoice math (regression: 600 - 10% = 540)', () => {
  it('matches the live E2E lifecycle result', () => {
    const lines: InvoiceLineLike[] = [
      { lineType: 'LABOR', quantity: 1, unitPrice: 500, taxRate: 0 },
      { lineType: 'SERVICE_CHARGE', quantity: 1, unitPrice: 100, taxRate: 0 },
      { lineType: 'DISCOUNT_ADJUSTMENT', quantity: 1, unitPrice: 10, discountMode: 'percent' },
    ];
    const base = nonDiscountPreSubtotal(lines); // 600
    const total = lines.reduce((sum, l) => sum + computeLineTotal(l, base).lineTotal, 0);
    expect(base).toBe(600);
    expect(Math.round(total)).toBe(540);
  });
});
