# Invoices, line-items, finalize, payments, PDF — module audit

_Module key:_ `invoices-payments`

## Summary

The invoices module has solid permission gating and most multi-step writes use transactions, but several P0/P1 issues block a safe go-live: (1) the "one invoice per job card" rule has no DB-level unique index — only an app-level check that races; (2) line-item POST/PATCH/DELETE perform multi-write side effects (stock movements, AMC contract decrement, job-card sync, totals recalc) entirely OUTSIDE any transaction, so stock can drift and AMC services can get double-consumed under concurrency; (3) the AMC line-item flow decrements `servicesRemaining` at line-item add time (DRAFT, before payment), so an unfinalized invoice can permanently burn a customer's AMC service; (4) the AMC contract creation on payment uses `count()+1` for `contractNumber` — racy and will collide; (5) PART stock matching is done by `itemName` substring equality, which is brittle and dangerous (typos = silent no-op, duplicates = wrong item decremented); (6) discount math is inconsistent between create (POST /invoices) and add-line (POST line-items) — the POST route computes discount-percent off `preSubtotal` of non-discount items, while the add-line route computes it off the stored `subtotal` which already includes prior discount lines; (7) finalize has no idempotency / version check beyond an unguarded read-then-write so double-finalize is possible; (8) the payments record path mutates `amountDue` twice (once in `updateMany` decrement, then re-reads and overwrites with `Math.max(0,newDue)`), which is correct only because the guard `gte: body.amount` prevents going negative, but the second update wastes a round-trip and creates a window where another concurrent payment could be admitted; (9) PDF HTML is interpolated unsanitized into multiple templates, so any customer name / description / settings value containing `<script>` produces XSS in the print window; (10) Sentry is not initialized (lib/sentry is an empty `.gitkeep`). Plus several P2 quality issues around `as any`, dead unique-error fallback, missing pagination caps, and N+1 in the payments-on-paid AMC loop.

## Routes audited

- `GET /api/admin/invoices`
- `POST /api/admin/invoices`
- `GET /api/admin/invoices/[id]`
- `PATCH /api/admin/invoices/[id]`
- `POST /api/admin/invoices/[id]/finalize`
- `DELETE /api/admin/invoices/[id]/finalize`
- `POST /api/admin/invoices/[id]/line-items`
- `PATCH /api/admin/invoices/[id]/line-items`
- `DELETE /api/admin/invoices/[id]/line-items`
- `POST /api/admin/invoices/[id]/payments`
- `GET /api/admin/invoices/[id]/pdf`
- `GET /api/admin/payments`

## Files audited

- `/Users/sagnikmitra/Desktop/GitHub/gearup/apps/web/src/app/api/admin/invoices/route.ts`
- `/Users/sagnikmitra/Desktop/GitHub/gearup/apps/web/src/app/api/admin/invoices/[id]/route.ts`
- `/Users/sagnikmitra/Desktop/GitHub/gearup/apps/web/src/app/api/admin/invoices/[id]/finalize/route.ts`
- `/Users/sagnikmitra/Desktop/GitHub/gearup/apps/web/src/app/api/admin/invoices/[id]/line-items/route.ts`
- `/Users/sagnikmitra/Desktop/GitHub/gearup/apps/web/src/app/api/admin/invoices/[id]/payments/route.ts`
- `/Users/sagnikmitra/Desktop/GitHub/gearup/apps/web/src/app/api/admin/invoices/[id]/pdf/route.ts`
- `/Users/sagnikmitra/Desktop/GitHub/gearup/apps/web/src/app/api/admin/payments/route.ts`
- `/Users/sagnikmitra/Desktop/GitHub/gearup/apps/web/src/app/admin/invoices/page.tsx`
- `/Users/sagnikmitra/Desktop/GitHub/gearup/apps/web/src/app/admin/invoices/[id]/page.tsx`
- `/Users/sagnikmitra/Desktop/GitHub/gearup/apps/web/src/app/admin/payments/page.tsx`
- `/Users/sagnikmitra/Desktop/GitHub/gearup/apps/web/src/lib/auth.ts`
- `/Users/sagnikmitra/Desktop/GitHub/gearup/apps/web/src/lib/errors.ts`
- `/Users/sagnikmitra/Desktop/GitHub/gearup/apps/web/prisma/schema.prisma`

## Coupling

Depends on: lib/prisma (singleton client), lib/auth.requirePermission (JWT verify + permission set check, header-only Bearer — middleware presumed to translate cookie to header), lib/errors.handleApiError, lib/activity-logger.logActivity (fire-and-forget), lib/id-generators.generateInvoiceNumber, lib/pagination, @gearup/types PERMISSIONS. Cross-module side effects from line-items POST: InventoryItem.quantityInStock + StockMovement (inventory module), JobCardPart + JobCardTask (job-cards module), AmcContract.servicesUsed/servicesRemaining + AmcServiceUsage (AMC module). Payments POST also updates JobCard.status->DELIVERED and creates AmcContract + AmcServiceUsage on full payment. Invoice schema has no FK cascade to Payment/LineItem unique constraints (only Invoice@unique on invoiceNumber; no @@unique on jobCardId despite app-level "one invoice per job card" rule).

## Findings

### [P0 · BLOCKER] "One invoice per job card" enforced only in app code — DB has no unique constraint
_id:_ `job-card-invoice-no-db-unique` · _category:_ data-integrity · _file:_ `apps/web/prisma/schema.prisma:617 + apps/web/src/app/api/admin/invoices/route.ts:62-65`

```
// route.ts
if (body.jobCardId) {
  const existing = await prisma.invoice.findFirst({ where: { jobCardId: body.jobCardId } });
  if (existing) return NextResponse.json(..., { status: 409 });
}
// schema.prisma — Invoice.jobCardId has @@index but NO @@unique
```
**Impact.** Two concurrent POST /invoices with same jobCardId both pass the findFirst check and both create invoices. The downstream catch for P2002 on `jobCardId` will never fire because there is no unique index. Result: duplicate invoices per job card, broken billing reconciliation. The isUniqueJobCardInvoiceError handler is therefore dead code.

**Fix.** Add `jobCardId String? @unique` (or `@@unique([jobCardId])` allowing nulls in Postgres) to the Invoice model, run a migration, then remove the redundant findFirst pre-check.

  _Adversarial verify:_ **CONFIRMED** (now P1) — Verified: schema.prisma line 617 declares `jobCardId String?` with only `@@index([jobCardId])` at line 646 — no `@unique` or `@@unique`. The route's check-then-create at line 62-65 is a classic TOCTOU race: two concurrent POSTs can both pass findFirst and both insert. The `isUniqueJobCardInvoiceError` P2002 handler is indeed dead code since no unique constraint exists. Downgraded from P0 to P1 because the race window is narrow (requires concurrent requests for the same job card within milliseconds, typically same admin user clicking twice) and the impact is duplicate invoices that are recoverable via manual reconciliation, not data corruption or security breach. Still a real data-integrity bug worth fixing pre-go-live by adding `@unique` to jobCardId.

### [P0 · BLOCKER] Line-item POST/PATCH/DELETE perform multi-table writes with no $transaction
_id:_ `line-items-no-transaction` · _category:_ data-integrity · _file:_ `apps/web/src/app/api/admin/invoices/[id]/line-items/route.ts:25-114`

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
**Impact.** If any step after the inventory decrement fails (line-item create errors, syncJobCard FK fails, recalcTotals fails), stock has already been deducted with no compensating action. Same in DELETE: stock is restored before the line-item is actually deleted. For AMC: servicesRemaining is decremented before the line item is created — failure leaves an AMC service permanently consumed with no invoice line.

**Fix.** Wrap the entire POST/PATCH/DELETE handler bodies (lookups + all writes) in `prisma.$transaction(async (tx) => {...})` and pass tx through helpers. Recompute totals inside the same transaction.

  _Adversarial verify:_ **CONFIRMED** (now P0) — Confirmed in apps/web/src/app/api/admin/invoices/[id]/line-items/route.ts. POST decrements inventoryItem.quantityInStock and creates stockMovement (lines 85-88), or decrements amcContract.servicesRemaining and creates amcServiceUsage (lines 53-56), BEFORE creating the invoiceLineItem (line 94) and running recalcTotals + syncJobCard (line 110) — all as separate awaits with no prisma.$transaction wrapper. DELETE restores stock (lines 151-153) before deleting the line item (line 156), so a delete failure leaves stock double-credited. PATCH writes the line item then recalcTotals separately. Any intermediate failure leaves inventory, AMC service counts, stock ledger, and invoice totals out of sync with no compensation — a real data-integrity blocker for go-live.

### [P0 · BLOCKER] AMC service usage decremented when adding line item to a DRAFT invoice
_id:_ `amc-services-decremented-on-draft` · _category:_ business-logic · _file:_ `apps/web/src/app/api/admin/invoices/[id]/line-items/route.ts:47-56`

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
**Impact.** Adding an AMC line item to a DRAFT invoice permanently consumes one of the customer's prepaid AMC services. If the invoice is then deleted, the line item removed, or the invoice never finalized, the service is still gone — no rollback in the DELETE handler either. Also two concurrent adds can both pass the `servicesRemaining > 0` check and double-decrement (no row lock or conditional updateMany).

**Fix.** Defer servicesRemaining decrement + AmcServiceUsage creation to the finalize or full-payment step (the payments route already creates AmcServiceUsage on full payment for plan purchases — mirror this for contract usage). Use a conditional `updateMany` with `where: { id, servicesRemaining: { gt: 0 } }` and check `count`. Add the inverse restore to DELETE line-items.

  _Adversarial verify:_ **CONFIRMED** (now P0) — Confirmed at apps/web/src/app/api/admin/invoices/[id]/line-items/route.ts:47-56. POST on a DRAFT invoice immediately creates AmcServiceUsage and decrements servicesRemaining via two unconditional Prisma calls in a Promise.all (not even in a transaction). The DELETE handler at lines 140-161 only restores PART inventory — there is no AMC rollback path, so removing the line item or never finalizing the invoice permanently consumes a prepaid service. The concurrency race is also real: the servicesRemaining > 0 check is a plain read with no row lock and no conditional updateMany guard, so two concurrent adds can both pass and double-decrement. P0 is appropriate for a customer-billing flow.

### [P0 · BLOCKER] AMC contract number generated via count()+1 — race + collision
_id:_ `amc-contract-number-race` · _category:_ race-condition · _file:_ `apps/web/src/app/api/admin/invoices/[id]/payments/route.ts:74-77`

```
const count = await tx.amcContract.count();
const contract = await tx.amcContract.create({
  data: {
    contractNumber: `AMC-${String(count + 1).padStart(5, '0')}`,
    ...
```
**Impact.** Two concurrent final payments on different invoices will both read count=N and both try to insert AMC-N+1, producing a unique-constraint collision (assuming contractNumber is unique) or silent duplicates (if not). Same anti-pattern even inside the tx because the transactions use READ COMMITTED by default in Postgres — count() is not a lock.

**Fix.** Use the same id-generator pattern as `generateInvoiceNumber` (cuid + prefix, or a Postgres sequence: `nextval('amc_contract_seq')`), or wrap in a serializable retry loop. Don't compute monotonic ids from count().

  _Adversarial verify:_ **CONFIRMED** (now P0) — Verified at apps/web/src/app/api/admin/invoices/[id]/payments/route.ts:74-77. The code computes `contractNumber = AMC-${count+1}` from `tx.amcContract.count()`, and `contractNumber` is declared `@unique` in prisma/schema.prisma. Postgres default isolation is READ COMMITTED, so two concurrent final-payment transactions on different invoices that each create an AMC contract will both observe the same count and one insert will fail the unique constraint, rolling back the entire payment-record transaction. This is a genuine race that can block payment recording during concurrent activations; severity P0/go-live blocker stands.

### [P0 · BLOCKER] PART stock deduction matches inventory by free-text itemName
_id:_ `part-stock-matched-by-name` · _category:_ data-integrity · _file:_ `apps/web/src/app/api/admin/invoices/[id]/line-items/route.ts:77-91`

```
if (body.lineType === 'PART') {
  const invItem = await prisma.inventoryItem.findFirst({ where: { itemName: body.description } });
  if (invItem) {
    ...
    await Promise.all([
      prisma.inventoryItem.update({ where: { id: invItem.id }, data: { quantityInStock: { decrement: body.quantity } } }),
```
**Impact.** If two inventory items share an itemName, the WRONG item is decremented (findFirst is non-deterministic order). If the user types/edits the description, stock is NOT decremented (silent miss). If the description has trailing whitespace or a different SKU, same problem. Customers will be charged for parts that never leave stock — inventory audit will drift permanently. Also no check that quantityInStock >= body.quantity, so stock can go negative.

**Fix.** Pass `inventoryItemId` explicitly in the request body (the UI has the dropdown), look up by id. Add `quantityInStock: { gte: body.quantity }` filter in the update using `updateMany` and check count to prevent overselling.

  _Adversarial verify:_ **CONFIRMED** (now P0) — Confirmed at apps/web/src/app/api/admin/invoices/[id]/line-items/route.ts:77. The POST handler resolves the inventory item via `prisma.inventoryItem.findFirst({ where: { itemName: body.description } })` using free-text description. There is no inventoryItemId in the zod schema, so any description edit, duplicate itemName, trailing whitespace, or non-matching SKU causes a silent miss (no stock decrement, but invoice still created and customer charged). There is also no `quantityInStock >= quantity` guard, allowing negative stock. The DELETE handler relies on referenceItemId which is only set when the name happens to match, compounding drift. This is a real data-integrity blocker.

### [P1] Finalize is read-then-write — double-finalize race possible
_id:_ `finalize-no-conditional-update` · _category:_ race-condition · _file:_ `apps/web/src/app/api/admin/invoices/[id]/finalize/route.ts:11-16`

```
const existing = await prisma.invoice.findUniqueOrThrow({ where: { id: params.id } });
if (existing.invoiceStatus !== 'DRAFT') throw new ValidationError('Only DRAFT invoices can be finalized');
const invoice = await prisma.invoice.update({
  where: { id: params.id },
  data: { invoiceStatus: 'FINALIZED', finalizedAt: new Date() },
});
```
**Impact.** Two concurrent finalize requests both see DRAFT, both write FINALIZED + a new finalizedAt timestamp. The second silently overwrites the first's finalizedAt and re-fires the activity log + (in future) any side effects. No idempotency guarantee.

**Fix.** Replace with `prisma.invoice.updateMany({ where: { id, invoiceStatus: 'DRAFT' }, data: { invoiceStatus: 'FINALIZED', finalizedAt: new Date() } })` and if `count===0` throw the validation error. Same pattern for the revert-to-draft DELETE handler.

### [P1] Payment handler updates invoice twice; second write can clobber a concurrent payment
_id:_ `payment-double-update-window` · _category:_ race-condition · _file:_ `apps/web/src/app/api/admin/invoices/[id]/payments/route.ts:22-56`

```
const updated = await tx.invoice.updateMany({
  where: { id, invoiceStatus: 'FINALIZED', paymentStatus: { not: 'PAID' }, amountDue: { gte: body.amount } },
  data: { amountPaid: { increment: body.amount }, amountDue: { decrement: body.amount } },
});
...
const invoice = await tx.invoice.findUniqueOrThrow(...);
...
await tx.invoice.update({ where: { id }, data: { amountDue: Math.max(0, newDue), paymentStatus } });
```
**Impact.** The conditional updateMany correctly prevents overpayment. But the SECOND update unconditionally writes `amountDue: Math.max(0, newDue)` (where newDue is the value AFTER the first decrement). If two payments are interleaved at this point (READ COMMITTED), the second handler's second write can overwrite the first handler's amountDue with stale data. The Math.max(0,...) is also dead: the first updateMany already guaranteed amountDue >= 0.

**Fix.** Collapse to a single updateMany that sets paymentStatus conditionally (use raw SQL CASE) or compute paymentStatus from `newDue === 0` and use a second conditional updateMany with `where: { id, amountPaid: <expected> }` (optimistic lock).

### [P1] PDF templates interpolate untrusted strings directly into HTML — XSS in printed/exported pages
_id:_ `pdf-html-xss` · _category:_ security · _file:_ `apps/web/src/app/api/admin/invoices/[id]/pdf/route.ts:104,110,144,213,243`

```
<div style="font-weight:600;margin-top:3px">${invoice.customer.fullName}</div>
<div style="color:#666;font-size:11px">${invoice.customer.phoneNumber}</div>
...
<td ...>${li.description}</td>
...
${invoice.jobCard.issueSummary}
${biz.name}/${biz.address}/${footer} all from settings
```
**Impact.** Any admin-controlled or customer-controlled string (customer name, description, job-card issue summary, settings) containing `<script>` or `<img onerror=...>` executes in the print-preview window opened by the UI (which uses `w.document.write(html)`). Even though the route requires INVOICES_VIEW, customer names are user-provided and the rendered HTML opens in same-origin (`window.location.origin`) — so XSS = full admin session takeover via cookies/localStorage.

**Fix.** Add a small `escapeHtml(s)` helper and wrap every `${...}` that originates from user/customer/settings input. At minimum: customer.fullName, customer.phoneNumber, customer.email, vehicle.brand/model/registrationNumber, li.description, jobCard.issueSummary, jobCard.jobCardNumber, business.* settings, footer.

### [P1] Sentry never initialized — production errors invisible
_id:_ `sentry-not-initialized` · _category:_ observability · _file:_ `apps/web/src/lib/sentry/.gitkeep`

```
$ ls apps/web/src/lib/sentry/
.gitkeep   (directory contains only an empty marker file)
handleApiError uses console.error('Unhandled API error:', error);
```
**Impact.** Any unhandled 500 in invoice/payment/finalize/PDF flows is logged to stdout only. On Vercel, those logs are ephemeral, unsearchable past 1 hour on free tier, and there is no alerting. For a billing module going live tomorrow, you will not see real customer-blocking errors until customers complain.

**Fix.** Install `@sentry/nextjs`, run `npx @sentry/wizard@latest -i nextjs`, set SENTRY_DSN env var, and add `Sentry.captureException(error)` inside the `console.error` branch of `handleApiError` for non-AppError/non-Zod/non-Prisma cases.

### [P1] Discount math differs between invoice-create and add-line endpoints
_id:_ `discount-calc-inconsistent` · _category:_ business-logic · _file:_ `apps/web/src/app/api/admin/invoices/route.ts:71-79 vs apps/web/src/app/api/admin/invoices/[id]/line-items/route.ts:65-68`

```
// invoices POST: percent discount off preSubtotal of NON-DISCOUNT items
const preSubtotal = nonDiscountItems.reduce((sum, li) => sum + li.quantity * li.unitPrice, 0);
lineTotal = mode === 'percent' ? -(preSubtotal * (li.unitPrice / 100)) : ...;

// line-items POST: percent discount off the stored inv.subtotal (which already includes prior discount lines, net of tax)
lineTotal = body.discountMode === 'percent'
  ? -(Number(inv.subtotal) * (body.unitPrice / 100))
  : -(Math.abs(body.quantity * body.unitPrice));
```
**Impact.** Same invoice computed two ways yields different totals. A 10% discount added at creation time uses the pre-discount subtotal as the base; the same 10% discount added via the line-items endpoint uses the current subtotal which already net-of any earlier discount line. Stacking multiple percent discounts on the same invoice gives compounding behavior in one path and additive in the other. Customer-visible amount mismatch.

**Fix.** Extract a shared `computeLineTotals(lineItems, invoiceMeta)` helper in lib/ and call it from both routes. Define one canonical rule for the percent-discount base.

### [P2] Line-item PATCH/DELETE don't verify the lineItemId belongs to params.id (only Prisma's compound where guards it)
_id:_ `line-items-no-ownership-check` · _category:_ auth · _file:_ `apps/web/src/app/api/admin/invoices/[id]/line-items/route.ts:125,146`

```
const existing = await prisma.invoiceLineItem.findUniqueOrThrow({ where: { id: lineItemId, invoiceId: params.id } });
```
**Impact.** This is mostly safe because findUniqueOrThrow with both fields will throw P2025 if mismatched, but `findUnique({where:{id,invoiceId}})` is a non-standard usage — `id` is the unique key, the `invoiceId` filter only narrows. In current Prisma this returns null (and throws), but a future Prisma may change semantics. Defense-in-depth says use `findFirstOrThrow` here.

**Fix.** Switch to `prisma.invoiceLineItem.findFirstOrThrow({ where: { id: lineItemId, invoiceId: params.id } })` (and same for the update target if it accepts a where with extra fields, otherwise pre-validate then update by id).

### [P2] Pagination has no max pageSize — clients can request unbounded reads
_id:_ `pagination-no-max-cap` · _category:_ performance · _file:_ `apps/web/src/app/api/admin/invoices/route.ts:38 + apps/web/src/app/api/admin/payments/route.ts:13`

```
const pageSize = Number(sp.get('pageSize')) || 20;
const p = paginate({ page, pageSize });
```
**Impact.** Unless `paginate()` clamps the value (not verified in this audit — see lib/pagination), an admin could request `pageSize=1000000` and OOM the server while pulling every invoice + customer + vehicle join. Same for payments. Also `Number(...) || 20` accepts negative and NaN inputs without validation.

**Fix.** In lib/pagination clamp pageSize between 1 and 100. Validate with Zod: `z.coerce.number().int().min(1).max(100).default(20)`.

### [P2] AMC plan activation on full payment uses a for-loop with sequential awaits inside the txn
_id:_ `amc-on-paid-n+1` · _category:_ performance · _file:_ `apps/web/src/app/api/admin/invoices/[id]/payments/route.ts:68-86`

```
const amcLines = await tx.invoiceLineItem.findMany({ where: { invoiceId: params.id, lineType: 'AMC', referenceItemId: { not: null } } });
for (const line of amcLines) {
  const plan = await tx.amcPlan.findUnique({ where: { id: line.referenceItemId! } });
  ...
  const count = await tx.amcContract.count();
  const contract = await tx.amcContract.create({ ... });
  await tx.amcServiceUsage.create({ ... });
}
```
**Impact.** For an invoice with N AMC line items, this is 4N round-trips inside the transaction — extends lock duration on Invoice/AmcContract rows and increases deadlock risk under concurrent payments. Plus the count() race noted separately.

**Fix.** Batch: `await tx.amcPlan.findMany({ where: { id: { in: ids } } })`, then `tx.amcContract.createMany(...)`. Fix contractNumber generator to avoid count().

### [P2] `tx: any` and `as any` litter the invoice transactions — loses Prisma type safety
_id:_ `as-any-tx` · _category:_ type-safety · _file:_ `apps/web/src/app/api/admin/invoices/route.ts:68,78,90 + payments/route.ts:22,45,55`

```
invoice = await prisma.$transaction(async (tx: any) => {
  ...
  const mode = (li as any).discountMode || 'flat';
  ...
  data: { ... lineItems: { create: lines } } as any,
});
// payments
await prisma.$transaction(async (tx: any) => { ...
  data: { ... paymentMode: body.paymentMode as any, ...
```
**Impact.** `any` on tx hides real type errors when the schema changes (e.g. renaming a field silently compiles). `paymentMode as any` skips the PaymentMode enum check — an invalid mode string passes Zod (`z.string()`) and then Prisma errors at runtime as a P2003-ish 500 instead of a clean 400.

**Fix.** Type tx as `Prisma.TransactionClient`. Replace `paymentMode: z.string()` with `paymentMode: z.nativeEnum(PaymentMode)` (or the enum from @gearup/types). Remove `as any` casts.

### [P2] Invoice create line-item schema allows negative quantities and prices, missing description min
_id:_ `line-item-input-validation-thin` · _category:_ validation · _file:_ `apps/web/src/app/api/admin/invoices/route.ts:11-17`

```
const lineItemSchema = z.object({
  lineType: z.enum([...]),
  referenceItemId: z.string().optional(), description: z.string(),
  quantity: z.number().default(1), unitPrice: z.number().default(0),
  taxRate: z.number().default(0), sortOrder: z.number().default(0),
  discountMode: z.enum(['flat', 'percent']).optional(),
});
```
**Impact.** `description: z.string()` accepts empty string. `quantity` and `unitPrice` accept negative numbers and NaN (z.number() rejects NaN actually, but accepts -1e10). A negative quantity on a non-DISCOUNT line silently becomes a negative lineTotal, producing free invoices. taxRate has no 0..100 bound. The add-line endpoint correctly bounds discountPercent 0..100 but not taxRate.

**Fix.** `description: z.string().trim().min(1)`, `quantity: z.number().positive()` (or `nonnegative()` for adjustments), `unitPrice: z.number().nonnegative()`, `taxRate: z.number().min(0).max(100)`. Apply consistently across both POST routes.

### [P2] PATCH /invoices/[id] allows mutating notes/dueDate/discount on FINALIZED or PAID invoices
_id:_ `invoice-update-strict-but-no-finalized-guard` · _category:_ business-logic · _file:_ `apps/web/src/app/api/admin/invoices/[id]/route.ts:24-33`

```
export async function PATCH(req, { params }) {
  const user = requirePermission(PERMISSIONS.INVOICES_CREATE);
  const body = updateSchema.parse(await req.json());
  const data: Record<string, unknown> = { ...body };
  if (body.dueDate) data.dueDate = new Date(body.dueDate);
  const invoice = await prisma.invoice.update({ where: { id: params.id }, data });
```
**Impact.** discountValue/discountType can be changed on a finalized invoice without recomputing grandTotal/amountDue/taxTotal. The fields are persisted but the totals are stale, so the PDF and balance shown to the customer disagree with what was actually finalized. notes/dueDate post-finalization may be acceptable, but discount fields are not.

**Fix.** Either (a) reject discount-field changes when invoiceStatus !== 'DRAFT', or (b) re-run recalcTotals after any discount change. Best: split into two endpoints — metadata-only patch always allowed, discount patch only on DRAFT.

### [P3] isUniqueJobCardInvoiceError fallback is dead code (no DB unique exists)
_id:_ `dead-unique-error-handler` · _category:_ dead-code · _file:_ `apps/web/src/app/api/admin/invoices/route.ts:25-31,94-98`

```
function isUniqueJobCardInvoiceError(error: unknown) {
  ... return target === 'jobCardId';
}
// catch branch only triggers on P2002 on jobCardId — which never fires because no @@unique
```
**Impact.** Adds maintenance surface and gives a false sense of race protection. Will become live code (correctly) once the unique constraint is added.

**Fix.** Either add the unique constraint (preferred — see job-card-invoice-no-db-unique) so this code path actually runs, or remove the handler.

### [P3] logActivity called without await — exceptions inside it are unhandled rejections
_id:_ `activity-log-fire-and-forget` · _category:_ observability · _file:_ `apps/web/src/app/api/admin/invoices/route.ts:99 + multiple`

```
logActivity({ entityType: 'Invoice', entityId: invoice.id, ...});
return NextResponse.json({ success: true, data: invoice }, { status: 201 });
```
**Impact.** If the activity log write fails (DB down, schema mismatch), the error becomes an unhandled promise rejection in Next.js and is invisible (no Sentry). Audit gaps for finalized invoices and recorded payments are a compliance issue.

**Fix.** `logActivity` is declared as a sync function returning a fire-and-forget promise — add `.catch(err => console.error('activity log failed', err))` inside it (or have it accept a tx and run inside the same transaction so it succeeds or rolls back).

### [P3] UI optimistic add/remove line doesn't lock the form against concurrent edits
_id:_ `ui-add-line-no-await-block` · _category:_ ux · _file:_ `apps/web/src/app/admin/invoices/[id]/page.tsx:157-176,196-201`

```
const addLine = async () => {
  ... setData((d) => ({ ...d, lineItems: [...lineItems, optimistic] }));
  ... const res = await api.post(...);
  if (res.success) { fetch(); }
  else { fetch(); alert(res.error?.message || 'Failed to add line item'); }
};
// removeLine: optimistic remove with NO rollback if API fails
```
**Impact.** `removeLine` removes the row from the table, then awaits DELETE. If DELETE fails (e.g. finalized invoice), the line is silently restored only because of the trailing `fetch()` — but there's no error feedback. User thinks they removed it.

**Fix.** Check res.success after delete and alert/restore. Disable the row buttons while the request is in-flight.

### [P3] Payment amount z.number().min(0) allows recording a ₹0 payment
_id:_ `payment-amount-zero-allowed` · _category:_ validation · _file:_ `apps/web/src/app/api/admin/invoices/[id]/payments/route.ts:9-15`

```
const schema = z.object({
  amount: z.number().min(0),
  ...
```
**Impact.** A zero-amount payment passes the updateMany guard (`amountDue >= 0`) trivially, creates a Payment row with amount=0, and counts toward the payments list. Pollutes the payments report and the per-day total. Not a money loss, but a data quality issue.

**Fix.** `amount: z.number().positive().finite()` and reject if `body.amount === 0` explicitly with a clear message.

### [P2] recalcTotals reuses stored discountAmount, ignoring DISCOUNT_ADJUSTMENT lines
_id:_ `recalc-totals-loses-discount` · _category:_ business-logic · _file:_ `apps/web/src/app/api/admin/invoices/[id]/line-items/route.ts:15-23`

```
async function recalcTotals(invoiceId, inv?) {
  const lines = await prisma.invoiceLineItem.findMany({ where: { invoiceId } });
  const subtotal = lines.reduce((s, l) => s + Number(l.lineTotal) - Number(l.taxAmount), 0);
  ...
  const discountAmount = inv ? Number(inv.discountAmount) : Number((await prisma.invoice.findUniqueOrThrow(...)).discountAmount);
  ...
  const grandTotal = Math.round(subtotal + taxTotal - discountAmount);
```
**Impact.** `subtotal` includes the negative lineTotals from DISCOUNT_ADJUSTMENT lines AND the stored `invoice.discountAmount` is also subtracted again. If the invoice has both header-level discount (set at creation) and inline discount lines, the discount is double-counted; if only inline, it works. Inverse for invoices with only header discount that are then edited via line-items — recalc would zero out the line-discount effect only because subtotal already encodes it. Hard to reason about; needs a single source of truth.

**Fix.** Decide: discounts live as line items OR as header field, not both. If both must exist, change recalc to: `subtotal = sum(nonDiscount.lineTotal - taxAmount); discountFromLines = sum(discountLines.lineTotal); grandTotal = subtotal + taxTotal + discountFromLines - headerDiscountAmount`. Add a unit test.

### [P3] Counter-sale invoice has no vehicleId — but PDF/AMC code paths read invoice.vehicleId without null guard in some branches
_id:_ `counter-sale-vehicleid-missing` · _category:_ error-handling · _file:_ `apps/web/src/app/api/admin/invoices/[id]/pdf/route.ts:358-360 + payments/route.ts:78`

```
// pdf
if (hasAmc && invoice.vehicleId) { amcContract = await prisma.amcContract.findFirst({ where: { vehicleId: invoice.vehicleId, ...}}); }
// payments — AMC contract creation:
vehicleId: invoice.vehicleId,  // can be null for counter sale
amcPlanId: plan.id,
```
**Impact.** PDF is guarded. The payments route, when a COUNTER sale invoice has an AMC line item (a plan purchase), would create an AmcContract with `vehicleId: null`. The schema may or may not allow this — if vehicleId is required on AmcContract, this throws inside the transaction and rolls back the entire payment, blocking a customer who is paying at the counter. Worth verifying.

**Fix.** Check schema.prisma AmcContract.vehicleId nullability. If non-null, either require vehicleId on counter-sale AMC purchases or make AmcContract.vehicleId optional. Add a Zod-level guard in the line-items POST: AMC plan purchases require vehicleId on the invoice.

### [P3] Invoices list page has overlapping +New Invoice and +Counter Sale buttons inside the same flex
_id:_ `counter-sale-button-overlap` · _category:_ ux · _file:_ `apps/web/src/app/admin/invoices/page.tsx:153-157`

```
<div className="flex items-center justify-between mb-4">
  <PageHeader title="Invoices" />
  <button onClick={openCreate} className="... bg-blue-600 ...">+ New Invoice</button>
  <button onClick={openCounterSale} className="... border-blue-600 ...">+ Counter Sale</button>
</div>
```
**Impact.** With `justify-between` on a 3-child flex, the two buttons sit at the right with no gap. Cosmetic but visible on go-live.

**Fix.** Wrap the two buttons in a `<div className="flex gap-2">` so they share the right slot.

### [P2] AMC line item with amcPlanId but no amcContractId silently sets referenceItemId to the plan id
_id:_ `line-item-amc-plan-without-contract` · _category:_ data-integrity · _file:_ `apps/web/src/app/api/admin/invoices/[id]/line-items/route.ts:57-63`

```
} else if (body.amcPlanId) {
  const plan = await prisma.amcPlan.findUniqueOrThrow({ where: { id: body.amcPlanId } });
  lineTotal = Number(plan.price);
  referenceItemId = body.amcPlanId;
} else {
  lineTotal = 0;
}
```
**Impact.** `referenceItemId` is a generic free-form FK to inventory items in other paths (see DELETE handler restoring stock based on referenceItemId for PART). For AMC lines it points to an AmcPlan id. If anyone ever cross-queries InventoryItem.findUnique on a PART-line's referenceItemId and gets the same id collision pattern, behavior is undefined. More immediately: DELETE on an AMC line with lineType='PART' (impossible) is fine, but the conceptual overloading of referenceItemId is fragile.

**Fix.** Either add a typed `referenceType` enum on InvoiceLineItem, or add separate `inventoryItemId` / `amcPlanId` / `amcContractId` FK columns. At minimum, add a comment in the schema and a defensive check in DELETE that lineItem.referenceItemId resolves to an InventoryItem before decrementing.
