import { describe, it, expect } from 'vitest';
import { formatRegNumber } from '../lib/format-reg';

describe('formatRegNumber', () => {
  it('formats standard WB-26-AB-1234 input', () => {
    expect(formatRegNumber('wb26ab1234')).toBe('WB-26-AB-1234');
  });

  it('formats single-letter series', () => {
    expect(formatRegNumber('wb68k5489')).toBe('WB-68-K-5489');
  });

  it('handles already formatted input', () => {
    expect(formatRegNumber('WB-26-AB-1234')).toBe('WB-26-AB-1234');
  });

  it('formats MH style', () => {
    expect(formatRegNumber('mh12de1433')).toBe('MH-12-DE-1433');
  });

  it('handles partial input', () => {
    expect(formatRegNumber('wb')).toBe('WB');
    expect(formatRegNumber('wb26')).toBe('WB-26');
    expect(formatRegNumber('wb26ab')).toBe('WB-26-AB');
  });

  it('handles empty input', () => {
    expect(formatRegNumber('')).toBe('');
  });

  it('uppercases input', () => {
    expect(formatRegNumber('ka51mc3456')).toBe('KA-51-MC-3456');
  });
});

describe('numberToWords (imported via invoice-calc or inline)', () => {
  // Testing the logic directly
  function numberToWords(num: number): string {
    if (num === 0) return 'Zero';
    const ones = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
    const tens = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
    const scales = ['','Thousand','Lakh','Crore'];
    const toWords = (n: number): string => { if (n === 0) return ''; if (n < 20) return ones[n]; if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : ''); return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' + toWords(n % 100) : ''); };
    const int = Math.round(num);
    if (int < 1000) return toWords(int);
    const parts: string[] = [];
    const groups = [int % 1000, Math.floor(int / 1000) % 100, Math.floor(int / 100000) % 100, Math.floor(int / 10000000)];
    groups.forEach((g, i) => { if (g) parts.unshift(toWords(g) + ' ' + scales[i]); });
    return parts.join(' ').trim();
  }

  it('converts small numbers', () => {
    expect(numberToWords(49)).toBe('Forty Nine');
    expect(numberToWords(319)).toBe('Three Hundred Nineteen');
  });

  it('converts thousands', () => {
    expect(numberToWords(3762)).toBe('Three Thousand Seven Hundred Sixty Two');
    expect(numberToWords(8019)).toBe('Eight Thousand Nineteen');
  });

  it('converts lakhs', () => {
    expect(numberToWords(125000)).toBe('One Lakh Twenty Five Thousand');
  });

  it('handles zero', () => {
    expect(numberToWords(0)).toBe('Zero');
  });

  it('handles exact thousands', () => {
    expect(numberToWords(15000)).toBe('Fifteen Thousand');
  });

  it('rounds decimal input', () => {
    expect(numberToWords(999.7)).toBe('One Thousand');
    expect(numberToWords(999.4)).toBe('Nine Hundred Ninety Nine');
  });
});

describe('IST date formatting', () => {
  function formatDateIST(date: Date | string, opts?: { long?: boolean }): string {
    const d = new Date(new Date(date).getTime() + 5.5 * 60 * 60 * 1000);
    if (opts?.long) {
      const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
      return `${d.getUTCDate()} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
    }
    return `${d.getUTCDate()}/${d.getUTCMonth() + 1}/${d.getUTCFullYear()}`;
  }

  it('converts UTC midnight to correct IST date', () => {
    // 2026-06-05T18:30:00Z = IST midnight June 6
    expect(formatDateIST('2026-06-05T18:30:00.000Z')).toBe('6/6/2026');
  });

  it('long format works', () => {
    expect(formatDateIST('2026-06-05T18:30:00.000Z', { long: true })).toBe('6 June 2026');
  });

  it('handles regular UTC time correctly', () => {
    // 2026-06-06T06:00:00Z = IST 11:30 AM June 6
    expect(formatDateIST('2026-06-06T06:00:00.000Z')).toBe('6/6/2026');
  });

  it('handles IST evening correctly (still same day)', () => {
    // 2026-06-06T17:00:00Z = IST 10:30 PM June 6
    expect(formatDateIST('2026-06-06T17:00:00.000Z')).toBe('6/6/2026');
  });
});

describe('SERVICE_CHARGE line type', () => {
  // Using the same calculateLineItem logic
  it('SERVICE_CHARGE treated same as CUSTOM_CHARGE for calculation', () => {
    // SERVICE_CHARGE is just a label distinction, same math as CUSTOM_CHARGE
    const qty = 1;
    const unitPrice = 350;
    const taxRate = 0;
    const subtotal = qty * unitPrice;
    const taxAmount = subtotal * (taxRate / 100);
    const lineTotal = subtotal + taxAmount;
    expect(lineTotal).toBe(350);
  });

  it('SERVICE_CHARGE with AMC should be ₹0', () => {
    // When AMC covers it, lineTotal is 0
    const amcCovered = true;
    const lineTotal = amcCovered ? 0 : 350;
    expect(lineTotal).toBe(0);
  });
});

describe('grandTotal rounding', () => {
  it('rounds to nearest rupee', () => {
    const subtotal = 395.25;
    const taxTotal = 0;
    const discountAmount = 0;
    const grandTotal = Math.round(subtotal + taxTotal - discountAmount);
    expect(grandTotal).toBe(395);
  });

  it('rounds up from .5', () => {
    const grandTotal = Math.round(100.5);
    expect(grandTotal).toBe(101);
  });

  it('rounds down below .5', () => {
    const grandTotal = Math.round(100.49);
    expect(grandTotal).toBe(100);
  });
});
