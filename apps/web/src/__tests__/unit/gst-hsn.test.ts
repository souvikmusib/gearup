import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock prisma before importing the module
vi.mock('../../lib/prisma', () => ({
  prisma: {
    hsnRate: {
      findMany: vi.fn(),
    },
    inventoryItem: {
      findUnique: vi.fn(),
    },
  },
}));

import { prisma } from '../../lib/prisma';
import { getGstRate, resolveHsnCode, resolveHsnAndRate, invalidateHsnRateCache, DEFAULT_HSN } from '../../lib/hsn-rate';

const mockHsnRates = [
  { hsnCode: '87141090', rate: 18 },
  { hsnCode: '85071000', rate: 28 },
  { hsnCode: '998714', rate: 18 },
  { hsnCode: '27101019', rate: 18 },
];

describe('HSN Rate Lookup', () => {
  beforeEach(() => {
    invalidateHsnRateCache();
    vi.mocked(prisma.hsnRate.findMany).mockResolvedValue(mockHsnRates as any);
    vi.mocked(prisma.inventoryItem.findUnique).mockResolvedValue(null);
  });

  describe('getGstRate', () => {
    it('returns rate from lookup table for known HSN', async () => {
      expect(await getGstRate('87141090')).toBe(18);
      expect(await getGstRate('85071000')).toBe(28);
      expect(await getGstRate('998714')).toBe(18);
    });

    it('returns 18% for unknown HSN (present but not in table — safe default)', async () => {
      expect(await getGstRate('99999999')).toBe(18);
    });

    it('returns 0 rate for null/undefined HSN (no HSN = no GST)', async () => {
      expect(await getGstRate(null)).toBe(0);
      expect(await getGstRate(undefined)).toBe(0);
    });

    it('caches rates and does not re-fetch within TTL', async () => {
      invalidateHsnRateCache();
      vi.mocked(prisma.hsnRate.findMany).mockClear();
      await getGstRate('87141090');
      await getGstRate('85071000');
      await getGstRate('998714');
      // Should only call findMany once due to cache
      expect(prisma.hsnRate.findMany).toHaveBeenCalledTimes(1);
    });
  });

  describe('resolveHsnCode', () => {
    it('returns null for DISCOUNT_ADJUSTMENT', async () => {
      expect(await resolveHsnCode('DISCOUNT_ADJUSTMENT')).toBeNull();
    });

    it('returns explicit HSN when provided', async () => {
      expect(await resolveHsnCode('CUSTOM_CHARGE', null, '85071000')).toBe('85071000');
    });

    it('returns default SAC for SERVICE_CHARGE', async () => {
      expect(await resolveHsnCode('SERVICE_CHARGE')).toBe('998714');
    });

    it('returns default SAC for LABOR', async () => {
      expect(await resolveHsnCode('LABOR')).toBe('998714');
    });

    it('returns default SAC for AMC', async () => {
      expect(await resolveHsnCode('AMC')).toBe('998714');
    });

    it('returns default HSN for CUSTOM_CHARGE without explicit', async () => {
      expect(await resolveHsnCode('CUSTOM_CHARGE')).toBe('87141090');
    });

    it('looks up HSN from inventory item for PART', async () => {
      vi.mocked(prisma.inventoryItem.findUnique).mockResolvedValue({ hsnCode: '85071000' } as any);
      expect(await resolveHsnCode('PART', 'item-123')).toBe('85071000');
      expect(prisma.inventoryItem.findUnique).toHaveBeenCalledWith({
        where: { id: 'item-123' },
        select: { hsnCode: true },
      });
    });

    it('falls back to 87141090 for PART without inventory HSN', async () => {
      vi.mocked(prisma.inventoryItem.findUnique).mockResolvedValue({ hsnCode: null } as any);
      expect(await resolveHsnCode('PART', 'item-123')).toBe('87141090');
    });
  });

  describe('resolveHsnAndRate', () => {
    it('returns taxRate 0 when showGst is false', async () => {
      const result = await resolveHsnAndRate('PART', false, 'item-123');
      expect(result.taxRate).toBe(0);
      expect(result.hsnCode).not.toBeNull(); // HSN still resolved for tracking
    });

    it('returns resolved rate when showGst is true', async () => {
      vi.mocked(prisma.inventoryItem.findUnique).mockResolvedValue({ hsnCode: '85071000' } as any);
      const result = await resolveHsnAndRate('PART', true, 'item-123');
      expect(result.hsnCode).toBe('85071000');
      expect(result.taxRate).toBe(28); // Battery rate
    });

    it('returns 18% for service charge with GST enabled', async () => {
      const result = await resolveHsnAndRate('SERVICE_CHARGE', true);
      expect(result.hsnCode).toBe('998714');
      expect(result.taxRate).toBe(18);
    });

    it('returns 0% for discount adjustment (no HSN = no GST)', async () => {
      const result = await resolveHsnAndRate('DISCOUNT_ADJUSTMENT', true);
      expect(result.hsnCode).toBeNull();
      expect(result.taxRate).toBe(0); // null HSN → 0%
    });
  });

  describe('DEFAULT_HSN mapping', () => {
    it('has correct defaults for all service line types', () => {
      expect(DEFAULT_HSN.SERVICE_CHARGE).toBe('998714');
      expect(DEFAULT_HSN.LABOR).toBe('998714');
      expect(DEFAULT_HSN.AMC).toBe('998714');
      expect(DEFAULT_HSN.CUSTOM_CHARGE).toBe('87141090');
    });
  });
});

describe('Tax Calculation (back-calculation from inclusive price)', () => {
  it('correctly back-calculates 18% GST from inclusive price', () => {
    const inclusive = 118;
    const rate = 18;
    const taxable = inclusive / (1 + rate / 100);
    const cgst = taxable * (rate / 2) / 100;
    const sgst = taxable * (rate / 2) / 100;
    expect(taxable).toBeCloseTo(100, 2);
    expect(cgst).toBeCloseTo(9, 2);
    expect(sgst).toBeCloseTo(9, 2);
    expect(taxable + cgst + sgst).toBeCloseTo(inclusive, 2);
  });

  it('correctly back-calculates 28% GST from inclusive price', () => {
    const inclusive = 128;
    const rate = 28;
    const taxable = inclusive / (1 + rate / 100);
    const cgst = taxable * (rate / 2) / 100;
    const sgst = taxable * (rate / 2) / 100;
    expect(taxable).toBeCloseTo(100, 2);
    expect(cgst).toBeCloseTo(14, 2);
    expect(sgst).toBeCloseTo(14, 2);
    expect(taxable + cgst + sgst).toBeCloseTo(inclusive, 2);
  });

  it('handles 0% rate (no GST) correctly', () => {
    const inclusive = 100;
    const rate = 0;
    const taxable = inclusive / (1 + rate / 100);
    const cgst = taxable * (rate / 2) / 100;
    const sgst = taxable * (rate / 2) / 100;
    expect(taxable).toBe(100);
    expect(cgst).toBe(0);
    expect(sgst).toBe(0);
  });

  it('real-world: ₹425 engine oil at 18%', () => {
    const inclusive = 425;
    const rate = 18;
    const taxable = inclusive / (1 + rate / 100);
    const cgst = taxable * (rate / 2) / 100;
    const sgst = taxable * (rate / 2) / 100;
    expect(taxable).toBeCloseTo(360.17, 1);
    expect(cgst).toBeCloseTo(32.42, 1);
    expect(sgst).toBeCloseTo(32.42, 1);
  });

  it('real-world: ₹49 foam wash at 18% (on GST invoice)', () => {
    const inclusive = 49;
    const rate = 18;
    const taxable = inclusive / (1 + rate / 100);
    const cgst = taxable * (rate / 2) / 100;
    const sgst = taxable * (rate / 2) / 100;
    expect(taxable).toBeCloseTo(41.53, 1);
    expect(cgst).toBeCloseTo(3.74, 1);
    expect(sgst).toBeCloseTo(3.74, 1);
  });

  it('real-world: Amaron battery at 28%', () => {
    const inclusive = 1200;
    const rate = 28;
    const taxable = inclusive / (1 + rate / 100);
    const cgst = taxable * (rate / 2) / 100;
    const sgst = taxable * (rate / 2) / 100;
    expect(taxable).toBeCloseTo(937.5, 1);
    expect(cgst).toBeCloseTo(131.25, 1);
    expect(sgst).toBeCloseTo(131.25, 1);
    expect(taxable + cgst + sgst).toBeCloseTo(1200, 1);
  });
});
