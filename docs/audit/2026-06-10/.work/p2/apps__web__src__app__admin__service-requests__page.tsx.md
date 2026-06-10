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

Target file: `apps/web/src/app/admin/service-requests/page.tsx`

## Findings (1)

### [P2] Service requests list filter offers statuses that don't exist in the Prisma enum
- id: `service-requests-ui-stale-statuses` · category: consistency
- location: `apps/web/src/app/admin/service-requests/page.tsx:10`
- evidence:
```
const STATUSES = ['SUBMITTED','UNDER_REVIEW','APPOINTMENT_PENDING','APPOINTMENT_SCHEDULED','IN_PROGRESS','COMPLETED','CANCELLED'].map(s => ({ label: s.replace(/_/g, ' '), value: s }));
```
- impact: User filters by 'APPOINTMENT_SCHEDULED', 'IN_PROGRESS', 'COMPLETED' → backend either returns empty list or 500 (depending on enum validation). Looks broken on day one of go-live.
- proposed fix: Source list from the Prisma enum / @gearup/types: SUBMITTED, UNDER_REVIEW, APPOINTMENT_PENDING, APPOINTMENT_CONFIRMED, CONVERTED_TO_JOB, CANCELLED, CLOSED.