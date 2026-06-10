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

Target file: `apps/web/src/app/admin/workers/calendar/page.tsx`

## Findings (1)

### [P2] /admin/workers/calendar groups by `assignedWorkerId` which may not exist on Appointment
- id: `worker-calendar-uses-wrong-field` · category: business-logic
- location: `apps/web/src/app/admin/workers/calendar/page.tsx:32-37`
- evidence:
```
const byWorker = useMemo(() => {
  return appointments.reduce<Record<string, any[]>>((acc, appointment) => {
    if (!appointment.assignedWorkerId) return acc;
    acc[appointment.assignedWorkerId] = [...(acc[appointment.assignedWorkerId] ?? []), appointment];
    return acc;
  }, {});
}, [appointments]);
```
- impact: The other calendar page reads `appointment.worker?.fullName` and `appointment.workerId` is not referenced anywhere else in this audit scope. If the field is actually `workerId` (singular), every appointment is dropped (`!appointment.assignedWorkerId` is always true), and every worker card shows "No assigned appointments." Needs schema cross-check.
- proposed fix: Verify against `prisma/schema.prisma` whether the column is `assignedWorkerId` or `workerId`. Fix the reducer to use the canonical field. Add a runtime guard / test.