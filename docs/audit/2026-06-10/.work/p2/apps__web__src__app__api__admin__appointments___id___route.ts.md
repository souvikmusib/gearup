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

Target file: `apps/web/src/app/api/admin/appointments/[id]/route.ts`

## Findings (2)

### [P2] PATCH /appointments/[id] status is z.string() — any string accepted
- id: `appointment-patch-status-no-enum` · category: validation
- location: `apps/web/src/app/api/admin/appointments/[id]/route.ts:20`
- evidence:
```
const body = z.object({ status: z.string().optional(), appointmentDate: z.string().optional(), slotStart: z.string().optional(), slotEnd: z.string().optional(), rescheduleReason: z.string().optional(), cancellationReason: z.string().optional(), assignedWorkerId: z.string().optional() }).parse(await req.json());
```
- impact: Invalid status strings yield 500 via Prisma rather than 400. No transition rules — a CANCELLED appointment can be moved back to CONFIRMED bypassing audit.
- proposed fix: z.nativeEnum(AppointmentStatus). Add a transition map and reject illegal jumps. Also accept assignedWorkerId: z.string().nullable() so the UI's `null` unassign value works.

### [P2] PATCH /appointments/[id] allows CANCELLED without cancellationReason and RESCHEDULED without new slot
- id: `appointment-patch-cancel-no-reason-required` · category: validation
- location: `apps/web/src/app/api/admin/appointments/[id]/route.ts:20-26`
- evidence:
```
const body = z.object({ status: z.string().optional(), ..., cancellationReason: z.string().optional() }).parse(...);
const appt = await prisma.appointment.update({ where: { id: params.id }, data });
```
- impact: Customer can be marked CANCELLED with no reason captured for the audit log/CRM. RESCHEDULED with no slot change is allowed.
- proposed fix: z.refine: if status==='CANCELLED' require cancellationReason; if status==='RESCHEDULED' require slotStart+slotEnd+rescheduleReason.