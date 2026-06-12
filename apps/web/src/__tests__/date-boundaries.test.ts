import { describe, it, expect } from 'vitest';
import { getISTDayBoundaries, getISTRangeBoundaries } from '../lib/date-boundaries';

describe('getISTDayBoundaries', () => {
  it('returns correct IST day for a UTC morning time (before IST midnight flip)', () => {
    // 2026-06-08 02:00 UTC = 2026-06-08 07:30 IST → today is Jun 8
    const now = new Date('2026-06-08T02:00:00.000Z');
    const { todayStart, tomorrowStart } = getISTDayBoundaries(now);
    expect(todayStart.toISOString()).toBe('2026-06-07T18:30:00.000Z'); // Jun 8 00:00 IST
    expect(tomorrowStart.toISOString()).toBe('2026-06-08T18:30:00.000Z'); // Jun 9 00:00 IST
  });

  it('returns correct IST day for UTC evening (next IST day)', () => {
    // 2026-06-08 20:00 UTC = 2026-06-09 01:30 IST → today is Jun 9
    const now = new Date('2026-06-08T20:00:00.000Z');
    const { todayStart, tomorrowStart } = getISTDayBoundaries(now);
    expect(todayStart.toISOString()).toBe('2026-06-08T18:30:00.000Z'); // Jun 9 00:00 IST
    expect(tomorrowStart.toISOString()).toBe('2026-06-09T18:30:00.000Z'); // Jun 10 00:00 IST
  });

  it('payment at exactly IST midnight is included in that day', () => {
    const now = new Date('2026-06-08T10:00:00.000Z'); // Jun 8 15:30 IST
    const { todayStart, tomorrowStart } = getISTDayBoundaries(now);
    const paymentDate = new Date('2026-06-07T18:30:00.000Z'); // Jun 8 00:00 IST exactly
    expect(paymentDate >= todayStart).toBe(true);
    expect(paymentDate < tomorrowStart).toBe(true);
  });

  it('payment at 23:59 IST is included in that day', () => {
    const now = new Date('2026-06-08T10:00:00.000Z');
    const { todayStart, tomorrowStart } = getISTDayBoundaries(now);
    const paymentDate = new Date('2026-06-08T18:29:59.000Z'); // Jun 8 23:59:59 IST
    expect(paymentDate >= todayStart).toBe(true);
    expect(paymentDate < tomorrowStart).toBe(true);
  });

  it('payment at next IST midnight is NOT included', () => {
    const now = new Date('2026-06-08T10:00:00.000Z');
    const { todayStart, tomorrowStart } = getISTDayBoundaries(now);
    const paymentDate = new Date('2026-06-08T18:30:00.000Z'); // Jun 9 00:00 IST
    expect(paymentDate < tomorrowStart).toBe(false);
  });
});

describe('getISTRangeBoundaries', () => {
  it('creates correct boundaries from date strings', () => {
    const { start, end } = getISTRangeBoundaries('2026-06-01', '2026-06-08');
    expect(start.toISOString()).toBe('2026-05-31T18:30:00.000Z'); // Jun 1 00:00 IST
    expect(end.toISOString()).toBe('2026-06-08T18:29:59.000Z'); // Jun 8 23:59:59 IST
  });

  it('single day range covers full IST day', () => {
    const { start, end } = getISTRangeBoundaries('2026-06-08', '2026-06-08');
    const payment = new Date('2026-06-08T12:00:00.000Z'); // Jun 8 17:30 IST
    expect(payment >= start).toBe(true);
    expect(payment <= end).toBe(true);
  });
});
