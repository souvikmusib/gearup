/**
 * Monthly overheads and their pro-rating onto a report period.
 *
 * Overheads (rent, electricity, mechanic salaries, ...) are entered once as
 * MONTHLY figures and stored as `Setting` rows. A report covering an arbitrary
 * date range has to charge a fair slice of them, so:
 *
 *     perDay      = monthly / 30
 *     forPeriod   = perDay * daysInRange
 *
 * The divisor is a flat 30, not the true length of the calendar month, and that
 * is deliberate. A calendar-accurate divisor makes the same rent cost
 * ₹893/day in February and ₹806/day in March, so two periods of equal length
 * stop being comparable. A flat 30 keeps "cost per day" stable all year, which
 * is what makes period-over-period comparison meaningful. The trade-off is that
 * a full calendar month of 31 days charges 31/30 of the monthly figure; that is
 * accepted and documented here rather than hidden.
 */

export const PRORATION_DIVISOR = 30;

/** Settings key prefix. Matches the existing `business.*` / `invoice.*` convention. */
export const OVERHEAD_SETTING_PREFIX = 'overheads.monthly.';

export const OVERHEAD_KEYS = [
  'rent',
  'electricity',
  'mechanic',
  'internet',
  'tools',
  'cleaning',
  'misc',
] as const;

export type OverheadKey = (typeof OVERHEAD_KEYS)[number];

/**
 * Labels mirror the seeded `ExpenseCategory` names so the report and the
 * expenses module talk about the same cost buckets.
 */
export const OVERHEAD_LABELS: Record<OverheadKey, string> = {
  rent: 'Rent',
  electricity: 'EB / Electricity',
  mechanic: 'Mechanic cost (salaries)',
  internet: 'Internet & Phone',
  tools: 'Tools & Equipment',
  cleaning: 'Cleaning & Maintenance',
  misc: 'Miscellaneous',
};

/** `overheads.monthly.rent` for `rent`. */
export function settingKeyFor(key: OverheadKey): string {
  return `${OVERHEAD_SETTING_PREFIX}${key}`;
}

/** Every settings key this module owns — used by the settings registry. */
export const OVERHEAD_SETTING_KEYS = OVERHEAD_KEYS.map(settingKeyFor);

export type MonthlyOverheads = Record<OverheadKey, number>;

export const EMPTY_OVERHEADS: MonthlyOverheads = OVERHEAD_KEYS.reduce(
  (acc, k) => ({ ...acc, [k]: 0 }),
  {} as MonthlyOverheads,
);

/**
 * Pull monthly overheads out of a flat settings map, coercing anything
 * unparseable to 0 so a bad row can never blow up the report.
 */
export function overheadsFromSettings(settings: Record<string, unknown>): MonthlyOverheads {
  const out = { ...EMPTY_OVERHEADS };
  for (const key of OVERHEAD_KEYS) {
    const raw = settings[settingKeyFor(key)];
    const n = typeof raw === 'number' ? raw : Number(raw);
    out[key] = Number.isFinite(n) && n > 0 ? n : 0;
  }
  return out;
}

/**
 * Inclusive day count for an IST `YYYY-MM-DD` range. Both endpoints count, so a
 * single-day filter is 1 day, not 0.
 *
 * Parsed as UTC midnight on both ends. Because the two instants share the same
 * offset the subtraction is unaffected by timezone, and using UTC avoids the
 * host-local DST discontinuities that would otherwise make some ranges come out
 * half a day short.
 */
export function daysInRange(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.max(0, Math.round((b - a) / 86_400_000) + 1);
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export type OverheadLine = {
  key: OverheadKey;
  label: string;
  monthly: number;
  perDay: number;
  forPeriod: number;
};

export type ProratedOverheads = {
  days: number;
  divisor: number;
  lines: OverheadLine[];
  monthlyTotal: number;
  perDayTotal: number;
  forPeriodTotal: number;
};

/** Spread monthly overheads across `days`, one line per cost bucket plus totals. */
export function prorateOverheads(monthly: MonthlyOverheads, days: number): ProratedOverheads {
  const safeDays = Number.isFinite(days) && days > 0 ? days : 0;

  const lines: OverheadLine[] = OVERHEAD_KEYS.map((key) => {
    const amount = monthly[key] ?? 0;
    const perDay = amount / PRORATION_DIVISOR;
    return {
      key,
      label: OVERHEAD_LABELS[key],
      monthly: round2(amount),
      perDay: round2(perDay),
      forPeriod: round2(perDay * safeDays),
    };
  });

  const monthlyTotal = lines.reduce((s, l) => s + l.monthly, 0);
  const perDayTotal = monthlyTotal / PRORATION_DIVISOR;

  return {
    days: safeDays,
    divisor: PRORATION_DIVISOR,
    lines,
    monthlyTotal: round2(monthlyTotal),
    perDayTotal: round2(perDayTotal),
    // Derived from the unrounded total, not by summing rounded line values, so
    // the footer cannot drift a few paise away from the column above it.
    forPeriodTotal: round2(perDayTotal * safeDays),
  };
}
