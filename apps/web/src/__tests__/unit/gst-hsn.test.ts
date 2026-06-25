import { describe, it, expect } from 'vitest';

/**
 * GST back-calculation logic used in PDF invoice when showGst=true.
 * All prices in GearUp are inclusive of 18% GST.
 * Taxable = Amount / 1.18
 * CGST = Taxable * 0.09
 * SGST = Taxable * 0.09
 * Verify: Taxable + CGST + SGST = Amount
 */

function backCalculateGst(amount: number) {
  const taxable = amount / 1.18;
  const cgst = taxable * 0.09;
  const sgst = taxable * 0.09;
  return { taxable, cgst, sgst };
}

function computeLineTotal(qty: number, unitPrice: number, discountPercent: number) {
  return qty * unitPrice * (1 - discountPercent / 100);
}

describe('GST back-calculation from inclusive price', () => {
  it('correctly splits ₹118 into taxable ₹100 + CGST ₹9 + SGST ₹9', () => {
    const { taxable, cgst, sgst } = backCalculateGst(118);
    expect(taxable).toBeCloseTo(100, 2);
    expect(cgst).toBeCloseTo(9, 2);
    expect(sgst).toBeCloseTo(9, 2);
    expect(taxable + cgst + sgst).toBeCloseTo(118, 2);
  });

  it('correctly handles ₹504.40 (Brake Shoe: 2×260×0.97)', () => {
    const amount = computeLineTotal(2, 260, 3); // 504.40
    expect(amount).toBeCloseTo(504.40, 2);
    const { taxable, cgst, sgst } = backCalculateGst(amount);
    expect(taxable).toBeCloseTo(427.46, 1);
    expect(cgst).toBeCloseTo(38.47, 1);
    expect(sgst).toBeCloseTo(38.47, 1);
    expect(taxable + cgst + sgst).toBeCloseTo(504.40, 2);
  });

  it('correctly handles ₹403.75 (Engine Oil: 1×425×0.95)', () => {
    const amount = computeLineTotal(1, 425, 5); // 403.75
    expect(amount).toBeCloseTo(403.75, 2);
    const { taxable, cgst, sgst } = backCalculateGst(amount);
    expect(taxable).toBeCloseTo(342.16, 1);
    expect(taxable + cgst + sgst).toBeCloseTo(403.75, 2);
  });

  it('handles zero amount', () => {
    const { taxable, cgst, sgst } = backCalculateGst(0);
    expect(taxable).toBe(0);
    expect(cgst).toBe(0);
    expect(sgst).toBe(0);
  });

  it('handles service charge ₹370 (no discount)', () => {
    const amount = computeLineTotal(1, 370, 0);
    const { taxable, cgst, sgst } = backCalculateGst(amount);
    expect(taxable).toBeCloseTo(313.56, 1);
    expect(taxable + cgst + sgst).toBeCloseTo(370, 2);
  });
});

describe('HSN code fallback logic', () => {
  function getHsn(itemHsnCode: string | null, lineType: string): string {
    return itemHsnCode || (lineType === 'PART' ? '87141090' : lineType === 'LABOR' || lineType === 'SERVICE_CHARGE' || lineType === 'CUSTOM_CHARGE' || lineType === 'AMC' ? '99871190' : '');
  }

  it('uses item hsnCode from DB when available', () => {
    expect(getHsn('27101019', 'PART')).toBe('27101019');
    expect(getHsn('40169300', 'PART')).toBe('40169300');
  });

  it('falls back to 87141090 for PART when hsnCode is null', () => {
    expect(getHsn(null, 'PART')).toBe('87141090');
  });

  it('falls back to 99871190 for services', () => {
    expect(getHsn(null, 'LABOR')).toBe('99871190');
    expect(getHsn(null, 'SERVICE_CHARGE')).toBe('99871190');
    expect(getHsn(null, 'CUSTOM_CHARGE')).toBe('99871190');
    expect(getHsn(null, 'AMC')).toBe('99871190');
  });

  it('returns empty for DISCOUNT_ADJUSTMENT', () => {
    expect(getHsn(null, 'DISCOUNT_ADJUSTMENT')).toBe('');
  });
});

describe('lineTotal calculation (existing logic, unchanged)', () => {
  it('qty × unitPrice × (1 - disc%)', () => {
    expect(computeLineTotal(2, 260, 3)).toBeCloseTo(504.40, 2);
    expect(computeLineTotal(1, 425, 5)).toBeCloseTo(403.75, 2);
    expect(computeLineTotal(1, 370, 0)).toBe(370);
    expect(computeLineTotal(2, 5, 0)).toBe(10);
  });

  it('100% discount = 0', () => {
    expect(computeLineTotal(1, 370, 100)).toBe(0);
  });
});
