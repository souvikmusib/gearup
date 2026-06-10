Apply small P3 nit fixes to gearup. Repo root: /Users/sagnikmitra/Desktop/GitHub/gearup.
- Next.js 14 App Router, Prisma 5 + Postgres, JWT auth.
- PERMISSIONS at `packages/types/src/domain.ts` (`@gearup/types`).
- AppError signature: `(statusCode: number, message: string, code: string)`.
- logActivity params: `actorType, actorId, action, entityType, entityId, previousValue?, newValue?, tx?`.
  NEVER use `adminUserId` or `metadata` — use `actorId: user.sub` and `previousValue/newValue`.
- handleApiError from `@/lib/errors`.

Rules:
1. Read each file before editing.
2. Apply EVERY finding to its target file. P3s are quality nits — make them ALL.
3. Preserve unrelated code. No reformatting outside the fix.
4. Don't run build.

Return JSON: {"files_edited": [...], "applied_ids": [...], "skipped": [{"id":"","reason":""}], "notes":"..."}.


## Target: `apps/web/src/app/api/admin/inventory/items/route.ts` (3 findings)

### [P3] logActivity called without await — failures swallowed, audit row may be lost
- id: `logactivity-not-awaited` · cat: observability
- loc: `apps/web/src/app/api/admin/inventory/items/route.ts:41, items/[id]/route.ts:28,42, stock/route.ts:43, categories/route.ts:22, categories/[id]/route.ts:14,23, suppliers/route.ts:25, suppliers/[id]/route.ts:18,27`
- evidence:
```
logActivity({ entityType: 'InventoryItem', entityId: item.id, action: 'inventory.item.created', newValue: item, actorType: 'ADMIN', actorId: user.sub });
return NextResponse.json({ success: true, data: item }, { status: 201 });
```
- impact: If logActivity is async and throws (DB hiccup, schema mismatch), the rejection becomes an unhandled promise rejection. Audit row is lost silently; in dev mode this kills the worker. Audit isn't transactional with the write either, so a failed write that succeeded partway through can still produce an audit row — though here the order is OK.
- fix: Either `await logActivity(...)` inside the same try, or document explicitly that it's fire-and-forget and have logActivity internally catch+console.error. Add a .catch(console.error) at minimum.

### [P3] items GET builds `where: Record<string, unknown>` — loses Prisma typing for filters
- id: `items-list-where-spread-untyped` · cat: type-safety
- loc: `apps/web/src/app/api/admin/inventory/items/route.ts:19-21`
- evidence:
```
const where: Record<string, unknown> = {};
if (categoryId) where.categoryId = categoryId;
if (search) where.OR = [{ itemName: { contains: search, mode: 'insensitive' } }, { sku: { contains: search, mode: 'insensitive' } }];
```
- impact: Misspelled keys would silently widen the result set. Same untyped pattern in movements GET.
- fix: Type as `Prisma.InventoryItemWhereInput` / `Prisma.StockMovementWhereInput`.

### [P3] Items POST schema doesn't verify categoryId exists — relies on Prisma FK error mapping
- id: `items-page-categoryid-not-validated` · cat: validation
- loc: `apps/web/src/app/api/admin/inventory/items/route.ts:34`
- evidence:
```
sku: z.string().min(1), itemName: z.string().min(1), categoryId: z.string(), supplierId: z.string().optional(),
```
- impact: categoryId='' passes z.string() (no min), Prisma then throws P2003 which maps to 400 'Invalid categoryId'. Functional but a min(1) would be tighter.
- fix: categoryId: z.string().min(1), supplierId: z.string().min(1).optional() (and .nullable() on PATCH).

---

## Target: `apps/web/src/app/api/admin/inventory/movements/route.ts` (2 findings)

### [P3] Movements GET passes raw movementType string to Prisma — no enum check
- id: `movements-movement-type-unvalidated` · cat: validation
- loc: `apps/web/src/app/api/admin/inventory/movements/route.ts:15-19`
- evidence:
```
const movementType = sp.get('movementType');
const inventoryItemId = sp.get('inventoryItemId');
if (movementType) where.movementType = movementType;
```
- impact: Invalid enum value reaches Prisma. Prisma may throw a generic validation error (mapped to 500) rather than a friendly 400. Not a security issue but a UX/observability one.
- fix: Parse with z.object({ movementType: z.enum(['STOCK_IN','STOCK_OUT','ADJUSTMENT_INCREASE','ADJUSTMENT_DECREASE','RESERVED','CONSUMED']).optional(), inventoryItemId: z.string().optional(), page: z.coerce.number().int().positive().optional(), pageSize: z.coerce.number().int().min(1).max(200).optional() }).parse(Object.fromEntries(sp)).

### [P3] Movements GET has no date-range filter — only movementType and item — hard to scope big audit views
- id: `createdat-filter-missing` · cat: ux
- loc: `apps/web/src/app/api/admin/inventory/movements/route.ts:11-19`
- evidence:
```
const movementType = sp.get('movementType');
const inventoryItemId = sp.get('inventoryItemId');
if (movementType) where.movementType = movementType;
if (inventoryItemId) where.inventoryItemId = inventoryItemId;
```
- impact: Production stock-movement table grows fast. Without dateFrom/dateTo, the UI can only paginate through history.
- fix: Add `dateFrom`/`dateTo` filters parsed with z.coerce.date(). Add @@index([createdAt]) on StockMovement if range scans become common.

---

## Target: `apps/web/src/app/api/admin/invoices/[id]/payments/route.ts` (1 findings)

### [P3] Payment amount z.number().min(0) allows recording a ₹0 payment
- id: `payment-amount-zero-allowed` · cat: validation
- loc: `apps/web/src/app/api/admin/invoices/[id]/payments/route.ts:9-15`
- evidence:
```
const schema = z.object({
  amount: z.number().min(0),
  ...
```
- impact: A zero-amount payment passes the updateMany guard (`amountDue >= 0`) trivially, creates a Payment row with amount=0, and counts toward the payments list. Pollutes the payments report and the per-day total. Not a money loss, but a data quality issue.
- fix: `amount: z.number().positive().finite()` and reject if `body.amount === 0` explicitly with a clear message.

---

## Target: `apps/web/src/app/api/admin/invoices/[id]/pdf/route.ts` (1 findings)

### [P3] Counter-sale invoice has no vehicleId — but PDF/AMC code paths read invoice.vehicleId without null guard in some branches
- id: `counter-sale-vehicleid-missing` · cat: error-handling
- loc: `apps/web/src/app/api/admin/invoices/[id]/pdf/route.ts:358-360 + payments/route.ts:78`
- evidence:
```
// pdf
if (hasAmc && invoice.vehicleId) { amcContract = await prisma.amcContract.findFirst({ where: { vehicleId: invoice.vehicleId, ...}}); }
// payments — AMC contract creation:
vehicleId: invoice.vehicleId,  // can be null for counter sale
amcPlanId: plan.id,
```
- impact: PDF is guarded. The payments route, when a COUNTER sale invoice has an AMC line item (a plan purchase), would create an AmcContract with `vehicleId: null`. The schema may or may not allow this — if vehicleId is required on AmcContract, this throws inside the transaction and rolls back the entire payment, blocking a customer who is paying at the counter. Worth verifying.
- fix: Check schema.prisma AmcContract.vehicleId nullability. If non-null, either require vehicleId on counter-sale AMC purchases or make AmcContract.vehicleId optional. Add a Zod-level guard in the line-items POST: AMC plan purchases require vehicleId on the invoice.

---

## Target: `apps/web/src/app/api/admin/invoices/route.ts` (2 findings)

### [P3] isUniqueJobCardInvoiceError fallback is dead code (no DB unique exists)
- id: `dead-unique-error-handler` · cat: dead-code
- loc: `apps/web/src/app/api/admin/invoices/route.ts:25-31,94-98`
- evidence:
```
function isUniqueJobCardInvoiceError(error: unknown) {
  ... return target === 'jobCardId';
}
// catch branch only triggers on P2002 on jobCardId — which never fires because no @@unique
```
- impact: Adds maintenance surface and gives a false sense of race protection. Will become live code (correctly) once the unique constraint is added.
- fix: Either add the unique constraint (preferred — see job-card-invoice-no-db-unique) so this code path actually runs, or remove the handler.

### [P3] logActivity called without await — exceptions inside it are unhandled rejections
- id: `activity-log-fire-and-forget` · cat: observability
- loc: `apps/web/src/app/api/admin/invoices/route.ts:99 + multiple`
- evidence:
```
logActivity({ entityType: 'Invoice', entityId: invoice.id, ...});
return NextResponse.json({ success: true, data: invoice }, { status: 201 });
```
- impact: If the activity log write fails (DB down, schema mismatch), the error becomes an unhandled promise rejection in Next.js and is invisible (no Sentry). Audit gaps for finalized invoices and recorded payments are a compliance issue.
- fix: `logActivity` is declared as a sync function returning a fire-and-forget promise — add `.catch(err => console.error('activity log failed', err))` inside it (or have it accept a tx and run inside the same transaction so it succeeds or rolls back).