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

Target file: `apps/web/src/app/admin/expenses/page.tsx`

## Findings (2)

### [P2] Expenses search input fires API on every keystroke (no debounce, no cancel)
- id: `expenses-ui-search-no-debounce` · category: performance
- location: `apps/web/src/app/admin/expenses/page.tsx:110`
- evidence:
```
<input ... onChange={(e) => { setSearch(e.target.value); load(e.target.value, catFilter); }} />
```
- impact: 8 char query → 8 round-trips + 8 ILIKE table-scans; UI race when older response arrives last.
- proposed fix: Debounce ~250-300ms; AbortController in api.get to cancel in-flight.

### [P2] Expense edit modal: no validation, no error surface; empty amount saves ₹0
- id: `expenses-ui-edit-no-validation-no-error` · category: ux
- location: `apps/web/src/app/admin/expenses/page.tsx:89`
- evidence:
```
const res = await api.patch(`/admin/expenses/${editItem.id}`, { ...editForm, amount: Number(editForm.amount) });
if (res.success) { setEditItem(null); load(); }  // no else branch
```
- impact: Failure leaves modal open silently; empty amount becomes 0 which PATCH currently accepts.
- proposed fix: Mirror create-modal error state; guard Number(amount) > 0; toast on failure.