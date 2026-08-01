import { describe, expect, it } from 'vitest';
import { RANGE_PRESETS, istDaysAgo, istMonthStart, istToday } from './date-presets';

const resolve = (id: string, now: Date) => RANGE_PRESETS.find((p) => p.id === id)!.resolve(now);

describe('IST date presets', () => {
  // 02:00 IST on 1 Aug 2026 is still 31 Jul in UTC. A UTC-derived preset reports
  // the wrong day here, and the wrong month for "This month".
  const earlyMorningIst = new Date('2026-07-31T20:30:00Z');

  it('uses the IST calendar day before UTC has rolled over', () => {
    expect(istToday(earlyMorningIst)).toBe('2026-08-01');
    expect(earlyMorningIst.toISOString().slice(0, 10)).toBe('2026-07-31'); // the old, wrong basis
  });

  it('resolves Today to the IST day at both ends', () => {
    expect(resolve('today', earlyMorningIst)).toEqual({ from: '2026-08-01', to: '2026-08-01' });
  });

  it('resolves This month to the IST calendar month, not a rolling window', () => {
    expect(resolve('thisMonth', earlyMorningIst)).toEqual({ from: '2026-08-01', to: '2026-08-01' });
    expect(resolve('thisMonth', new Date('2026-08-20T10:00:00Z'))).toEqual({ from: '2026-08-01', to: '2026-08-20' });
  });

  it('makes rolling windows inclusive of today, matching their labels', () => {
    const mid = new Date('2026-08-20T10:00:00Z');
    // 7 days inclusive of the 20th spans the 14th to the 20th.
    expect(resolve('last7', mid)).toEqual({ from: '2026-08-14', to: '2026-08-20' });
    expect(resolve('last30', mid)).toEqual({ from: '2026-07-22', to: '2026-08-20' });
    expect(resolve('last90', mid)).toEqual({ from: '2026-05-23', to: '2026-08-20' });
  });

  it('crosses month and year boundaries correctly', () => {
    expect(istDaysAgo(1, new Date('2026-03-01T05:00:00Z'))).toBe('2026-02-28');
    expect(istDaysAgo(1, new Date('2028-03-01T05:00:00Z'))).toBe('2028-02-29'); // leap year
    expect(istMonthStart(new Date('2026-01-15T05:00:00Z'))).toBe('2026-01-01');
    expect(istDaysAgo(30, new Date('2026-01-10T05:00:00Z'))).toBe('2025-12-11');
  });

  it('never produces a from later than to', () => {
    const now = new Date('2026-08-20T10:00:00Z');
    for (const p of RANGE_PRESETS) {
      const { from, to } = p.resolve(now);
      expect(from <= to, `${p.id}: ${from} > ${to}`).toBe(true);
    }
  });

  it('labels rolling windows by what they do', () => {
    expect(RANGE_PRESETS.map((p) => p.label)).toEqual([
      'Today',
      'Last 7 days',
      'Last 30 days',
      'Last 90 days',
      'This month',
      'Custom',
    ]);
  });
});
