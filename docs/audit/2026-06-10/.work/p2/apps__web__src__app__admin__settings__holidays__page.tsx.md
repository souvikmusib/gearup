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

Target file: `apps/web/src/app/admin/settings/holidays/page.tsx`

## Findings (1)

### [P2] UI compares ISO datetime strings against YYYY-MM-DD; all holidays land in 'Past' bucket
- id: `holidays-past-future-bug` · category: ux
- location: `apps/web/src/app/admin/settings/holidays/page.tsx:40-42`
- evidence:
```
const today = new Date().toISOString().split('T')[0];
const upcoming = data.filter((h) => h.holidayDate >= today);
const past = data.filter((h) => h.holidayDate < today);
```
- impact: holidayDate from API is a full ISO string like '2026-12-25T00:00:00.000Z' which lexically compares fine vs '2026-06-10' EXCEPT 'today' bucket: today's holiday whose ISO starts with the same date is >= today (correct), but holidays earlier today appear in 'Upcoming'. More importantly the filter assumes string >= works for all dates — it does because of the fixed ISO prefix, but the code is fragile and silently wrong if the API ever returns Date objects from JSON parsing (it cannot, but worth tightening). Tests on TZ boundaries (IST midnight rollover) misplace items by a day.
- proposed fix: Parse both sides as Date and compare numerically: new Date(h.holidayDate).setHours(0,0,0,0) >= new Date().setHours(0,0,0,0).