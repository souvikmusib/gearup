import { describe, it, expect } from 'vitest';
import {
  PRORATION_DIVISOR,
  OVERHEAD_KEYS,
  OVERHEAD_SETTING_KEYS,
  EMPTY_OVERHEADS,
  settingKeyFor,
  overheadsFromSettings,
  daysInRange,
  prorateOverheads,
  type MonthlyOverheads,
} from './overheads';

const monthly = (over: Partial<MonthlyOverheads> = {}): MonthlyOverheads => ({
  ...EMPTY_OVERHEADS,
  ...over,
});

describe('settingKeyFor / OVERHEAD_SETTING_KEYS', () => {
  it('namespaces keys under overheads.monthly.', () => {
    expect(settingKeyFor('rent')).toBe('overheads.monthly.rent');
    expect(settingKeyFor('mechanic')).toBe('overheads.monthly.mechanic');
  });

  it('exposes one settings key per overhead bucket', () => {
    expect(OVERHEAD_SETTING_KEYS).toHaveLength(OVERHEAD_KEYS.length);
    expect(new Set(OVERHEAD_SETTING_KEYS).size).toBe(OVERHEAD_KEYS.length);
  });
});

describe('overheadsFromSettings', () => {
  it('reads numeric settings values', () => {
    const out = overheadsFromSettings({
      'overheads.monthly.rent': 25000,
      'overheads.monthly.electricity': 8000,
      'business.name': 'Gear Up',
    });
    expect(out.rent).toBe(25000);
    expect(out.electricity).toBe(8000);
  });

  it('coerces numeric strings, since Setting.value is loosely typed Json', () => {
    expect(overheadsFromSettings({ 'overheads.monthly.rent': '25000' }).rent).toBe(25000);
  });

  it('falls back to 0 for missing, null, negative and unparseable values', () => {
    const out = overheadsFromSettings({
      'overheads.monthly.rent': null,
      'overheads.monthly.electricity': 'not a number',
      'overheads.monthly.mechanic': -500,
    });
    expect(out.rent).toBe(0);
    expect(out.electricity).toBe(0);
    expect(out.mechanic).toBe(0);
    expect(out.tools).toBe(0); // absent entirely
  });
});

describe('daysInRange', () => {
  it('counts a single day as 1, not 0 — both endpoints are inclusive', () => {
    expect(daysInRange('2026-09-30', '2026-09-30')).toBe(1);
  });

  it('counts the mockup window as 30 days', () => {
    expect(daysInRange('2026-08-30', '2026-09-28')).toBe(30);
  });

  it('handles month and year boundaries', () => {
    expect(daysInRange('2026-01-01', '2026-01-31')).toBe(31);
    expect(daysInRange('2026-02-01', '2026-02-28')).toBe(28);
    expect(daysInRange('2026-12-31', '2027-01-01')).toBe(2);
  });

  it('counts a leap day', () => {
    expect(daysInRange('2028-02-01', '2028-02-29')).toBe(29);
  });

  it('returns 0 for reversed or malformed ranges rather than a negative', () => {
    expect(daysInRange('2026-09-30', '2026-09-01')).toBe(0);
    expect(daysInRange('nonsense', '2026-09-01')).toBe(0);
  });
});

describe('prorateOverheads', () => {
  it('divides by 30 for the daily rate and multiplies by days in range', () => {
    const out = prorateOverheads(monthly({ rent: 25000 }), 30);
    const rent = out.lines.find((l) => l.key === 'rent')!;
    expect(rent.perDay).toBeCloseTo(833.33, 2);
    expect(rent.forPeriod).toBe(25000);
  });

  it('charges one thirtieth of the month for a single-day filter', () => {
    const out = prorateOverheads(monthly({ rent: 25000, electricity: 8000 }), 1);
    expect(out.monthlyTotal).toBe(33000);
    expect(out.perDayTotal).toBe(1100);
    expect(out.forPeriodTotal).toBe(1100);
  });

  it('charges 31/30 for a 31-day month — the accepted cost of a flat divisor', () => {
    const out = prorateOverheads(monthly({ rent: 30000 }), 31);
    expect(out.forPeriodTotal).toBe(31000);
  });

  it('scales linearly with the number of days', () => {
    const m = monthly({ rent: 25000, mechanic: 85000 });
    const seven = prorateOverheads(m, 7).forPeriodTotal;
    const fourteen = prorateOverheads(m, 14).forPeriodTotal;
    // Within a paise — each total is independently rounded to 2dp.
    expect(fourteen).toBeCloseTo(seven * 2, 1);
  });

  it('emits a line for every bucket even when zero, so the table shape is stable', () => {
    const out = prorateOverheads(EMPTY_OVERHEADS, 30);
    expect(out.lines).toHaveLength(OVERHEAD_KEYS.length);
    expect(out.monthlyTotal).toBe(0);
    expect(out.forPeriodTotal).toBe(0);
  });

  it('derives the period total from the unrounded average, avoiding paise drift', () => {
    // 1000/30 = 33.333... per day. Summing a rounded 33.33 x 30 would give 999.90.
    const out = prorateOverheads(monthly({ rent: 1000, electricity: 1000, mechanic: 1000 }), 30);
    expect(out.forPeriodTotal).toBe(3000);
  });

  it('treats a zero or negative day count as no charge', () => {
    expect(prorateOverheads(monthly({ rent: 25000 }), 0).forPeriodTotal).toBe(0);
    expect(prorateOverheads(monthly({ rent: 25000 }), -5).forPeriodTotal).toBe(0);
  });

  it('reports the divisor it used', () => {
    expect(prorateOverheads(EMPTY_OVERHEADS, 30).divisor).toBe(PRORATION_DIVISOR);
  });
});
