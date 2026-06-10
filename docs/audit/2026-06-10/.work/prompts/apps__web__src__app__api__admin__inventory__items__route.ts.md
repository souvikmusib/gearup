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

Target file: `apps/web/src/app/api/admin/inventory/items/route.ts`

## Findings to fix in this file (1)

### 1. [P1] Item create writes initial quantityInStock but logs no StockMovement
- _id_: `item-create-no-stock-movement` · _category_: data-integrity
- _location_: `apps/web/src/app/api/admin/inventory/items/route.ts:30-43`
- _evidence_:
```
const body = z.object({ ... quantityInStock: z.number().optional(), ... }).parse(await req.json());
const item = await prisma.inventoryItem.create({ data: body as any });
logActivity({ entityType: 'InventoryItem', entityId: item.id, action: 'inventory.item.created', ... });
```
- _impact_: Opening stock is invisible in the StockMovement ledger. Sum of movements will never reconcile with quantityInStock, breaking any audit/closing-stock report from day one. Cannot answer 'how did stock reach 50?' for items created with non-zero opening.
- _proposed fix_: Wrap create + (if quantityInStock>0) StockMovement insert in prisma.$transaction. Use movementType 'STOCK_IN' or a new 'OPENING_BALANCE' enum value with previousQuantity=0, newQuantity=opening.