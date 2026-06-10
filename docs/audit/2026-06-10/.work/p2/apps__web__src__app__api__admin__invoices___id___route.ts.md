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

Target file: `apps/web/src/app/api/admin/invoices/[id]/route.ts`

## Findings (1)

### [P2] PATCH /invoices/[id] allows mutating notes/dueDate/discount on FINALIZED or PAID invoices
- id: `invoice-update-strict-but-no-finalized-guard` · category: business-logic
- location: `apps/web/src/app/api/admin/invoices/[id]/route.ts:24-33`
- evidence:
```
export async function PATCH(req, { params }) {
  const user = requirePermission(PERMISSIONS.INVOICES_CREATE);
  const body = updateSchema.parse(await req.json());
  const data: Record<string, unknown> = { ...body };
  if (body.dueDate) data.dueDate = new Date(body.dueDate);
  const invoice = await prisma.invoice.update({ where: { id: params.id }, data });
```
- impact: discountValue/discountType can be changed on a finalized invoice without recomputing grandTotal/amountDue/taxTotal. The fields are persisted but the totals are stale, so the PDF and balance shown to the customer disagree with what was actually finalized. notes/dueDate post-finalization may be acceptable, but discount fields are not.
- proposed fix: Either (a) reject discount-field changes when invoiceStatus !== 'DRAFT', or (b) re-run recalcTotals after any discount change. Best: split into two endpoints — metadata-only patch always allowed, discount patch only on DRAFT.