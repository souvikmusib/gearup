/**
 * Date-range presets for report filters, resolved in IST.
 *
 * The report APIs parse `from`/`to` as IST calendar dates (`from + 'T00:00:00+05:30'`),
 * so the presets must be built from the IST calendar day — not from
 * `new Date().toISOString()`, which is UTC. Between 00:00 and 05:30 IST the UTC
 * date is still yesterday, so a UTC-derived "Today" silently returns the wrong
 * day, and a UTC-derived "This month" returns the previous month for the first
 * 5.5 hours of the 1st.
 */

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** The instant `now` shifted into IST, so UTC getters read as IST calendar parts. */
function istParts(now: Date = new Date()): Date {
  return new Date(now.getTime() + IST_OFFSET_MS);
}

/** `YYYY-MM-DD` for the IST calendar day containing `now`. */
export function istToday(now: Date = new Date()): string {
  return istParts(now).toISOString().slice(0, 10);
}

/** `YYYY-MM-DD` for the IST calendar day `daysAgo` days before `now`. */
export function istDaysAgo(daysAgo: number, now: Date = new Date()): string {
  const d = istParts(now);
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

/** First day of the IST calendar month containing `now`, as `YYYY-MM-DD`. */
export function istMonthStart(now: Date = new Date()): string {
  return `${istParts(now).toISOString().slice(0, 7)}-01`;
}

export type DateRange = { from: string; to: string };
export type RangePreset = { id: string; label: string; resolve: (now?: Date) => DateRange };

/**
 * A calendar-month option sits alongside the rolling windows because they answer
 * different questions: "last 30 days" is a trend, "this month" is the figure you
 * compare month over month. The rolling ones are labelled by what they actually
 * do, since calling a rolling 30-day window "This Month" misreports every
 * total once you are past the 1st.
 */
export const RANGE_PRESETS: RangePreset[] = [
  { id: 'today', label: 'Today', resolve: (n) => ({ from: istToday(n), to: istToday(n) }) },
  { id: 'last7', label: 'Last 7 days', resolve: (n) => ({ from: istDaysAgo(6, n), to: istToday(n) }) },
  { id: 'last30', label: 'Last 30 days', resolve: (n) => ({ from: istDaysAgo(29, n), to: istToday(n) }) },
  { id: 'last90', label: 'Last 90 days', resolve: (n) => ({ from: istDaysAgo(89, n), to: istToday(n) }) },
  { id: 'thisMonth', label: 'This month', resolve: (n) => ({ from: istMonthStart(n), to: istToday(n) }) },
  { id: 'custom', label: 'Custom', resolve: (n) => ({ from: istDaysAgo(29, n), to: istToday(n) }) },
];

export const DEFAULT_PRESET_ID = 'last30';
