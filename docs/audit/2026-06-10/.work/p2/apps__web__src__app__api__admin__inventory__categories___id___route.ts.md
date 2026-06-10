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

Target file: `apps/web/src/app/api/admin/inventory/categories/[id]/route.ts`

## Findings (1)

### [P2] DELETE category and DELETE supplier have no in-use guard — rely on Prisma P2003 mapping
- id: `category-supplier-delete-no-fk-guard` · category: ux
- location: `apps/web/src/app/api/admin/inventory/categories/[id]/route.ts:19-25 and suppliers/[id]/route.ts:23-29`
- evidence:
```
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = requirePermission(PERMISSIONS.INVENTORY_EDIT);
    await prisma.inventoryCategory.delete({ where: { id: params.id } });
    logActivity(...);
```
- impact: Deleting a category referenced by items throws P2003 → 400 'Invalid reference: referenced record does not exist' — confusing message (the deleted record IS the referenced one). Item DELETE has a clean guarded count (line 36); categories/suppliers do not. Suppliers FK is nullable so it actually still blocks (no onDelete: SetNull defined).
- proposed fix: Mirror the items DELETE pattern: prisma.inventoryItem.count({ where: { categoryId: params.id } }) > 0 ⇒ 409 with `Cannot delete — category in use by N item(s)`. Same for suppliers. Optionally add onDelete: SetNull to Supplier relation in schema so suppliers detach cleanly.