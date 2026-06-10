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

Target file: `apps/web/src/app/api/admin/invoices/[id]/payments/route.ts`

## Findings (1)

### [P2] AMC plan activation on full payment uses a for-loop with sequential awaits inside the txn
- id: `amc-on-paid-n+1` · category: performance
- location: `apps/web/src/app/api/admin/invoices/[id]/payments/route.ts:68-86`
- evidence:
```
const amcLines = await tx.invoiceLineItem.findMany({ where: { invoiceId: params.id, lineType: 'AMC', referenceItemId: { not: null } } });
for (const line of amcLines) {
  const plan = await tx.amcPlan.findUnique({ where: { id: line.referenceItemId! } });
  ...
  const count = await tx.amcContract.count();
  const contract = await tx.amcContract.create({ ... });
  await tx.amcServiceUsage.create({ ... });
}
```
- impact: For an invoice with N AMC line items, this is 4N round-trips inside the transaction — extends lock duration on Invoice/AmcContract rows and increases deadlock risk under concurrent payments. Plus the count() race noted separately.
- proposed fix: Batch: `await tx.amcPlan.findMany({ where: { id: { in: ids } } })`, then `tx.amcContract.createMany(...)`. Fix contractNumber generator to avoid count().