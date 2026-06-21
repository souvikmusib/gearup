# Timezone Plan — gearup

**Rule:** DB stores UTC. Everything user-facing displays **Asia/Kolkata (IST, UTC+05:30)**. Server-side "today" boundaries compute IST midnight, not UTC midnight.

---

## What's already correct (don't touch)

- Prisma `DateTime` columns → UTC. Keep.
- `app/api/admin/reports/route.ts`, `app/api/admin/reports/revenue/route.ts` — use `AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata'`.
- `app/api/admin/invoices/[id]/pdf/route.ts` — `formatDateIST()` for PDF dates.
- ~17 UI displays already pass `'en-IN'` (payments, holidays, AMC, invoices, dashboard, job-cards date column).

---

## Step 1 — Add `src/lib/time.ts`

One module, three helpers. Everything else uses these.

```ts
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

/** Format time-only in IST, e.g. `09:30 AM`. */
export function formatTimeIST(value: Date | string): string {
  return new Date(value).toLocaleTimeString('en-IN', {
    timeZone: SHOP_TZ, hour: '2-digit', minute: '2-digit', hour12: true,
  });
}
```

Unit-test it: zero-args near IST midnight, near UTC midnight, DST-free (IST has none), invalid input.

---

## Step 2 — Tier 1 fixes (real bugs, server-side IST boundaries)

Replace every server-side `setHours(0,0,0,0)` / `setUTCHours(0,0,0,0)` / `setHours(23,59,59,999)` with `istDayStart` / `istDayEnd`.

| File | Line | Change |
|---|---|---|
| `app/api/admin/appointments/route.ts` | 26, 32 | `x.setHours(0,0,0,0)` → `istDayStart(x)`; `x.setDate(...)` → offset off `istDayStart` |
| `app/api/admin/logs/route.ts` | 40 | `d.setHours(23,59,59,999)` → `istDayEnd(new Date(to))` |
| `app/api/admin/logs/export/route.ts` | 26 | same as above |
| `app/api/admin/workers/[id]/leave/route.ts` | 25, 69 | `endOfDay.setHours(23,59,59,999)` → `istDayEnd(endOfDay)` |
| `app/api/admin/settings/holidays/route.ts` | 80 | `today.setUTCHours(0,0,0,0)` → `istDayStart()` |
| `app/api/public/available-slots/route.ts` | 31 | rebase `now` against `istDayStart()` |

Add one integration test per route at IST midnight boundary (e.g. mock clock to `2026-06-12T19:00:00Z` = `2026-06-13T00:30 IST` → "today" must be June 13).

---

## Step 3 — Tier 2 sweep (UI fragility)

44 calls to `new Date(x).toLocaleDateString()` / `.toLocaleTimeString()` / `.toLocaleString()` without `timeZone: 'Asia/Kolkata'`.

**Mechanical rule:** replace every UI date/time render that takes a `Date | string` with `formatIST(x)` or `formatTimeIST(x)`. Do **not** touch money `.toLocaleString()` calls.

Files to sweep:

```
src/app/admin/customers/[id]/page.tsx
src/app/admin/customers/page.tsx
src/app/admin/appointments/page.tsx
src/app/admin/appointments/[id]/page.tsx
src/app/admin/appointments/calendar/page.tsx
src/app/admin/expenses/page.tsx
src/app/admin/invoices/page.tsx
src/app/admin/service-requests/page.tsx
src/app/admin/service-requests/[id]/page.tsx
src/app/admin/inventory/movements/page.tsx
src/app/admin/workers/[id]/page.tsx
src/app/admin/logs/page.tsx
```

Audit command:

```bash
grep -rEn "new Date\([^)]+\)\.toLocale(Date|Time|String)" --include='*.tsx' src/app \
  | grep -v "timeZone\|Asia/Kolkata"
```

Target: command returns zero lines.

---

## Step 4 — Tier 3 (seed)

`prisma/seed.ts:258`:

```ts
// BEFORE
const slotStart = new Date(date); slotStart.setHours(9 + i, 0, 0, 0);

// AFTER — IST-explicit, seed-machine TZ irrelevant
const ymd = istDayStart(date).toISOString().slice(0, 10);
const slotStart = new Date(`${ymd}T${String(9 + i).padStart(2, '0')}:00:00+05:30`);
```

`new Date('YYYY-MM-DD')` for holiday seed rows is safe (UTC midnight → June 15 IST = June 15). Leave alone.

---

## Step 5 — Lock it down

1. Add a lint rule (or a tiny CI grep) that fails the build if anyone re-introduces `new Date(...).toLocale*()` without `timeZone` inside `src/app/`:

```bash
# scripts/check-tz.sh
set -e
if grep -rEn "new Date\([^)]+\)\.toLocale(Date|Time|String)" --include='*.tsx' apps/web/src/app \
  | grep -v "timeZone\|Asia/Kolkata"; then
  echo "❌ Use formatIST/formatTimeIST from src/lib/time.ts"
  exit 1
fi
```

Wire into `pnpm test` and pre-push gate.

2. Add a unit test that fakes the system clock at IST midnight ± 5 minutes and asserts `istDayStart()` returns the correct IST calendar date.

---

## Done when

- `grep` audit command in Step 3 returns **zero**.
- All 6 Tier 1 routes use `istDayStart`/`istDayEnd`.
- New unit + integration tests pass.
- Pre-push gate green.
- One commit per tier (or one merged commit, but separable in diff).

---

## Out of scope (intentional)

- Switching DB columns to `timestamptz` — they already are (Postgres default). No migration.
- Changing browser to send timezone — unnecessary; server always assumes IST display.
- Dependency on date-fns / dayjs — not needed; native `Intl` does the job.
