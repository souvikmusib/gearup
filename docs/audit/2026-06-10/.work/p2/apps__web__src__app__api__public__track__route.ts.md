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

Target file: `apps/web/src/app/api/public/track/route.ts`

## Findings (1)

### [P2] Track vehicle mode fetches ALL service requests for a phone before filtering
- id: `track-vehicle-mode-overbroad-query` · category: performance
- location: `apps/web/src/app/api/public/track/route.ts:92-101`
- evidence:
```
const requests = await prisma.serviceRequest.findMany({ where: { customer: { phoneNumber: phone } }, orderBy: { createdAt: 'desc' }, select: requestSelect });
const needle = normalizeVehicle(vehicle);
const matches = requests.filter((sr: any) => normalizeVehicle(sr.vehicle.registrationNumber).includes(needle)).slice(0, 12);
```
- impact: For a power customer (or after enumeration pollution) this materializes the entire SR history with deeply nested includes (jobCards→invoices) in memory, then JS-filters. N+1-ish (each include is a join but the .filter() happens in Node). Also leaks all SRs to anyone with the phone before filter, just not over the wire — DB still does the work.
- proposed fix: Push the vehicle filter into the where clause: where: { customer: { phoneNumber: phone }, vehicle: { registrationNumber: { contains: needle, mode: 'insensitive' } } }, take: 12. Then no filter step.