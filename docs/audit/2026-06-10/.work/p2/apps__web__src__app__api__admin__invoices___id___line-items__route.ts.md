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

Target file: `apps/web/src/app/api/admin/invoices/[id]/line-items/route.ts`

## Findings (3)

### [P2] Line-item PATCH/DELETE don't verify the lineItemId belongs to params.id (only Prisma's compound where guards it)
- id: `line-items-no-ownership-check` · category: auth
- location: `apps/web/src/app/api/admin/invoices/[id]/line-items/route.ts:125,146`
- evidence:
```
const existing = await prisma.invoiceLineItem.findUniqueOrThrow({ where: { id: lineItemId, invoiceId: params.id } });
```
- impact: This is mostly safe because findUniqueOrThrow with both fields will throw P2025 if mismatched, but `findUnique({where:{id,invoiceId}})` is a non-standard usage — `id` is the unique key, the `invoiceId` filter only narrows. In current Prisma this returns null (and throws), but a future Prisma may change semantics. Defense-in-depth says use `findFirstOrThrow` here.
- proposed fix: Switch to `prisma.invoiceLineItem.findFirstOrThrow({ where: { id: lineItemId, invoiceId: params.id } })` (and same for the update target if it accepts a where with extra fields, otherwise pre-validate then update by id).

### [P2] recalcTotals reuses stored discountAmount, ignoring DISCOUNT_ADJUSTMENT lines
- id: `recalc-totals-loses-discount` · category: business-logic
- location: `apps/web/src/app/api/admin/invoices/[id]/line-items/route.ts:15-23`
- evidence:
```
async function recalcTotals(invoiceId, inv?) {
  const lines = await prisma.invoiceLineItem.findMany({ where: { invoiceId } });
  const subtotal = lines.reduce((s, l) => s + Number(l.lineTotal) - Number(l.taxAmount), 0);
  ...
  const discountAmount = inv ? Number(inv.discountAmount) : Number((await prisma.invoice.findUniqueOrThrow(...)).discountAmount);
  ...
  const grandTotal = Math.round(subtotal + taxTotal - discountAmount);
```
- impact: `subtotal` includes the negative lineTotals from DISCOUNT_ADJUSTMENT lines AND the stored `invoice.discountAmount` is also subtracted again. If the invoice has both header-level discount (set at creation) and inline discount lines, the discount is double-counted; if only inline, it works. Inverse for invoices with only header discount that are then edited via line-items — recalc would zero out the line-discount effect only because subtotal already encodes it. Hard to reason about; needs a single source of truth.
- proposed fix: Decide: discounts live as line items OR as header field, not both. If both must exist, change recalc to: `subtotal = sum(nonDiscount.lineTotal - taxAmount); discountFromLines = sum(discountLines.lineTotal); grandTotal = subtotal + taxTotal + discountFromLines - headerDiscountAmount`. Add a unit test.

### [P2] AMC line item with amcPlanId but no amcContractId silently sets referenceItemId to the plan id
- id: `line-item-amc-plan-without-contract` · category: data-integrity
- location: `apps/web/src/app/api/admin/invoices/[id]/line-items/route.ts:57-63`
- evidence:
```
} else if (body.amcPlanId) {
  const plan = await prisma.amcPlan.findUniqueOrThrow({ where: { id: body.amcPlanId } });
  lineTotal = Number(plan.price);
  referenceItemId = body.amcPlanId;
} else {
  lineTotal = 0;
}
```
- impact: `referenceItemId` is a generic free-form FK to inventory items in other paths (see DELETE handler restoring stock based on referenceItemId for PART). For AMC lines it points to an AmcPlan id. If anyone ever cross-queries InventoryItem.findUnique on a PART-line's referenceItemId and gets the same id collision pattern, behavior is undefined. More immediately: DELETE on an AMC line with lineType='PART' (impossible) is fine, but the conceptual overloading of referenceItemId is fragile.
- proposed fix: Either add a typed `referenceType` enum on InvoiceLineItem, or add separate `inventoryItemId` / `amcPlanId` / `amcContractId` FK columns. At minimum, add a comment in the schema and a defensive check in DELETE that lineItem.referenceItemId resolves to an InventoryItem before decrementing.