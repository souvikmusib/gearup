# Inventory: items, categories, suppliers, movements, low-stock — module audit

_Module key:_ `inventory`

## Summary

The inventory module is structurally clean (single Prisma transaction guards the stock-adjustment path, schema uses Decimal correctly, handleApiError is used everywhere, indexes are sensible on FKs and itemName). However several go-live concerns exist: (1) the InventoryItem create endpoint accepts `quantityInStock` directly with no offsetting `StockMovement` row, breaking auditability and leaving the running ledger inconsistent from day one; (2) DELETE item drops `stockMovements` outside a transaction (partial-failure risk and silent loss of audit data); (3) DELETE category and DELETE supplier do nothing to handle FK violations gracefully — they rely entirely on Prisma's P2003 error mapping which produces a confusing "Invalid reference" message rather than a guarded count check (UX/data-integrity P1); (4) DELETE item ignores `reservedQuantity` and JobCard-part history could be in a non-terminal job card; (5) inputs bypass type-safety via repeated `as any` casts on `data: body as any`; (6) low-stock route fetches all reorder-tracked items in memory and filters client-side (N-scale issue); (7) Supplier email field has no zod email format validation, contact phone has no format check; (8) movements GET passes raw `movementType` string into Prisma without enum validation, allowing arbitrary string filter (silent empty result, not a security risk but a footgun); (9) pageSize is unbounded on items + movements (`Number(sp.get('pageSize'))` with no cap → DoS-style large reads); (10) no rate limiting on any mutating route (consistent with rest of app, but worth flagging); (11) Sentry not initialized; (12) several UI forms (categories create, items create, stock adjust types as enum) don't disable while submitting or surface server errors to the user — silent failure on validation error.

## Routes audited

- `GET/POST /api/admin/inventory/items`
- `GET/PATCH/DELETE /api/admin/inventory/items/[id]`
- `POST /api/admin/inventory/items/[id]/stock`
- `GET/POST /api/admin/inventory/categories`
- `PATCH/DELETE /api/admin/inventory/categories/[id]`
- `GET/POST /api/admin/inventory/suppliers`
- `PATCH/DELETE /api/admin/inventory/suppliers/[id]`
- `GET /api/admin/inventory/movements`
- `GET /api/admin/inventory/low-stock`

## Files audited

- `/Users/sagnikmitra/Desktop/GitHub/gearup/apps/web/src/app/api/admin/inventory/items/route.ts`
- `/Users/sagnikmitra/Desktop/GitHub/gearup/apps/web/src/app/api/admin/inventory/items/[id]/route.ts`
- `/Users/sagnikmitra/Desktop/GitHub/gearup/apps/web/src/app/api/admin/inventory/items/[id]/stock/route.ts`
- `/Users/sagnikmitra/Desktop/GitHub/gearup/apps/web/src/app/api/admin/inventory/categories/route.ts`
- `/Users/sagnikmitra/Desktop/GitHub/gearup/apps/web/src/app/api/admin/inventory/categories/[id]/route.ts`
- `/Users/sagnikmitra/Desktop/GitHub/gearup/apps/web/src/app/api/admin/inventory/suppliers/route.ts`
- `/Users/sagnikmitra/Desktop/GitHub/gearup/apps/web/src/app/api/admin/inventory/suppliers/[id]/route.ts`
- `/Users/sagnikmitra/Desktop/GitHub/gearup/apps/web/src/app/api/admin/inventory/movements/route.ts`
- `/Users/sagnikmitra/Desktop/GitHub/gearup/apps/web/src/app/api/admin/inventory/low-stock/route.ts`
- `/Users/sagnikmitra/Desktop/GitHub/gearup/apps/web/src/app/admin/inventory/items/page.tsx`
- `/Users/sagnikmitra/Desktop/GitHub/gearup/apps/web/src/app/admin/inventory/categories/page.tsx`
- `/Users/sagnikmitra/Desktop/GitHub/gearup/apps/web/src/app/admin/inventory/suppliers/page.tsx`
- `/Users/sagnikmitra/Desktop/GitHub/gearup/apps/web/src/app/admin/inventory/movements/page.tsx`
- `/Users/sagnikmitra/Desktop/GitHub/gearup/apps/web/src/app/admin/inventory/low-stock/page.tsx`
- `/Users/sagnikmitra/Desktop/GitHub/gearup/apps/web/src/lib/auth.ts`
- `/Users/sagnikmitra/Desktop/GitHub/gearup/apps/web/src/lib/errors.ts`
- `/Users/sagnikmitra/Desktop/GitHub/gearup/apps/web/prisma/schema.prisma`

## Coupling

Depends on: lib/auth.requirePermission (JWT bearer), lib/prisma, lib/errors.handleApiError, lib/pagination, lib/activity-logger.logActivity (fire-and-forget, not awaited), @gearup/types PERMISSIONS. Downstream: stock movements feed JobCardPart consumption (apps/web/src/app/api/admin/job-cards/[id]/parts/route.ts uses inventoryItem.reservedQuantity + quantityInStock — same row, so this module's mutations directly affect job-card billing). InventoryItem.reservedQuantity is read/written by job-cards/parts route but never reset by this module. JobCardPart.onDelete is implicit (not Cascade) — DELETE item is gated by a count check.

## Findings

### [P1] Item create writes initial quantityInStock but logs no StockMovement
_id:_ `item-create-no-stock-movement` · _category:_ data-integrity · _file:_ `apps/web/src/app/api/admin/inventory/items/route.ts:30-43`

```
const body = z.object({ ... quantityInStock: z.number().optional(), ... }).parse(await req.json());
const item = await prisma.inventoryItem.create({ data: body as any });
logActivity({ entityType: 'InventoryItem', entityId: item.id, action: 'inventory.item.created', ... });
```
**Impact.** Opening stock is invisible in the StockMovement ledger. Sum of movements will never reconcile with quantityInStock, breaking any audit/closing-stock report from day one. Cannot answer 'how did stock reach 50?' for items created with non-zero opening.

**Fix.** Wrap create + (if quantityInStock>0) StockMovement insert in prisma.$transaction. Use movementType 'STOCK_IN' or a new 'OPENING_BALANCE' enum value with previousQuantity=0, newQuantity=opening.

### [P1] DELETE item: deleteMany(stockMovements) + delete(item) not in a transaction
_id:_ `item-delete-non-transactional` · _category:_ data-integrity · _file:_ `apps/web/src/app/api/admin/inventory/items/[id]/route.ts:36-44`

```
const usedInJobCards = await prisma.jobCardPart.count({ where: { inventoryItemId: params.id } });
if (usedInJobCards > 0) { ... 409 }
await prisma.stockMovement.deleteMany({ where: { inventoryItemId: params.id } });
await prisma.inventoryItem.delete({ where: { id: params.id } });
```
**Impact.** If the second call fails (FK conflict, network blip), stock-movement audit history is gone but the item still exists with no ledger. Also TOCTOU: a parts row could be added between the count check and the delete.

**Fix.** Move both deletes into prisma.$transaction(async tx => { ... }). Re-check jobCardPart count inside the tx. Better: soft-delete by setting isActive=false to preserve audit trail (consistent with the existing isActive column).

### [P2] Stock adjustment uses updateMany then findUniqueOrThrow inside tx — extra round-trip and weak post-condition
_id:_ `stock-route-find-after-update-redundant-roundtrip` · _category:_ performance · _file:_ `apps/web/src/app/api/admin/inventory/items/[id]/stock/route.ts:22-41`

```
const updated = await tx.inventoryItem.updateMany({ where: { id: params.id, ...(isIncrease ? {} : { quantityInStock: { gte: body.quantity } }) }, data: { quantityInStock: { increment: delta } } });
if (updated.count === 0) throw new ValidationError('Insufficient stock for this adjustment.');
const item = await tx.inventoryItem.findUniqueOrThrow({ where: { id: params.id } });
```
**Impact.** Two queries instead of one. More importantly: updateMany returns no rows so we re-read separately — if another concurrent stock op races between update and read, newQuantity recorded in the StockMovement row may not match the delta actually applied here (prev = newQty - delta could be off by another transaction's delta).

**Fix.** Use prisma.inventoryItem.update (single row update returns the row) wrapped in a try for P2025; for the insufficient-stock guard, do a SELECT FOR UPDATE via $queryRaw or check item.quantityInStock first inside the tx and update with a precise WHERE. Better: use Postgres advisory lock per item id, or do `update ... returning quantityInStock` via $queryRaw and compute prev = new - delta in same statement.

### [P1] previousQuantity computed as newQuantity - delta after a second read can be wrong under concurrency
_id:_ `stock-prev-qty-race` · _category:_ race-condition · _file:_ `apps/web/src/app/api/admin/inventory/items/[id]/stock/route.ts:32-38`

```
const item = await tx.inventoryItem.findUniqueOrThrow({ where: { id: params.id } });
const newQty = Number(item.quantityInStock);
const prev = newQty - delta;
await tx.stockMovement.create({ data: { ... previousQuantity: prev, newQuantity: newQty, ... } });
```
**Impact.** Default Postgres isolation is READ COMMITTED. Between the increment update and the subsequent findUnique inside the same tx, another committed transaction's increment can be visible. The stored newQuantity will then reflect both increments while delta only reflects this op's quantity — both prev and new will be wrong in the ledger, even though final balance is consistent.

**Fix.** Capture the post-update value atomically: use $queryRaw `UPDATE ... SET quantity_in_stock = quantity_in_stock + $1 WHERE id = $2 AND ($3 OR quantity_in_stock >= $4) RETURNING quantity_in_stock` and compute prev = returned - delta in the same statement. Or use SELECT ... FOR UPDATE first, then update, then derive.

### [P2] Item POST trusts caller-supplied quantityInStock with no transactional ledger entry (mass-assignment-adjacent)
_id:_ `item-create-no-stockmovement-tx` · _category:_ validation · _file:_ `apps/web/src/app/api/admin/inventory/items/route.ts:33-41`

```
sku: z.string().min(1), ... quantityInStock: z.number().optional(), reorderLevel: z.number().optional(), ...
const item = await prisma.inventoryItem.create({ data: body as any });
```
**Impact.** quantityInStock and reservedQuantity-adjacent fields can be seeded arbitrarily and bypass the stock-movement pathway. Numbers also lack `.nonnegative()` — caller can create an item with -1000 stock.

**Fix.** Add .nonnegative() to costPrice, sellingPrice, quantityInStock, reorderLevel, reorderQuantity. Forbid quantityInStock in the schema and require it to be added via the dedicated stock route (or auto-emit an OPENING_BALANCE movement).

### [P2] `data: body as any` defeats Prisma input typing on item create and update
_id:_ `as-any-prisma-cast` · _category:_ type-safety · _file:_ `apps/web/src/app/api/admin/inventory/items/route.ts:40 and apps/web/src/app/api/admin/inventory/items/[id]/route.ts:27`

```
const item = await prisma.inventoryItem.create({ data: body as any });
...
const item = await prisma.inventoryItem.update({ where: { id: params.id }, data: body as any });
```
**Impact.** Refactors to schema (e.g. renaming a field, adding a required field) will not produce a type error. Zod schema and Prisma input can drift silently.

**Fix.** Type the zod schema as `z.object({...}) satisfies z.ZodType<Prisma.InventoryItemCreateInput>` or remove `as any` and let TS confirm field-by-field compatibility. Pass through an explicit mapping object.

### [P2] Supplier email and phone accept any string (no format validation)
_id:_ `supplier-email-no-format` · _category:_ validation · _file:_ `apps/web/src/app/api/admin/inventory/suppliers/route.ts:20-23`

```
supplierName: z.string().min(1), phone: z.string().optional(), email: z.string().optional(),
address: z.string().optional(), contactPerson: z.string().optional(), notes: z.string().optional(),
```
**Impact.** Garbage emails ('abc') and phones get stored; later notification flows will fail at send-time. PATCH route has the same gap.

**Fix.** Use z.string().email().optional() for email, z.string().regex(/^\+?\d[\d\s-]{7,15}$/) for phone (or share a phone validator from lib/validators).

### [P3] Movements GET passes raw movementType string to Prisma — no enum check
_id:_ `movements-movement-type-unvalidated` · _category:_ validation · _file:_ `apps/web/src/app/api/admin/inventory/movements/route.ts:15-19`

```
const movementType = sp.get('movementType');
const inventoryItemId = sp.get('inventoryItemId');
if (movementType) where.movementType = movementType;
```
**Impact.** Invalid enum value reaches Prisma. Prisma may throw a generic validation error (mapped to 500) rather than a friendly 400. Not a security issue but a UX/observability one.

**Fix.** Parse with z.object({ movementType: z.enum(['STOCK_IN','STOCK_OUT','ADJUSTMENT_INCREASE','ADJUSTMENT_DECREASE','RESERVED','CONSUMED']).optional(), inventoryItemId: z.string().optional(), page: z.coerce.number().int().positive().optional(), pageSize: z.coerce.number().int().min(1).max(200).optional() }).parse(Object.fromEntries(sp)).

### [P2] pageSize query param is unbounded on items and movements lists
_id:_ `unbounded-page-size` · _category:_ performance · _file:_ `apps/web/src/app/api/admin/inventory/items/route.ts:14-15 and apps/web/src/app/api/admin/inventory/movements/route.ts:12-13`

```
const page = Number(sp.get('page')) || 1;
const pageSize = Number(sp.get('pageSize')) || 20;
```
**Impact.** Authenticated user can request ?pageSize=1000000 and pull the entire StockMovement table into memory, plus a count(*). Even at admin-only access this is a footgun for accidental dashboards.

**Fix.** Clamp via z.coerce.number().int().min(1).max(100) in paginate(), or Math.min(pageSize, 100) at the route level. lib/pagination should enforce the cap centrally.

### [P2] Low-stock filters in JS instead of SQL — fetches every active reorder-tracked item
_id:_ `low-stock-in-memory-filter` · _category:_ performance · _file:_ `apps/web/src/app/api/admin/inventory/low-stock/route.ts:10-16`

```
const items = await prisma.inventoryItem.findMany({ where: { isActive: true, reorderLevel: { not: null } }, include: { ... } });
const lowStock = items.filter((item) => Number(item.quantityInStock) <= Number(item.reorderLevel));
```
**Impact.** Linear scan + JS filter doesn't scale; as catalog grows the entire active product table is shipped over the wire to filter to (usually) a handful of rows.

**Fix.** Postgres can compare columns directly. Use $queryRaw: `SELECT ... FROM \"InventoryItem\" WHERE is_active AND reorder_level IS NOT NULL AND quantity_in_stock <= reorder_level`. Add a partial index: `CREATE INDEX ... ON "InventoryItem" (id) WHERE is_active AND quantity_in_stock <= reorder_level`. Prisma can't express column-to-column in `where` natively, so $queryRaw is the path.

### [P3] SKU uniqueness violation surfaces only as generic 409 — no friendly UI handling
_id:_ `sku-no-format-no-duplicate-handling-ux` · _category:_ ux · _file:_ `apps/web/src/app/admin/inventory/items/page.tsx:64-71`

```
const res = await api.post('/admin/inventory/items', body);
if (res.success) { setShowCreate(false); ... load(); }
```
**Impact.** On duplicate SKU (P2002 -> 409), modal stays open with no error message; user reclicks Submit. Same for create-failure paths in categories/suppliers pages.

**Fix.** Track error state per modal and render the server message. Disable submit button while in-flight (currently no `saving` guard on items create modal).

### [P2] Items create form has no disabled-while-submitting; double-submit can create duplicate SKUs from network retries
_id:_ `items-create-no-saving-guard` · _category:_ ux · _file:_ `apps/web/src/app/admin/inventory/items/page.tsx:64-71 and 166`

```
const onSubmit = async (e: React.FormEvent) => { ... const res = await api.post('/admin/inventory/items', body); if (res.success) { ... } };
<button type="submit" className="w-full rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700">Create</button>
```
**Impact.** User can click Create twice; first wins (SKU unique), second 409s silently because there is no error display. Categories/movements/low-stock pages OK; items create form is the gap.

**Fix.** Add a `creating` state, disable button + show 'Creating...'. Reuse the pattern from edit/stock modals.

### [P3] logActivity called without await — failures swallowed, audit row may be lost
_id:_ `logactivity-not-awaited` · _category:_ observability · _file:_ `apps/web/src/app/api/admin/inventory/items/route.ts:41, items/[id]/route.ts:28,42, stock/route.ts:43, categories/route.ts:22, categories/[id]/route.ts:14,23, suppliers/route.ts:25, suppliers/[id]/route.ts:18,27`

```
logActivity({ entityType: 'InventoryItem', entityId: item.id, action: 'inventory.item.created', newValue: item, actorType: 'ADMIN', actorId: user.sub });
return NextResponse.json({ success: true, data: item }, { status: 201 });
```
**Impact.** If logActivity is async and throws (DB hiccup, schema mismatch), the rejection becomes an unhandled promise rejection. Audit row is lost silently; in dev mode this kills the worker. Audit isn't transactional with the write either, so a failed write that succeeded partway through can still produce an audit row — though here the order is OK.

**Fix.** Either `await logActivity(...)` inside the same try, or document explicitly that it's fire-and-forget and have logActivity internally catch+console.error. Add a .catch(console.error) at minimum.

### [P2] Sentry directory is empty .gitkeep — no error reporting in production
_id:_ `sentry-not-initialized` · _category:_ observability · _file:_ `apps/web/src/lib/sentry/`

```
(directory is empty / .gitkeep only; handleApiError ends with `console.error('Unhandled API error:', error);` and returns generic 500)
```
**Impact.** Any uncaught exception in inventory flows (and the whole app) is visible only in server logs. No alerting, no breadcrumbs for the go-live morning.

**Fix.** Initialize Sentry (sentry.client.config.ts, sentry.server.config.ts, sentry.edge.config.ts) per @sentry/nextjs, and call Sentry.captureException in handleApiError's INTERNAL_ERROR branch.

### [P2] DELETE category and DELETE supplier have no in-use guard — rely on Prisma P2003 mapping
_id:_ `category-supplier-delete-no-fk-guard` · _category:_ ux · _file:_ `apps/web/src/app/api/admin/inventory/categories/[id]/route.ts:19-25 and suppliers/[id]/route.ts:23-29`

```
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = requirePermission(PERMISSIONS.INVENTORY_EDIT);
    await prisma.inventoryCategory.delete({ where: { id: params.id } });
    logActivity(...);
```
**Impact.** Deleting a category referenced by items throws P2003 → 400 'Invalid reference: referenced record does not exist' — confusing message (the deleted record IS the referenced one). Item DELETE has a clean guarded count (line 36); categories/suppliers do not. Suppliers FK is nullable so it actually still blocks (no onDelete: SetNull defined).

**Fix.** Mirror the items DELETE pattern: prisma.inventoryItem.count({ where: { categoryId: params.id } }) > 0 ⇒ 409 with `Cannot delete — category in use by N item(s)`. Same for suppliers. Optionally add onDelete: SetNull to Supplier relation in schema so suppliers detach cleanly.

### [P3] Stock adjustment quantity.positive() prevents 0 but allows arbitrary decimal precision
_id:_ `stock-zero-allowed-via-decimal` · _category:_ validation · _file:_ `apps/web/src/app/api/admin/inventory/items/[id]/stock/route.ts:9-13`

```
const schema = z.object({
  type: z.enum(['STOCK_IN', 'STOCK_OUT', 'ADJUSTMENT_INCREASE', 'ADJUSTMENT_DECREASE']),
  quantity: z.number().positive(),
  reason: z.string().optional(),
});
```
**Impact.** Schema column is Decimal(12,2). A request with quantity=0.005 will be silently rounded by Postgres to 0.01 or 0.00. previousQuantity/newQuantity bookkeeping is off by rounding.

**Fix.** z.number().positive().multipleOf(0.01) or step at API boundary; consistent with the Decimal(12,2) storage.

### [P3] items GET builds `where: Record<string, unknown>` — loses Prisma typing for filters
_id:_ `items-list-where-spread-untyped` · _category:_ type-safety · _file:_ `apps/web/src/app/api/admin/inventory/items/route.ts:19-21`

```
const where: Record<string, unknown> = {};
if (categoryId) where.categoryId = categoryId;
if (search) where.OR = [{ itemName: { contains: search, mode: 'insensitive' } }, { sku: { contains: search, mode: 'insensitive' } }];
```
**Impact.** Misspelled keys would silently widen the result set. Same untyped pattern in movements GET.

**Fix.** Type as `Prisma.InventoryItemWhereInput` / `Prisma.StockMovementWhereInput`.

### [P2] DELETE item ignores reservedQuantity — can wipe an item that has reserved stock pending a job card
_id:_ `delete-ignores-reserved-quantity` · _category:_ business-logic · _file:_ `apps/web/src/app/api/admin/inventory/items/[id]/route.ts:33-44`

```
const usedInJobCards = await prisma.jobCardPart.count({ where: { inventoryItemId: params.id } });
if (usedInJobCards > 0) { return ... 409 }
await prisma.stockMovement.deleteMany({ where: { inventoryItemId: params.id } });
await prisma.inventoryItem.delete({ where: { id: params.id } });
```
**Impact.** If a JobCardPart record was added then deleted (consumed parts removed mid-flow), the count check passes but reservedQuantity may still be > 0 from an in-progress workflow elsewhere — deleting the row leaves dangling state.

**Fix.** Add a guard: if (item.reservedQuantity > 0) return 409. Prefer soft-delete (isActive=false) for any item that has ever had movements.

### [P3] Row click opens edit modal; row is a <tr> via DataTable — but column action button uses stopPropagation which is correct, just confirm
_id:_ `div-onclick-no-role` · _category:_ ux · _file:_ `apps/web/src/app/admin/inventory/items/page.tsx:118 and 135`

```
{ key: 'actions', header: '', render: (r: any) => <button onClick={(e) => openStock(r, e)} className="text-xs text-blue-600 hover:underline">Adjust</button> },
...
<DataTable columns={columns} data={data} keyField="id" onRowClick={openEdit} />
```
**Impact.** Clicking Adjust without stopPropagation would also open Edit. openStock calls e.stopPropagation() so the button is fine, but the same Delete button in categories/suppliers pages relies on stopPropagation too — verify DataTable doesn't bubble independently. Low risk but worth confirming.

**Fix.** Confirm DataTable's onRowClick is suppressed by stopPropagation; add role='button' tabIndex for keyboard nav on the row, or expose explicit Edit buttons.

### [P3] No rate limiting on inventory mutating endpoints
_id:_ `no-rate-limit-mutations` · _category:_ security · _file:_ `apps/web/src/app/api/admin/inventory/**/route.ts`

```
All POST/PATCH/DELETE handlers call requirePermission() then proceed directly with no per-IP or per-user throttle.
```
**Impact.** Admin role is trusted, so risk is low, but a leaked token can rapidly drain or corrupt stock via the stock route in a loop.

**Fix.** Wrap mutating routes in a lightweight token-bucket (e.g. @upstash/ratelimit or in-memory per process) keyed by user.sub. Match whatever the rest of the app uses.

### [P3] Movements GET has no date-range filter — only movementType and item — hard to scope big audit views
_id:_ `createdat-filter-missing` · _category:_ ux · _file:_ `apps/web/src/app/api/admin/inventory/movements/route.ts:11-19`

```
const movementType = sp.get('movementType');
const inventoryItemId = sp.get('inventoryItemId');
if (movementType) where.movementType = movementType;
if (inventoryItemId) where.inventoryItemId = inventoryItemId;
```
**Impact.** Production stock-movement table grows fast. Without dateFrom/dateTo, the UI can only paginate through history.

**Fix.** Add `dateFrom`/`dateTo` filters parsed with z.coerce.date(). Add @@index([createdAt]) on StockMovement if range scans become common.

### [P2] Movements + low-stock pages do not render pagination — first 50 movements only
_id:_ `movements-page-no-pagination-ui` · _category:_ ux · _file:_ `apps/web/src/app/admin/inventory/movements/page.tsx`

```
useEffect(() => {
  const { cached, promise } = api.getSWR<any>('/admin/inventory/movements');
  ...
}, []);
```
**Impact.** API returns pageSize=50 by default with paginationMeta in the response, but the UI ignores meta entirely. Older movements are unreachable in the admin UI.

**Fix.** Add Pagination component (already used in items page); pass &page= to api.getSWR; honor res.meta.totalPages.

### [P3] Supplier delete will 400 if referenced (P2003) but UI shows generic 'Cannot delete' alert path is missing
_id:_ `supplier-delete-no-detach-items` · _category:_ ux · _file:_ `apps/web/src/app/admin/inventory/suppliers/page.tsx:45-50`

```
const remove = async (id: string, e: React.MouseEvent) => {
  e.stopPropagation();
  if (!confirm('Delete this supplier?')) return;
  const res = await api.delete<any>(`/admin/inventory/suppliers/${id}`);
  if (res.success) load();
};
```
**Impact.** When supplier is referenced and 400 returns, nothing happens visually — user assumes the click is broken.

**Fix.** On !res.success show res.error?.message via alert/toast (same pattern as items page delete).

### [P3] Items POST schema doesn't verify categoryId exists — relies on Prisma FK error mapping
_id:_ `items-page-categoryid-not-validated` · _category:_ validation · _file:_ `apps/web/src/app/api/admin/inventory/items/route.ts:34`

```
sku: z.string().min(1), itemName: z.string().min(1), categoryId: z.string(), supplierId: z.string().optional(),
```
**Impact.** categoryId='' passes z.string() (no min), Prisma then throws P2003 which maps to 400 'Invalid categoryId'. Functional but a min(1) would be tighter.

**Fix.** categoryId: z.string().min(1), supplierId: z.string().min(1).optional() (and .nullable() on PATCH).
