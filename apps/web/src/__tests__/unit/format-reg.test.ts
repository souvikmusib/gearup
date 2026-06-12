import { describe, it, expect } from 'vitest';
import { formatRegNumber, isValidRegNumber } from '../../lib/format-reg';

describe('formatRegNumber — additional edge cases', () => {
  it('strips dashes/spaces and uppercases', () => {
    expect(formatRegNumber('wb 26 ab 1234')).toBe('WB-26-AB-1234');
    expect(formatRegNumber('wb-26-ab-1234')).toBe('WB-26-AB-1234');
  });
  it('empty / whitespace input → empty string', () => {
    expect(formatRegNumber('')).toBe('');
    expect(formatRegNumber('   ')).toBe('');
  });
  it('handles 3-letter series', () => {
    expect(formatRegNumber('DL5SAB1234')).toBe('DL-5-SAB-1234');
  });
});

describe('isValidRegNumber', () => {
  it('accepts standard formats', () => {
    expect(isValidRegNumber('WB26AB1234')).toBe(true);
    expect(isValidRegNumber('KL01CA1234')).toBe(true);
    expect(isValidRegNumber('DL5SAB1234')).toBe(true);
    expect(isValidRegNumber('WB-26-AB-1234')).toBe(true);
  });
  it('accepts BH-series', () => {
    expect(isValidRegNumber('22BH1234AA')).toBe(true);
    expect(isValidRegNumber('22-BH-1234-AA')).toBe(true);
  });
  it('rejects too-short input', () => {
    expect(isValidRegNumber('ABC')).toBe(false);
  });
  it('rejects junk', () => {
    expect(isValidRegNumber('@@@@@@')).toBe(false);
    expect(isValidRegNumber('1234567890')).toBe(false);
  });
});
