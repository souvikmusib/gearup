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

Target file: `apps/web/src/app/api/admin/settings/holidays/route.ts`

## Findings (2)

### [P2] Holiday POST trusts holidayDate string and creates new Date() without validating it parsed
- id: `holidays-no-date-validation` · category: validation
- location: `apps/web/src/app/api/admin/settings/holidays/route.ts:20-24`
- evidence:
```
const body = z.object({
  holidayName: z.string().min(1), holidayDate: z.string(), holidayType: z.enum([...]),
  isFullDay: z.boolean().default(true), startTime: z.string().optional(), endTime: z.string().optional(), notes: z.string().optional(),
}).parse(await req.json());
const holiday = await prisma.holiday.create({ data: { ...body, holidayDate: new Date(body.holidayDate) } });
```
- impact: holidayDate='banana' → new Date('banana') is Invalid Date → Prisma either errors with cryptic 'Invalid value' or (if value coerces) writes a wrong date. No bound on startTime/endTime format (HH:MM not enforced) so 'monday' will be persisted in a string column the UI later renders as 'monday – monday'. No check that endTime > startTime, no enforcement of !isFullDay → require startTime+endTime.
- proposed fix: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) (or z.coerce.date()) for holidayDate. z.string().regex(/^\d{2}:\d{2}$/) for start/end. Refine: if !isFullDay then start/end required AND end > start. Also de-duplicate: unique on (holidayDate, holidayType).

### [P2] Holiday DELETE has no impact check (existing appointments on that date are silently un-blocked)
- id: `holidays-no-fk-impact-warning` · category: business-logic
- location: `apps/web/src/app/api/admin/settings/holidays/route.ts:30-37`
- evidence:
```
const user = requirePermission(PERMISSIONS.SETTINGS_MANAGE);
const id = req.nextUrl.searchParams.get('id');
if (!id) return NextResponse.json({ success: false, error: { message: 'id required' } }, { status: 400 });
await prisma.holiday.delete({ where: { id } });
```
- impact: Deleting a holiday after appointments were already auto-rescheduled around it leaves the system in an inconsistent visible state — the calendar shows the slot as free but appointments may have been moved. No FK from Holiday to anything, so deletion succeeds silently.
- proposed fix: Soft-delete (isActive flag) so historical decisions stay traceable; or refuse delete when the holiday is in the past; or at minimum surface a warning in UI.