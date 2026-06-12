import { describe, it, expect } from 'vitest';
import { calculateLineItem, calculateInvoiceTotals, type LineItemInput } from '../lib/invoice-calc';

describe('calculateLineItem', () => {
  it('calculates PART line total correctly', () => {
    const result = calculateLineItem({ lineType: 'PART', quantity: 2, unitPrice: 500, taxRate: 18 }, 0);
    expect(result.lineTotal).toBe(1000);
    expect(result.taxAmount).toBe(180);
  });

  it('calculates LABOR line with zero tax', () => {
    const result = calculateLineItem({ lineType: 'LABOR', quantity: 1, unitPrice: 300, taxRate: 0 }, 0);
    expect(result.lineTotal).toBe(300);
    expect(result.taxAmount).toBe(0);
  });

  it('calculates flat DISCOUNT_ADJUSTMENT', () => {
    const result = calculateLineItem({ lineType: 'DISCOUNT_ADJUSTMENT', quantity: 1, unitPrice: 100, taxRate: 0, discountMode: 'flat' }, 1000);
    expect(result.lineTotal).toBe(-100);
    expect(result.taxAmount).toBe(0);
  });

  it('calculates percent DISCOUNT_ADJUSTMENT', () => {
    const result = calculateLineItem({ lineType: 'DISCOUNT_ADJUSTMENT', quantity: 1, unitPrice: 10, taxRate: 0, discountMode: 'percent' }, 2000);
    expect(result.lineTotal).toBe(-200); // 10% of 2000
    expect(result.taxAmount).toBe(0);
  });

  it('defaults discount mode to flat when not specified', () => {
    const result = calculateLineItem({ lineType: 'DISCOUNT_ADJUSTMENT', quantity: 1, unitPrice: 50, taxRate: 0 }, 1000);
    expect(result.lineTotal).toBe(-50);
  });
});

describe('calculateInvoiceTotals', () => {
  it('calculates simple invoice with parts + labor', () => {
    const items: LineItemInput[] = [
      { lineType: 'PART', quantity: 1, unitPrice: 500, taxRate: 18 },
      { lineType: 'LABOR', quantity: 1, unitPrice: 300, taxRate: 18 },
    ];
    const result = calculateInvoiceTotals(items);
    expect(result.subtotal).toBe(800);
    expect(result.taxTotal).toBe(144); // 18% of 800
    expect(result.discountAmount).toBe(0);
    expect(result.grandTotal).toBe(944); // 800 + 144, rounded
  });

  it('rounds grandTotal to nearest rupee', () => {
    const items: LineItemInput[] = [
      { lineType: 'PART', quantity: 1, unitPrice: 333, taxRate: 18 },
    ];
    const result = calculateInvoiceTotals(items);
    // 333 + 59.94 = 392.94 → rounds to 393
    expect(result.grandTotal).toBe(393);
  });

  it('applies percentage invoice-level discount', () => {
    const items: LineItemInput[] = [
      { lineType: 'PART', quantity: 1, unitPrice: 1000, taxRate: 0 },
    ];
    const result = calculateInvoiceTotals(items, 'PERCENTAGE', 10);
    expect(result.subtotal).toBe(1000);
    expect(result.discountAmount).toBe(100);
    expect(result.grandTotal).toBe(900);
  });

  it('applies flat invoice-level discount', () => {
    const items: LineItemInput[] = [
      { lineType: 'PART', quantity: 2, unitPrice: 500, taxRate: 0 },
    ];
    const result = calculateInvoiceTotals(items, 'FLAT', 200);
    expect(result.subtotal).toBe(1000);
    expect(result.discountAmount).toBe(200);
    expect(result.grandTotal).toBe(800);
  });

  it('handles line-item discount + tax correctly', () => {
    const items: LineItemInput[] = [
      { lineType: 'PART', quantity: 1, unitPrice: 1000, taxRate: 18 },
      { lineType: 'DISCOUNT_ADJUSTMENT', quantity: 1, unitPrice: 100, taxRate: 0, discountMode: 'flat' },
    ];
    const result = calculateInvoiceTotals(items);
    expect(result.subtotal).toBe(900); // 1000 - 100
    expect(result.taxTotal).toBe(180); // tax only on PART: 1000 * 18%
    expect(result.grandTotal).toBe(1080); // 900 + 180
  });

  it('handles AMC line type (₹0 service)', () => {
    const items: LineItemInput[] = [
      { lineType: 'AMC', quantity: 1, unitPrice: 0, taxRate: 0 },
      { lineType: 'PART', quantity: 1, unitPrice: 49, taxRate: 0 },
    ];
    const result = calculateInvoiceTotals(items);
    expect(result.subtotal).toBe(49);
    expect(result.grandTotal).toBe(49);
  });

  it('handles empty line items', () => {
    const result = calculateInvoiceTotals([]);
    expect(result.subtotal).toBe(0);
    expect(result.taxTotal).toBe(0);
    expect(result.grandTotal).toBe(0);
  });

  it('real-world scenario: parts + labor + discount + tax', () => {
    const items: LineItemInput[] = [
      { lineType: 'PART', quantity: 2, unitPrice: 250, taxRate: 18 },   // 500 + 90 tax
      { lineType: 'PART', quantity: 1, unitPrice: 150, taxRate: 18 },   // 150 + 27 tax
      { lineType: 'LABOR', quantity: 1, unitPrice: 400, taxRate: 18 },  // 400 + 72 tax
      { lineType: 'DISCOUNT_ADJUSTMENT', quantity: 1, unitPrice: 5, taxRate: 0, discountMode: 'percent' }, // 5% of 1050 = -52.5
    ];
    const result = calculateInvoiceTotals(items);
    expect(result.subtotal).toBe(1050 - 52.5); // 997.5
    expect(result.taxTotal).toBe(189); // (500+150+400) * 0.18
    expect(result.grandTotal).toBe(Math.round(997.5 + 189)); // 1187
  });
});
