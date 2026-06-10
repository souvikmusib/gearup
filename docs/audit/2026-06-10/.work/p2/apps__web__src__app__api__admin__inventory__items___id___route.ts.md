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

Target file: `apps/web/src/app/api/admin/inventory/items/[id]/route.ts`

## Findings (1)

### [P2] DELETE item ignores reservedQuantity — can wipe an item that has reserved stock pending a job card
- id: `delete-ignores-reserved-quantity` · category: business-logic
- location: `apps/web/src/app/api/admin/inventory/items/[id]/route.ts:33-44`
- evidence:
```
const usedInJobCards = await prisma.jobCardPart.count({ where: { inventoryItemId: params.id } });
if (usedInJobCards > 0) { return ... 409 }
await prisma.stockMovement.deleteMany({ where: { inventoryItemId: params.id } });
await prisma.inventoryItem.delete({ where: { id: params.id } });
```
- impact: If a JobCardPart record was added then deleted (consumed parts removed mid-flow), the count check passes but reservedQuantity may still be > 0 from an in-progress workflow elsewhere — deleting the row leaves dangling state.
- proposed fix: Add a guard: if (item.reservedQuantity > 0) return 409. Prefer soft-delete (isActive=false) for any item that has ever had movements.