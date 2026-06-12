const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/**
 * Returns IST "today" boundaries as UTC Date objects.
 * Used for querying records that fall within the current IST day.
 */
export function getISTDayBoundaries(now: Date = new Date()): { todayStart: Date; tomorrowStart: Date } {
  const istNow = new Date(now.getTime() + IST_OFFSET_MS);
  const todayStart = new Date(istNow.toISOString().slice(0, 10) + 'T00:00:00+05:30');
  const tomorrowStart = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
  return { todayStart, tomorrowStart };
}

/**
 * Converts a date string (YYYY-MM-DD) to IST-aware start/end boundaries.
 */
export function getISTRangeBoundaries(from: string, to: string): { start: Date; end: Date } {
  return {
    start: new Date(from + 'T00:00:00+05:30'),
    end: new Date(to + 'T23:59:59+05:30'),
  };
}
