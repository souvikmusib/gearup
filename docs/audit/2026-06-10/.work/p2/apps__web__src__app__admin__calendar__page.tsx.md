You are applying P2 quality fixes to gearup. Repo root: /Users/sagnikmitra/Desktop/GitHub/gearup.
Next.js 14 App Router, Prisma 5 + Postgres, JWT auth.
- PERMISSIONS enum: `packages/types/src/domain.ts` (import via `@gearup/types`)
- DB: `import { prisma } from '@/lib/prisma'`. For multi-step writes use `prisma.$transaction`.
- Errors: `handleApiError(err)` in `@/lib/errors`. `AppError(statusCode: number, message: string, code: string)` — note arg order: STATUS first.
- Activity log: `logActivity({ adminUserId, action, entityType, entityId, metadata, tx })` from `@/lib/activity-logger` (supports optional tx).
- Gold stock pattern: `apps/web/src/app/api/admin/inventory/items/[id]/stock/route.ts`.

Rules:
1. Read the file first.
2. Apply EVERY finding. P2 = quality (consistency, perf, ux, type-safety, dead-code) — no skipping.
3. Preserve unrelated code; no reformatting.
4. Imports: add what you need; don't remove used ones.
5. No backward-compat shims.

Return JSON: {"file":"...","applied":[...ids],"skipped":[{"id":"","reason":""}],"notes":"..."}.

Target file: `apps/web/src/app/admin/calendar/page.tsx`

## Findings (2)

### [P2] Calendar overview, full calendar, appointments-cal, workers-cal duplicate the same data fetch
- id: `calendar-tabs-vs-fullcalendar-no-sync` · category: tech-debt
- location: `apps/web/src/app/admin/calendar/page.tsx:43-64, full/page.tsx:27-62, appointments/calendar/page.tsx:21-30, workers/calendar/page.tsx:18-29`
- evidence:
```
// calendar/page.tsx
api.getSWR<any>('/admin/appointments?pageSize=500');
api.getSWR<any>('/admin/workers/calendar');
// full/page.tsx
api.get<any>('/admin/appointments?pageSize=500'),
api.get<any>('/admin/workers/calendar');
// appointments/calendar/page.tsx
api.getSWR<any>('/admin/appointments?pageSize=200');
```
- impact: Four near-identical calendar surfaces, each with their own slightly different fetch (200 vs 500 page size, getSWR vs get, slightly different grouping). Maintenance burden, inconsistent truncation, and contradicting UIs (`/appointments/calendar` only shows 200, `/calendar` shows 500). Users may see different counts depending on entry point.
- proposed fix: Consolidate into one `useCalendarData(range)` hook backed by a single `/admin/calendar?from=&to=` API that returns `{appointments, holidays, leaves, assignments}`. Delete the duplicate pages or make them thin views over the same hook.

### [P2] Calendar uses native `Date` + `toISOString().slice(0,10)` — wrong day in non-UTC zones
- id: `fullcalendar-no-tz-bug` · category: business-logic
- location: `apps/web/src/app/admin/calendar/page.tsx:19-21, apps/web/src/app/admin/appointments/calendar/page.tsx:33-38`
- evidence:
```
function dayKey(value: string) {
  return new Date(value).toISOString().slice(0, 10);
}
// appointments/calendar
const key = new Date(item.appointmentDate).toISOString().slice(0, 10);
```
- impact: An appointment booked at `2026-06-10T22:00:00+05:30` (IST) is `2026-06-10T16:30:00Z`. `toISOString().slice(0,10)` returns `2026-06-10` — correct here, but a 23:30 IST booking becomes `2026-06-10T18:00:00Z` → still 06-10. However, a 06:00 IST booking on 06-10 = `2026-06-10T00:30:00Z` → 06-10 (also fine), but a 04:00 IST booking = `2026-06-09T22:30:00Z` → groups under 06-09, off by one day. For a shop in IST this misfiles early-morning appointments.
- proposed fix: Use a TZ-aware day key based on the shop's locale, e.g. `new Date(value).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })` (yields YYYY-MM-DD), or normalize on the server.