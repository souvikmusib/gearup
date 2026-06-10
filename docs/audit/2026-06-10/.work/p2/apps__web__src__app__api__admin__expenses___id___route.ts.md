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

Target file: `apps/web/src/app/api/admin/expenses/[id]/route.ts`

## Findings (1)

### [P2] PATCH does not allow editing referenceNumber that POST accepts
- id: `expense-patch-missing-referencenumber` · category: consistency
- location: `apps/web/src/app/api/admin/expenses/[id]/route.ts:20`
- evidence:
```
z.object({ expenseDate?, categoryId?, title?, amount?, vendorName?, paymentMode?, notes? })  // no referenceNumber
```
- impact: Wrong reference number cannot be corrected via API/UI.
- proposed fix: Add referenceNumber: z.string().nullable().optional() to PATCH schema.