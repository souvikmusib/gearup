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

Target file: `apps/web/src/app/api/admin/inventory/items/route.ts`

## Findings (3)

### [P2] Item POST trusts caller-supplied quantityInStock with no transactional ledger entry (mass-assignment-adjacent)
- id: `item-create-no-stockmovement-tx` · category: validation
- location: `apps/web/src/app/api/admin/inventory/items/route.ts:33-41`
- evidence:
```
sku: z.string().min(1), ... quantityInStock: z.number().optional(), reorderLevel: z.number().optional(), ...
const item = await prisma.inventoryItem.create({ data: body as any });
```
- impact: quantityInStock and reservedQuantity-adjacent fields can be seeded arbitrarily and bypass the stock-movement pathway. Numbers also lack `.nonnegative()` — caller can create an item with -1000 stock.
- proposed fix: Add .nonnegative() to costPrice, sellingPrice, quantityInStock, reorderLevel, reorderQuantity. Forbid quantityInStock in the schema and require it to be added via the dedicated stock route (or auto-emit an OPENING_BALANCE movement).

### [P2] `data: body as any` defeats Prisma input typing on item create and update
- id: `as-any-prisma-cast` · category: type-safety
- location: `apps/web/src/app/api/admin/inventory/items/route.ts:40 and apps/web/src/app/api/admin/inventory/items/[id]/route.ts:27`
- evidence:
```
const item = await prisma.inventoryItem.create({ data: body as any });
...
const item = await prisma.inventoryItem.update({ where: { id: params.id }, data: body as any });
```
- impact: Refactors to schema (e.g. renaming a field, adding a required field) will not produce a type error. Zod schema and Prisma input can drift silently.
- proposed fix: Type the zod schema as `z.object({...}) satisfies z.ZodType<Prisma.InventoryItemCreateInput>` or remove `as any` and let TS confirm field-by-field compatibility. Pass through an explicit mapping object.

### [P2] pageSize query param is unbounded on items and movements lists
- id: `unbounded-page-size` · category: performance
- location: `apps/web/src/app/api/admin/inventory/items/route.ts:14-15 and apps/web/src/app/api/admin/inventory/movements/route.ts:12-13`
- evidence:
```
const page = Number(sp.get('page')) || 1;
const pageSize = Number(sp.get('pageSize')) || 20;
```
- impact: Authenticated user can request ?pageSize=1000000 and pull the entire StockMovement table into memory, plus a count(*). Even at admin-only access this is a footgun for accidental dashboards.
- proposed fix: Clamp via z.coerce.number().int().min(1).max(100) in paginate(), or Math.min(pageSize, 100) at the route level. lib/pagination should enforce the cap centrally.