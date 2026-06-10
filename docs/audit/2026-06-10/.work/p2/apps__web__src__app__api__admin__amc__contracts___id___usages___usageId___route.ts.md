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

Target file: `apps/web/src/app/api/admin/amc/contracts/[id]/usages/[usageId]/route.ts`

## Findings (1)

### [P2] Usage DELETE increments servicesRemaining without status check (overflow risk)
- id: `amc-usage-delete-no-status-guard` · category: data-integrity
- location: `apps/web/src/app/api/admin/amc/contracts/[id]/usages/[usageId]/route.ts:10-16`
- evidence:
```
await tx.amcServiceUsage.delete({ where: { id: params.usageId } });
await tx.amcContract.update({ where: { id: params.id }, data: { servicesUsed: { decrement: 1 }, servicesRemaining: { increment: 1 } } });
```
- impact: No verification that usageId actually belongs to contract id (path param). Operator could delete arbitrary usage row but credit the wrong contract. Also no check that contract is ACTIVE (refund onto CANCELLED contract). servicesRemaining can exceed totalServices.
- proposed fix: In tx, `findUniqueOrThrow({ where:{ id: usageId, amcContractId: params.id } })` first. Use `updateMany` with WHERE-guard `servicesUsed: { gt: 0 }` and cap servicesRemaining at totalServices.