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

Target file: `apps/web/src/app/api/admin/inventory/low-stock/route.ts`

## Findings (1)

### [P2] Low-stock filters in JS instead of SQL — fetches every active reorder-tracked item
- id: `low-stock-in-memory-filter` · category: performance
- location: `apps/web/src/app/api/admin/inventory/low-stock/route.ts:10-16`
- evidence:
```
const items = await prisma.inventoryItem.findMany({ where: { isActive: true, reorderLevel: { not: null } }, include: { ... } });
const lowStock = items.filter((item) => Number(item.quantityInStock) <= Number(item.reorderLevel));
```
- impact: Linear scan + JS filter doesn't scale; as catalog grows the entire active product table is shipped over the wire to filter to (usually) a handful of rows.
- proposed fix: Postgres can compare columns directly. Use $queryRaw: `SELECT ... FROM \"InventoryItem\" WHERE is_active AND reorder_level IS NOT NULL AND quantity_in_stock <= reorder_level`. Add a partial index: `CREATE INDEX ... ON "InventoryItem" (id) WHERE is_active AND quantity_in_stock <= reorder_level`. Prisma can't express column-to-column in `where` natively, so $queryRaw is the path.