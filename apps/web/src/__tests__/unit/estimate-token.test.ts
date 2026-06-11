import { describe, it, expect } from 'vitest';
import {
  generateEstimateToken,
  defaultEstimateTokenExpiry,
  computeEstimateRevision,
  MIN_TOKEN_LENGTH,
  ESTIMATE_TOKEN_TTL_MS,
} from '../../lib/estimate-token';

describe('generateEstimateToken', () => {
  it('produces a base64url token at/above the min length', () => {
    const t = generateEstimateToken();
    expect(t.length).toBeGreaterThanOrEqual(MIN_TOKEN_LENGTH);
    expect(t).toMatch(/^[A-Za-z0-9_-]+$/); // base64url, no + / =
  });

  it('is unique across calls', () => {
    const set = new Set(Array.from({ length: 100 }, () => generateEstimateToken()));
    expect(set.size).toBe(100);
  });
});

describe('defaultEstimateTokenExpiry', () => {
  it('is exactly TTL after the given now', () => {
    const now = new Date('2026-06-12T00:00:00.000Z');
    const exp = defaultEstimateTokenExpiry(now);
    expect(exp.getTime() - now.getTime()).toBe(ESTIMATE_TOKEN_TTL_MS);
  });
});

describe('computeEstimateRevision', () => {
  const base = {
    estimatedPartsCost: 100,
    estimatedLaborCost: 200,
    estimatedOtherCost: 0,
    estimatedTotal: 300,
    customerVisibleNotes: 'note',
    estimateNotes: 'internal',
  };

  it('is deterministic for identical inputs', () => {
    expect(computeEstimateRevision(base)).toBe(computeEstimateRevision({ ...base }));
  });

  it('changes when any priced field changes (price-pinning guarantee)', () => {
    const a = computeEstimateRevision(base);
    expect(computeEstimateRevision({ ...base, estimatedTotal: 301 })).not.toBe(a);
    expect(computeEstimateRevision({ ...base, estimatedPartsCost: 101 })).not.toBe(a);
    expect(computeEstimateRevision({ ...base, customerVisibleNotes: 'changed' })).not.toBe(a);
  });

  it('treats numeric strings and numbers equivalently (Decimal-safe)', () => {
    const asNum = computeEstimateRevision(base);
    const asStr = computeEstimateRevision({
      ...base,
      estimatedPartsCost: '100',
      estimatedLaborCost: '200',
      estimatedTotal: '300',
    });
    expect(asStr).toBe(asNum);
  });

  it('treats null notes the same as empty string', () => {
    const a = computeEstimateRevision({ ...base, customerVisibleNotes: null, estimateNotes: null });
    const b = computeEstimateRevision({ ...base, customerVisibleNotes: '', estimateNotes: '' });
    expect(a).toBe(b);
  });

  it('returns a 32-char base64url digest', () => {
    expect(computeEstimateRevision(base)).toMatch(/^[A-Za-z0-9_-]{32}$/);
  });
});
