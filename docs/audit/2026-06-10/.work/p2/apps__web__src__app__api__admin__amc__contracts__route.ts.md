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

Target file: `apps/web/src/app/api/admin/amc/contracts/route.ts`

## Findings (2)

### [P2] startDate / paymentDate use z.string() with no date validation
- id: `amc-contract-startdate-validation` · category: validation
- location: `apps/web/src/app/api/admin/amc/contracts/route.ts:13-17,50-52`
- evidence:
```
startDate: z.string(),
...
const startDate = new Date(body.startDate);
const endDate = new Date(startDate);
endDate.setMonth(endDate.getMonth() + plan.durationMonths);
```
- impact: Empty string or 'foo' → Invalid Date → endDate becomes Invalid Date → stored as null/error; setMonth on Invalid Date is silently NaN.
- proposed fix: Use `z.string().datetime()` or `z.coerce.date()` and validate Number.isFinite on resulting Date.

### [P2] endDate computation has month-overflow bug for end-of-month start dates
- id: `amc-end-date-month-overflow` · category: business-logic
- location: `apps/web/src/app/api/admin/amc/contracts/route.ts:50-52`
- evidence:
```
const startDate = new Date(body.startDate);
const endDate = new Date(startDate);
endDate.setMonth(endDate.getMonth() + plan.durationMonths);
```
- impact: startDate=2026-01-31, +1 month → JS rolls over to 2026-03-03 (Feb has no 31). Customer expecting Feb-28 end is given an extra ~3 days; multi-year plans shift further. Customer-facing inconsistency.
- proposed fix: Use date-fns `addMonths` (clamps to month end) or explicit clamping logic.