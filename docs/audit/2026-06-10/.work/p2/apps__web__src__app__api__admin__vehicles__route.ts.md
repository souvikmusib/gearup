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

Target file: `apps/web/src/app/api/admin/vehicles/route.ts`

## Findings (1)

### [P2] Vehicle POST does not check the customerId exists / belongs to tenant
- id: `vehicle-customerid-no-ownership` · category: validation
- location: `apps/web/src/app/api/admin/vehicles/route.ts:10-15,38-45`
- evidence:
```
const vehicleSchema = z.object({ customerId: z.string(), ... });
...
const vehicle = await prisma.vehicle.create({ data: body as any });
```
- impact: Missing `.min(1)` lets empty customerId through (Prisma will error with FK P2003 → handled), but more importantly there's no tenant-scoping (system seems single-tenant so OK). However, vehicleType enum allows 'CAR' but AmcPlan vehicleType allows 'CAR/BIKE/SCOOTY/OTHER' — schema mismatch means a CAR vehicle has no matching AMC plan available.
- proposed fix: `customerId: z.string().min(1)`; align vehicleType enums in schema.prisma between Vehicle and AmcPlan (Vehicle is missing SCOOTY). Confirm whether 'SCOOTY' or 'BIKE' is canonical.