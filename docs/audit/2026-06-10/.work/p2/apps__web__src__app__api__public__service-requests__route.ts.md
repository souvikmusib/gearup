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

Target file: `apps/web/src/app/api/public/service-requests/route.ts`

## Findings (2)

### [P2] email zod chain accepts empty strings as 'undefined' but invalid emails still bypass via .optional after .pipe
- id: `service-request-email-validation-quirk` · category: validation
- location: `apps/web/src/app/api/public/service-requests/route.ts:10`
- evidence:
```
email: z.string().optional().transform(v => v?.trim() || undefined).pipe(z.string().email().optional()),
```
- impact: The trailing .optional() inside .pipe means the inner schema treats undefined as valid, so the intended 'empty→undefined' works. But if v is whitespace-only after trim it becomes undefined which is intended. Bigger issue: vehicleId is accepted as any string with no z.cuid() check; passing another customer's vehicleId would fall back to findFirst({where:{id, customerId: customer.id}})→null which is then re-resolved by registrationNumber+customerId, so safe. Still flag the loose typing.
- proposed fix: Tighten: vehicleId: z.string().cuid().optional(); phoneNumber: z.string().regex(/^\d{10}$/) (post-strip); registrationNumber: z.string().regex(/^[A-Z0-9-]{6,15}$/); add max() bounds on every string (e.g. issueDescription max 2000).

### [P2] No request body size limit on public POSTs (issueDescription/notes unbounded)
- id: `no-request-body-size-limit` · category: security
- location: `apps/web/src/app/api/public/service-requests/route.ts:8-15, 17-19`
- evidence:
```
const schema = z.object({ ... issueDescription: z.string().min(1), ... notes: z.string().optional(), });
...
const body = schema.parse(await req.json());
```
- impact: Zod has no .max() on issueDescription, notes, fullName, brand, model. Next.js default body limit (1 MB) is the only guardrail. Attacker can persist megabytes of garbage per request — cheap to write, expensive to index, blow up activity_log JSON.
- proposed fix: Add explicit .max(2000) on long text, .max(100) on names; consider runtime export const maxDuration = 10 and an explicit content-length check in middleware (reject > 32 KB on public POSTs).