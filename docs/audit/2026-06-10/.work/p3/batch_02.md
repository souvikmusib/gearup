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


## Target: `apps/web/src/app/admin/inventory/items/page.tsx` (2 findings)

### [P3] SKU uniqueness violation surfaces only as generic 409 — no friendly UI handling
- id: `sku-no-format-no-duplicate-handling-ux` · cat: ux
- loc: `apps/web/src/app/admin/inventory/items/page.tsx:64-71`
- evidence:
```
const res = await api.post('/admin/inventory/items', body);
if (res.success) { setShowCreate(false); ... load(); }
```
- impact: On duplicate SKU (P2002 -> 409), modal stays open with no error message; user reclicks Submit. Same for create-failure paths in categories/suppliers pages.
- fix: Track error state per modal and render the server message. Disable submit button while in-flight (currently no `saving` guard on items create modal).

### [P3] Row click opens edit modal; row is a <tr> via DataTable — but column action button uses stopPropagation which is correct, just confirm
- id: `div-onclick-no-role` · cat: ux
- loc: `apps/web/src/app/admin/inventory/items/page.tsx:118 and 135`
- evidence:
```
{ key: 'actions', header: '', render: (r: any) => <button onClick={(e) => openStock(r, e)} className="text-xs text-blue-600 hover:underline">Adjust</button> },
...
<DataTable columns={columns} data={data} keyField="id" onRowClick={openEdit} />
```
- impact: Clicking Adjust without stopPropagation would also open Edit. openStock calls e.stopPropagation() so the button is fine, but the same Delete button in categories/suppliers pages relies on stopPropagation too — verify DataTable doesn't bubble independently. Low risk but worth confirming.
- fix: Confirm DataTable's onRowClick is suppressed by stopPropagation; add role='button' tabIndex for keyboard nav on the row, or expose explicit Edit buttons.

---

## Target: `apps/web/src/app/admin/inventory/suppliers/page.tsx` (1 findings)

### [P3] Supplier delete will 400 if referenced (P2003) but UI shows generic 'Cannot delete' alert path is missing
- id: `supplier-delete-no-detach-items` · cat: ux
- loc: `apps/web/src/app/admin/inventory/suppliers/page.tsx:45-50`
- evidence:
```
const remove = async (id: string, e: React.MouseEvent) => {
  e.stopPropagation();
  if (!confirm('Delete this supplier?')) return;
  const res = await api.delete<any>(`/admin/inventory/suppliers/${id}`);
  if (res.success) load();
};
```
- impact: When supplier is referenced and 400 returns, nothing happens visually — user assumes the click is broken.
- fix: On !res.success show res.error?.message via alert/toast (same pattern as items page delete).

---

## Target: `apps/web/src/app/admin/invoices/[id]/page.tsx` (1 findings)

### [P3] UI optimistic add/remove line doesn't lock the form against concurrent edits
- id: `ui-add-line-no-await-block` · cat: ux
- loc: `apps/web/src/app/admin/invoices/[id]/page.tsx:157-176,196-201`
- evidence:
```
const addLine = async () => {
  ... setData((d) => ({ ...d, lineItems: [...lineItems, optimistic] }));
  ... const res = await api.post(...);
  if (res.success) { fetch(); }
  else { fetch(); alert(res.error?.message || 'Failed to add line item'); }
};
// removeLine: optimistic remove with NO rollback if API fails
```
- impact: `removeLine` removes the row from the table, then awaits DELETE. If DELETE fails (e.g. finalized invoice), the line is silently restored only because of the trailing `fetch()` — but there's no error feedback. User thinks they removed it.
- fix: Check res.success after delete and alert/restore. Disable the row buttons while the request is in-flight.

---

## Target: `apps/web/src/app/admin/invoices/page.tsx` (1 findings)

### [P3] Invoices list page has overlapping +New Invoice and +Counter Sale buttons inside the same flex
- id: `counter-sale-button-overlap` · cat: ux
- loc: `apps/web/src/app/admin/invoices/page.tsx:153-157`
- evidence:
```
<div className="flex items-center justify-between mb-4">
  <PageHeader title="Invoices" />
  <button onClick={openCreate} className="... bg-blue-600 ...">+ New Invoice</button>
  <button onClick={openCounterSale} className="... border-blue-600 ...">+ Counter Sale</button>
</div>
```
- impact: With `justify-between` on a 3-child flex, the two buttons sit at the right with no gap. Cosmetic but visible on go-live.
- fix: Wrap the two buttons in a `<div className="flex gap-2">` so they share the right slot.

---

## Target: `apps/web/src/app/admin/job-cards/[id]/page.tsx` (1 findings)

### [P3] Several mutating buttons (assign worker, add task, update part qty, save notes) don't disable while in-flight
- id: `jobcard-detail-no-disable-on-save` · cat: ux
- loc: `apps/web/src/app/admin/job-cards/[id]/page.tsx:152-174`
- evidence:
```
const assignWorker = async () => { if (!workerForm.workerId) return; const res = await api.post(...); if (res.success) { ... } };
const addTask = async () => { if (!taskForm.taskName) return; const res = await api.post(...); if (res.success) { ... } };
```
- impact: Double-click creates duplicate tasks / duplicate assignments / racing onBlur calls when typing fast in parts qty (each updatePart issues a PATCH+reload).
- fix: Add per-action saving state and disable the button. Coalesce onBlur PATCHes (only PATCH if the value actually changed, mirror the pattern used in details section).