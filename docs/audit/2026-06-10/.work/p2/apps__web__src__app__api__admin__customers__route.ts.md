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

Target file: `apps/web/src/app/api/admin/customers/route.ts`

## Findings (1)

### [P2] All Prisma writes use `data: body as any` — mass-assignment / type-safety hole
- id: `mass-assignment-as-any` · category: type-safety
- location: `apps/web/src/app/api/admin/customers/route.ts:38, /customers/[id]/route.ts:29, /vehicles/route.ts:42, /vehicles/[id]/route.ts:21, /amc/plans/route.ts:35, /amc/plans/[id]/route.ts:33, /amc/contracts/[id]/route.ts:31`
- evidence:
```
const customer = await prisma.customer.create({ data: body as any });
...
const vehicle = await prisma.vehicle.update({ where: { id: params.id }, data: body as any });
```
- impact: If Zod schema drifts (new field added) and forgotten in cast, Prisma silently accepts unintended fields. Also kills compile-time safety against schema changes — go-live regressions go undetected.
- proposed fix: Remove `as any`; let Prisma typecheck. If Zod->Prisma types mismatch (e.g. dates), normalize explicitly in a typed object passed to Prisma.