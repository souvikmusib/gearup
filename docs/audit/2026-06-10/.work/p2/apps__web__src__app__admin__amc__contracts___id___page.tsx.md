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

Target file: `apps/web/src/app/admin/amc/contracts/[id]/page.tsx`

## Findings (1)

### [P2] Cancelling AMC contract doesn't refund services or check state
- id: `amc-cancel-no-status-check` · category: business-logic
- location: `apps/web/src/app/admin/amc/contracts/[id]/page.tsx:32-36, /api/admin/amc/contracts/[id]/route.ts:24-33`
- evidence:
```
const handleCancel = async () => { if (!confirm('Cancel this contract?')) return; await api.patch(`/admin/amc/contracts/${id}`, { status: 'CANCELLED' }); load(); };
```
- impact: Cancel can be called on already-CANCELLED contract, or on EXPIRED, with no refund/credit logic and no audit log. servicesRemaining stays nonzero on a CANCELLED contract — confusing for reporting.
- proposed fix: Server-side: reject transition if current status != ACTIVE; optionally zero servicesRemaining on cancel; log activity with previousValue.