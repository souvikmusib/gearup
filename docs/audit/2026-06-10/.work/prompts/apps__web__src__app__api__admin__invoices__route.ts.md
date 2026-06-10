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

Target file: `apps/web/src/app/api/admin/invoices/route.ts`

## Findings to fix in this file (1)

### 1. [P1] Discount math differs between invoice-create and add-line endpoints
- _id_: `discount-calc-inconsistent` · _category_: business-logic
- _location_: `apps/web/src/app/api/admin/invoices/route.ts:71-79 vs apps/web/src/app/api/admin/invoices/[id]/line-items/route.ts:65-68`
- _evidence_:
```
// invoices POST: percent discount off preSubtotal of NON-DISCOUNT items
const preSubtotal = nonDiscountItems.reduce((sum, li) => sum + li.quantity * li.unitPrice, 0);
lineTotal = mode === 'percent' ? -(preSubtotal * (li.unitPrice / 100)) : ...;

// line-items POST: percent discount off the stored inv.subtotal (which already includes prior discount lines, net of tax)
lineTotal = body.discountMode === 'percent'
  ? -(Number(inv.subtotal) * (body.unitPrice / 100))
  : -(Math.abs(body.quantity * body.unitPrice));
```
- _impact_: Same invoice computed two ways yields different totals. A 10% discount added at creation time uses the pre-discount subtotal as the base; the same 10% discount added via the line-items endpoint uses the current subtotal which already net-of any earlier discount line. Stacking multiple percent discounts on the same invoice gives compounding behavior in one path and additive in the other. Customer-visible amount mismatch.
- _proposed fix_: Extract a shared `computeLineTotals(lineItems, invoiceMeta)` helper in lib/ and call it from both routes. Define one canonical rule for the percent-discount base.