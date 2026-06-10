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

Target file: `apps/web/src/app/api/admin/service-requests/route.ts`

## Findings (1)

### [P2] GET /api/admin/service-requests accepts arbitrary status string
- id: `service-requests-search-no-status-enum` · category: validation
- location: `apps/web/src/app/api/admin/service-requests/route.ts:16-21`
- evidence:
```
const status = sp.get('status') || '';
const search = sp.get('search') || '';
...
if (status) where.status = status;
if (search) where.OR = [{ referenceId: { contains: search, mode: 'insensitive' } }, { customer: { fullName: { contains: search, mode: 'insensitive' } } }];
```
- impact: Unknown status string sent to Prisma enum column → Prisma throws → 500 to client. The UI passes 'APPOINTMENT_SCHEDULED' which is NOT in the ServiceRequestStatus enum (enum has APPOINTMENT_CONFIRMED) — selecting that filter returns 500. Search has no length cap; long strings with %_ wildcards may still hit Postgres ILIKE plan changes on the customer join. Search also reaches into the customer relation without an index on fullName.
- proposed fix: Validate with z.nativeEnum(ServiceRequestStatus). Fix UI STATUSES array to match the schema enum (APPOINTMENT_CONFIRMED, IN_PROGRESS isn't in the enum either — purge invalid values). Cap search to 64 chars and escape % / _ before passing to contains (Prisma does escape but document it).