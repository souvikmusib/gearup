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

Target file: `apps/web/src/app/api/admin/inventory/items/[id]/stock/route.ts`

## Findings (1)

### [P2] Stock adjustment uses updateMany then findUniqueOrThrow inside tx — extra round-trip and weak post-condition
- id: `stock-route-find-after-update-redundant-roundtrip` · category: performance
- location: `apps/web/src/app/api/admin/inventory/items/[id]/stock/route.ts:22-41`
- evidence:
```
const updated = await tx.inventoryItem.updateMany({ where: { id: params.id, ...(isIncrease ? {} : { quantityInStock: { gte: body.quantity } }) }, data: { quantityInStock: { increment: delta } } });
if (updated.count === 0) throw new ValidationError('Insufficient stock for this adjustment.');
const item = await tx.inventoryItem.findUniqueOrThrow({ where: { id: params.id } });
```
- impact: Two queries instead of one. More importantly: updateMany returns no rows so we re-read separately — if another concurrent stock op races between update and read, newQuantity recorded in the StockMovement row may not match the delta actually applied here (prev = newQty - delta could be off by another transaction's delta).
- proposed fix: Use prisma.inventoryItem.update (single row update returns the row) wrapped in a try for P2025; for the insufficient-stock guard, do a SELECT FOR UPDATE via $queryRaw or check item.quantityInStock first inside the tx and update with a precise WHERE. Better: use Postgres advisory lock per item id, or do `update ... returning quantityInStock` via $queryRaw and compute prev = new - delta in same statement.