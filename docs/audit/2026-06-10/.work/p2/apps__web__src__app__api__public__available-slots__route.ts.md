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

Target file: `apps/web/src/app/api/public/available-slots/route.ts`

## Findings (2)

### [P2] available-slots accepts arbitrary 'date' string, no zod, NaN passes through
- id: `available-slots-no-input-validation` · category: validation
- location: `apps/web/src/app/api/public/available-slots/route.ts:7-15`
- evidence:
```
const date = req.nextUrl.searchParams.get('date');
if (!date) throw new ValidationError('date query parameter required');
const [year, month, day] = date.split('-').map(Number);
const targetDate = new Date(Date.UTC(year, month - 1, day));
```
- impact: date='abc' yields NaN-NaN-NaN → Date is Invalid; new Date(Date.UTC(NaN,...)) returns Invalid Date; dayOfWeek = NaN; prisma query runs with NaN and likely throws. Also accepts past dates and dates 1000 years out — no bounds. Easy DoS vector if any of these branches do expensive work.
- proposed fix: const { date } = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).parse({ date }); bound to today..+90 days.

### [P2] isBlocked comparison conflates date and time-of-day; blockStartTime is a full DateTime
- id: `available-slots-blocked-time-bug` · category: business-logic
- location: `apps/web/src/app/api/public/available-slots/route.ts:19, 32`
- evidence:
```
const blocked = await prisma.blockedSlot.findMany({ where: { blockDate: targetDate, appliesToAll: true } });
...
const isBlocked = blocked.some((b: any) => start >= new Date(b.blockStartTime) && end <= new Date(b.blockEndTime));
```
- impact: blockStartTime/blockEndTime are DateTime columns. If the admin saves them with a different date component than blockDate (timezone bugs are likely — see UTC handling above), no slot ever overlaps, and 'blocked' becomes a no-op. Also blocked rows where appliesToAll=false (worker/bay specific) are ignored entirely — fine for a public preview but worth documenting.
- proposed fix: Compare only the time-of-day component, or normalize both sides to the same Y-M-D before comparison. Add a unit test covering DST/IST.