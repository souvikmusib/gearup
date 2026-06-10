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

Target file: `apps/web/src/app/api/admin/appointments/route.ts`

## Findings (1)

### [P2] slotEnd is not validated to be after slotStart
- id: `appointment-no-validation-end-after-start` · category: validation
- location: `apps/web/src/app/api/admin/appointments/route.ts:11-15`
- evidence:
```
const createSchema = z.object({
  ..., appointmentDate: z.string(), slotStart: z.string(), slotEnd: z.string(), ...
});
```
- impact: A bad client can send slotEnd < slotStart; downstream calendar queries and worker capacity reports will compute negative durations. UI always sends +30min but admin can craft requests.
- proposed fix: z.refine ensuring new Date(slotEnd) > new Date(slotStart) and both >= now-tolerance. Same on PATCH.