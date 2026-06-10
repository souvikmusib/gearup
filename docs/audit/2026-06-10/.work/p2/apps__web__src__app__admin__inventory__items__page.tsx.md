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

Target file: `apps/web/src/app/admin/inventory/items/page.tsx`

## Findings (1)

### [P2] Items create form has no disabled-while-submitting; double-submit can create duplicate SKUs from network retries
- id: `items-create-no-saving-guard` · category: ux
- location: `apps/web/src/app/admin/inventory/items/page.tsx:64-71 and 166`
- evidence:
```
const onSubmit = async (e: React.FormEvent) => { ... const res = await api.post('/admin/inventory/items', body); if (res.success) { ... } };
<button type="submit" className="w-full rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700">Create</button>
```
- impact: User can click Create twice; first wins (SKU unique), second 409s silently because there is no error display. Categories/movements/low-stock pages OK; items create form is the gap.
- proposed fix: Add a `creating` state, disable button + show 'Creating...'. Reuse the pattern from edit/stock modals.