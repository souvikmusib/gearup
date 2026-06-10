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

Target file: `apps/web/src/app/api/admin/vehicles/[id]/route.ts`

## Findings (1)

### [P2] Vehicle [id] GET issues a heavyweight nested include
- id: `customer-detail-include-explosion` · category: performance
- location: `apps/web/src/app/api/admin/vehicles/[id]/route.ts:12`
- evidence:
```
include: { customer: true, serviceRequests: { take: 10 }, jobCards: { take: 20, include: { parts: { include: { inventoryItem: { select: { itemName: true } } } }, assignments: { include: { worker: { select: { fullName: true } } } }, invoices: {...} } }, invoices: { take: 10, ... } }
```
- impact: 4-deep relational pull on every vehicle page open. For a busy shop's flagship vehicle (20 job cards × 10 parts each + invoices) this is dozens of joins; not catastrophic at current scale but will degrade fast post-launch.
- proposed fix: Split into separate endpoints (jobCards lazy-loaded as a tab), or use `select` instead of `include` to narrow fields.