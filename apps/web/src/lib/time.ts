export const SHOP_TZ = 'Asia/Kolkata';
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** UTC instant of IST 00:00:00.000 for the IST calendar day of `at` (default now). */
export function istDayStart(at: Date = new Date()): Date {
  const istNow = new Date(at.getTime() + IST_OFFSET_MS);
  const ymd = istNow.toISOString().slice(0, 10);
  return new Date(`${ymd}T00:00:00+05:30`);
}

/** UTC instant of IST 23:59:59.999 for the IST calendar day of `at`. */
export function istDayEnd(at: Date = new Date()): Date {
  return new Date(istDayStart(at).getTime() + 24 * 60 * 60 * 1000 - 1);
}

/** Format a Date/ISO string in IST. Defaults to `dd MMM yyyy`. */
export function formatIST(
  value: Date | string,
  opts: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short', year: 'numeric' },
): string {
  return new Date(value).toLocaleString('en-IN', { timeZone: SHOP_TZ, ...opts });
}

/** Format time-only in IST, e.g. `09:30 am`. */
export function formatTimeIST(value: Date | string): string {
  return new Date(value).toLocaleTimeString('en-IN', {
    timeZone: SHOP_TZ, hour: '2-digit', minute: '2-digit', hour12: true,
  });
}
