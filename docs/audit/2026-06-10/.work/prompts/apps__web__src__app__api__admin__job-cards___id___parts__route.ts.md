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

Target file: `apps/web/src/app/api/admin/job-cards/[id]/parts/route.ts`

## Findings to fix in this file (5)

### 1. [P0 · BLOCKER] Part POST invoice sync runs outside the stock-adjusting transaction
- _id_: `part-invoice-sync-outside-tx` · _category_: data-integrity
- _location_: `apps/web/src/app/api/admin/job-cards/[id]/parts/route.ts:62-81`
- _evidence_:
```
const part = await prisma.$transaction(async (tx) => { ... });
// Sync to invoice if one exists (draft only)
const invoice = await prisma.invoice.findFirst({ where: { jobCardId: params.id, invoiceStatus: 'DRAFT' } });
if (invoice) {
  ...
  await prisma.invoiceLineItem.create(...);
  ...
  await prisma.invoice.update(...);
}
```
- _impact_: Stock is reserved + JobCardPart row exists, but if the invoice line/totals write fails, stock stays held and the invoice subtotal/taxes drift permanently. Concurrent part-adds will also race on invoice totals (read-modify-write of grandTotal/amountDue with no row lock).
- _proposed fix_: Move invoice-sync logic inside the transaction. Read the invoice with tx, write line item with tx, then recompute totals from tx-queried lines and update invoice in the same tx.
- _verifier said_: real=True, Confirmed at apps/web/src/app/api/admin/job-cards/[id]/parts/route.ts:50-81. The prisma.$transaction closes at line 59 (committing stock reservation + JobCardPart row), and invoice sync at lines 63-79 uses top-level prisma client, not tx. If invoiceLineItem.create or invoice.update fails, stock stays reserved and JobCardPart persists while the invoice never reflects it — permanent drift. Additionally, the read-modify-write of grandTotal/amountDue (findMany lines -> reduce -> update) has no row lock, so concurrent POSTs will race and produce stale totals. Real P0 data-integrity blocker.

### 2. [P1] Part->invoice sync recomputes invoice totals but ignores per-line discountAmount/discountPercent
- _id_: `part-invoice-totals-ignore-discount` · _category_: business-logic
- _location_: `apps/web/src/app/api/admin/job-cards/[id]/parts/route.ts:73-79`
- _evidence_:
```
await prisma.invoiceLineItem.create({ data: { ..., quantity: body.requiredQty, unitPrice, taxRate, taxAmount, lineTotal: subtotal + taxAmount, ... } });
const lines = await prisma.invoiceLineItem.findMany({ where: { invoiceId: invoice.id } });
const invSubtotal = lines.reduce((s, l) => s + Number(l.lineTotal) - Number(l.taxAmount), 0);
const invTaxTotal = lines.reduce((s, l) => s + Number(l.taxAmount), 0);
const grandTotal = invSubtotal + invTaxTotal - Number(invoice.discountAmount);
```
- _impact_: InventoryItem.discountPercent is applied to the JobCardPart.unitPrice (line 54), but the new line is written with that price as if there was no discount, while the invoice screen renders the discount column from the item. Totals shown on invoice vs job-card cost summary will disagree, and tax is computed on the post-discount unit price, not the schema's expected subtotal-then-discount flow used elsewhere in the invoice module. This will surface as wrong customer totals at billing.
- _proposed fix_: Centralise line-total math in one helper used by both invoice POST/PATCH and this sync path; persist discountPercent on the line and compute subtotal/tax/lineTotal identically. Add a unit test fixture for the part->invoice flow.

### 3. [P1] PATCH /parts accepts consumedQty but never adjusts stock or writes StockMovement
- _id_: `part-patch-allows-setting-consumed-without-stock-move` · _category_: data-integrity
- _location_: `apps/web/src/app/api/admin/job-cards/[id]/parts/route.ts:87-108`
- _evidence_:
```
const body = z.object({
  partId: z.string(),
  requiredQty: z.number().min(0.01).optional(), consumedQty: z.number().optional(),
  unitPrice: z.number().optional(), notes: z.string().nullable().optional(),
}).parse(await req.json());
... // only requiredQty branches adjust stock; consumedQty just gets written
```
- _impact_: When a mechanic marks a part as consumed, the inventory's reservedQuantity should drop and stock should be permanently deducted (a CONSUMED movement). Right now JobCardPart.consumedQty grows but reservedQuantity stays held forever, so stock counts and reservation reports diverge from reality. consumedQty also has no upper bound vs requiredQty.
- _proposed fix_: In the same transaction, when consumedQty increases by delta>0, call a new adjustStock variant that decrements reservedQuantity by delta (no increment to quantityInStock) and writes a 'CONSUMED' StockMovement. Validate consumedQty <= requiredQty in Zod (z.refine).

### 4. [P1] DELETE /parts releases reservedQty OR requiredQty fallback can over-release stock
- _id_: `part-delete-double-release` · _category_: data-integrity
- _location_: `apps/web/src/app/api/admin/job-cards/[id]/parts/route.ts:119-125`
- _evidence_:
```
const part = await tx.jobCardPart.findUniqueOrThrow({ where: { id: partId, jobCardId: params.id } });
const releaseQty = Number(part.reservedQty) > 0 ? Number(part.reservedQty) : Number(part.requiredQty);
await tx.jobCardPart.delete({ where: { id: partId } });
await adjustStock(tx, part.inventoryItemId, releaseQty, 'RELEASED', params.id);
```
- _impact_: If consumedQty > 0 (some already consumed), reservedQty should be requiredQty - consumedQty, but the row still has reservedQty == requiredQty because PATCH never decrements it (see prior finding). Releasing the full reservedQty will inflate quantityInStock by parts that have already been physically consumed.
- _proposed fix_: Once consumedQty handling is fixed, releaseQty must be only the still-reserved (uncommitted) portion. Add an assertion: releaseQty = max(0, reservedQty - consumedQty).

### 5. [P1] No unique constraint or upsert: same inventory item can be added twice to a job card with race condition on duplicate-line check
- _id_: `part-post-race-double-add-no-unique` · _category_: race-condition
- _location_: `apps/web/src/app/api/admin/job-cards/[id]/parts/route.ts:63-72`
- _evidence_:
```
const exists = await prisma.invoiceLineItem.findFirst({ where: { invoiceId: invoice.id, referenceItemId: body.inventoryItemId } });
if (!exists) {
  ...
  await prisma.invoiceLineItem.create({ data: { ... } });
```
- _impact_: Two concurrent POSTs (admin double-clicks Add) both see exists=null, both reserve stock, both append an invoice line, but only one JobCardPart row will visually show the qty — invoice double-charges. Schema has no @@unique([jobCardId, inventoryItemId]) on JobCardPart either.
- _proposed fix_: Add @@unique([jobCardId, inventoryItemId]) on JobCardPart and rely on P2002 from handleApiError. Use upsert(create-or-increment-qty) semantics; or wrap the invoice-line check in the same tx + SELECT FOR UPDATE on invoice row.