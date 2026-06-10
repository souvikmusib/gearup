You are a senior Next.js / Prisma / TypeScript engineer applying audit fixes to the gearup codebase. GO-LIVE TOMORROW. Fixes must be surgical, correct, no regressions.

Repo root: /Users/sagnikmitra/Desktop/GitHub/gearup

## Context
- Next.js 14 App Router, Prisma 5 + Postgres, JWT auth.
- All admin routes use `requirePermission(req, PERMISSIONS.X)` from `apps/web/src/lib/auth.ts`. Permissions enum at `packages/types/src/auth.ts`.
- DB: `import { prisma } from '@/lib/prisma'`. Multi-table writes MUST use `prisma.$transaction(async (tx) => ...)`.
- Errors: `handleApiError(err)` in `apps/web/src/lib/errors.ts`. Throw `new AppError(code, msg, status)`.
- Activity log: `logActivity({adminUserId, action, entityType, entityId, metadata})` from `apps/web/src/lib/activity-logger.ts`.
- Gold pattern for race-free stock: `apps/web/src/app/api/admin/inventory/items/[id]/stock/route.ts` uses tx + `updateMany` with `gte` guard.

## Rules
1. **Read the file first** before editing.
2. **Apply EVERY finding** listed below. None are optional.
3. **Preserve unrelated code.** Don't reformat or refactor outside scope.
4. **Race-fixes**: use `prisma.$transaction` + conditional `updateMany({where:{...guard},data:...})` then assert `result.count === 1`, else throw `new AppError('CONFLICT', '...', 409)`.
5. **Permission fixes**: if a new PERMISSIONS.X is needed, the shared-infra agent has added/will add it to `packages/types/src/auth.ts`. Just import + use.
6. **Mass-assignment**: replace `data: body as any` with explicit field picks.
7. **No backward-compat shims** — fix it right.
8. **Imports**: add what you need; don't remove ones still used.
9. **Schema changes**: if a Zod schema changes, ensure all callers match.
10. **Don't run build** — coordinator does that.

## Verify after edit
Re-Read the file. Confirm syntax. Mention any cascading changes needed.

Return JSON only: {"file": "...", "applied": ["id1","id2"], "skipped": [{"id":"","reason":""}], "cascading_changes": ["path: note"], "notes": "2-5 sentences"}.

Target file: `apps/web/src/app/api/admin/appointments/route.ts`

## Findings to fix in this file (2)

### 1. [P0 · BLOCKER] POST /appointments has no overlap/capacity check against existing appointments, leaves, or AppointmentSlotRule
- _id_: `appointment-no-double-booking-guard` · _category_: business-logic
- _location_: `apps/web/src/app/api/admin/appointments/route.ts:39-49`
- _evidence_:
```
const appt = await prisma.appointment.create({
  data: { referenceId: generateAppointmentRef(), ...body, appointmentDate: new Date(body.appointmentDate), slotStart: new Date(body.slotStart), slotEnd: new Date(body.slotEnd), status: 'CONFIRMED', confirmedByAdminId: user.sub } as any,
});
```
- _impact_: Two admins can book the same worker into the same slot, or a customer-facing booking can land on an approved worker leave. UI from appointments/page.tsx hardcodes slotEnd = slotStart + 30min with no per-day capacity check — appointment double-bookings will hit go-live.
- _proposed fix_: Before insert, query: (a) overlapping appointment for the same worker/bay where status NOT IN (CANCELLED, NO_SHOW); (b) overlapping WorkerLeave for assignedWorkerId with status APPROVED; (c) AppointmentSlotRule capacity for that weekday. Wrap insert + check in a serializable transaction (or unique index on (assignedWorkerId, slotStart) excluding cancelled).
- _verifier said_: real=True, Verified in apps/web/src/app/api/admin/appointments/route.ts:39-49: POST does only a Zod parse then prisma.appointment.create with no overlap, leave, or capacity check. Schema (prisma/schema.prisma:308-339) has no unique constraint on (assignedWorkerId, slotStart) or any partial index excluding cancelled — only @unique on referenceId and serviceRequestId. AppointmentSlotRule.maxCapacity and WorkerLeave exist in the schema but are never consulted. Two concurrent confirmations can therefore double-book the same worker/slot or land on an approved leave; this is a go-live blocker for a booking-driven workshop app.

### 2. [P1] GET /appointments date filter uses equality on appointmentDate (DateTime) — never matches
- _id_: `appointment-list-date-filter-equality` · _category_: business-logic
- _location_: `apps/web/src/app/api/admin/appointments/route.ts:29`
- _evidence_:
```
if (date) where.appointmentDate = new Date(date);
```
- _impact_: appointmentDate is a DateTime stored with the time component, but the filter binds the YYYY-MM-DD midnight; queries with ?date=2026-06-10 only match appointments whose appointmentDate is exactly midnight UTC. Day-view UI will look empty.
- _proposed fix_: Convert to range: const d = new Date(date); where.appointmentDate = { gte: startOfDay(d), lt: addDays(startOfDay(d),1) }. Use a small date helper to avoid TZ drift.