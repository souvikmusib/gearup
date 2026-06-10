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

Target file: `apps/web/src/app/api/admin/invoices/[id]/line-items/route.ts`

## Findings to fix in this file (3)

### 1. [P0 · BLOCKER] Line-item POST/PATCH/DELETE perform multi-table writes with no $transaction
- _id_: `line-items-no-transaction` · _category_: data-integrity
- _location_: `apps/web/src/app/api/admin/invoices/[id]/line-items/route.ts:25-114`
- _evidence_:
```
// POST: separate awaits, no tx
await Promise.all([
  prisma.inventoryItem.update({ ... decrement }),
  prisma.stockMovement.create({ ... }),
]);
...
const item = await prisma.invoiceLineItem.create({ ... });
...
await Promise.all([recalcTotals(...), syncJobCard()]);
```
- _impact_: If any step after the inventory decrement fails (line-item create errors, syncJobCard FK fails, recalcTotals fails), stock has already been deducted with no compensating action. Same in DELETE: stock is restored before the line-item is actually deleted. For AMC: servicesRemaining is decremented before the line item is created — failure leaves an AMC service permanently consumed with no invoice line.
- _proposed fix_: Wrap the entire POST/PATCH/DELETE handler bodies (lookups + all writes) in `prisma.$transaction(async (tx) => {...})` and pass tx through helpers. Recompute totals inside the same transaction.
- _verifier said_: real=True, Confirmed in apps/web/src/app/api/admin/invoices/[id]/line-items/route.ts. POST decrements inventoryItem.quantityInStock and creates stockMovement (lines 85-88), or decrements amcContract.servicesRemaining and creates amcServiceUsage (lines 53-56), BEFORE creating the invoiceLineItem (line 94) and running recalcTotals + syncJobCard (line 110) — all as separate awaits with no prisma.$transaction wrapper. DELETE restores stock (lines 151-153) before deleting the line item (line 156), so a delete failure leaves stock double-credited. PATCH writes the line item then recalcTotals separately. Any intermediate failure leaves inventory, AMC service counts, stock ledger, and invoice totals out of sync with no compensation — a real data-integrity blocker for go-live.

### 2. [P0 · BLOCKER] AMC service usage decremented when adding line item to a DRAFT invoice
- _id_: `amc-services-decremented-on-draft` · _category_: business-logic
- _location_: `apps/web/src/app/api/admin/invoices/[id]/line-items/route.ts:47-56`
- _evidence_:
```
if (body.amcContractId) {
  const contract = await prisma.amcContract.findUniqueOrThrow(...);
  if (contract.servicesRemaining <= 0) throw new ValidationError(...);
  await Promise.all([
    prisma.amcServiceUsage.create({ data: { ... serviceNumber: contract.servicesUsed + 1 } }),
    prisma.amcContract.update({ where: { id: contract.id }, data: { servicesUsed: { increment: 1 }, servicesRemaining: { decrement: 1 } } }),
  ]);
}
```
- _impact_: Adding an AMC line item to a DRAFT invoice permanently consumes one of the customer's prepaid AMC services. If the invoice is then deleted, the line item removed, or the invoice never finalized, the service is still gone — no rollback in the DELETE handler either. Also two concurrent adds can both pass the `servicesRemaining > 0` check and double-decrement (no row lock or conditional updateMany).
- _proposed fix_: Defer servicesRemaining decrement + AmcServiceUsage creation to the finalize or full-payment step (the payments route already creates AmcServiceUsage on full payment for plan purchases — mirror this for contract usage). Use a conditional `updateMany` with `where: { id, servicesRemaining: { gt: 0 } }` and check `count`. Add the inverse restore to DELETE line-items.
- _verifier said_: real=True, Confirmed at apps/web/src/app/api/admin/invoices/[id]/line-items/route.ts:47-56. POST on a DRAFT invoice immediately creates AmcServiceUsage and decrements servicesRemaining via two unconditional Prisma calls in a Promise.all (not even in a transaction). The DELETE handler at lines 140-161 only restores PART inventory — there is no AMC rollback path, so removing the line item or never finalizing the invoice permanently consumes a prepaid service. The concurrency race is also real: the servicesRemaining > 0 check is a plain read with no row lock and no conditional updateMany guard, so two concurrent adds can both pass and double-decrement. P0 is appropriate for a customer-billing flow.

### 3. [P0 · BLOCKER] PART stock deduction matches inventory by free-text itemName
- _id_: `part-stock-matched-by-name` · _category_: data-integrity
- _location_: `apps/web/src/app/api/admin/invoices/[id]/line-items/route.ts:77-91`
- _evidence_:
```
if (body.lineType === 'PART') {
  const invItem = await prisma.inventoryItem.findFirst({ where: { itemName: body.description } });
  if (invItem) {
    ...
    await Promise.all([
      prisma.inventoryItem.update({ where: { id: invItem.id }, data: { quantityInStock: { decrement: body.quantity } } }),
```
- _impact_: If two inventory items share an itemName, the WRONG item is decremented (findFirst is non-deterministic order). If the user types/edits the description, stock is NOT decremented (silent miss). If the description has trailing whitespace or a different SKU, same problem. Customers will be charged for parts that never leave stock — inventory audit will drift permanently. Also no check that quantityInStock >= body.quantity, so stock can go negative.
- _proposed fix_: Pass `inventoryItemId` explicitly in the request body (the UI has the dropdown), look up by id. Add `quantityInStock: { gte: body.quantity }` filter in the update using `updateMany` and check count to prevent overselling.
- _verifier said_: real=True, Confirmed at apps/web/src/app/api/admin/invoices/[id]/line-items/route.ts:77. The POST handler resolves the inventory item via `prisma.inventoryItem.findFirst({ where: { itemName: body.description } })` using free-text description. There is no inventoryItemId in the zod schema, so any description edit, duplicate itemName, trailing whitespace, or non-matching SKU causes a silent miss (no stock decrement, but invoice still created and customer charged). There is also no `quantityInStock >= quantity` guard, allowing negative stock. The DELETE handler relies on referenceItemId which is only set when the name happens to match, compounding drift. This is a real data-integrity blocker.