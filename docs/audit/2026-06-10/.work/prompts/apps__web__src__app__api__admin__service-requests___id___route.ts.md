You are a senior Next.js / Prisma / TypeScript engineer applying audit fixes to the gearup codebase. GO-LIVE TOMORROW. Fixes must be surgical, correct, no regressions.

Repo root: /Users/sagnikmitra/Desktop/GitHub/gearup

## Context
- Next.js 14 App Router, Prisma 5 + Postgres, JWT auth.
- All admin routes use `requirePermission(req, PERMISSIONS.X)` from `apps/web/src/lib/auth.ts`. Permissions enum at `packages/types/src/auth.ts`.
- DB: `import { prisma } from '@/lib/prisma'`. Multi-table writes MUST use `prisma.$transaction(async (tx) => ...)`.
- Errors: `handleApiError(err)` in `apps/web/src/lib/errors.ts`. Throw `new AppError(code, msg, status)`.
- Activity log: `logActivity({adminUserId, action, entityType, entityId, metadata})` from `apps/web/src/lib/activity-logger.ts`.
- Gold pattern for race-free stock: `apps/web/src/app/api/admin/inventory/items/[id]/stock/route.ts` uses tx + `updateMany` with `gte` guard.

## Rules
1. **Read the file first** before editing.
2. **Apply EVERY finding** listed below. None are optional.
3. **Preserve unrelated code.** Don't reformat or refactor outside scope.
4. **Race-fixes**: use `prisma.$transaction` + conditional `updateMany({where:{...guard},data:...})` then assert `result.count === 1`, else throw `new AppError('CONFLICT', '...', 409)`.
5. **Permission fixes**: if a new PERMISSIONS.X is needed, the shared-infra agent has added/will add it to `packages/types/src/auth.ts`. Just import + use.
6. **Mass-assignment**: replace `data: body as any` with explicit field picks.
7. **No backward-compat shims** — fix it right.
8. **Imports**: add what you need; don't remove ones still used.
9. **Schema changes**: if a Zod schema changes, ensure all callers match.
10. **Don't run build** — coordinator does that.

## Verify after edit
Re-Read the file. Confirm syntax. Mention any cascading changes needed.

Return JSON only: {"file": "...", "applied": ["id1","id2"], "skipped": [{"id":"","reason":""}], "cascading_changes": ["path: note"], "notes": "2-5 sentences"}.

Target file: `apps/web/src/app/api/admin/service-requests/[id]/route.ts`

## Findings to fix in this file (1)

### 1. [P0 · BLOCKER] Service-request status PATCH accepts any string and has no state-machine guard
- _id_: `service-request-patch-status-no-enum` · _category_: business-logic
- _location_: `apps/web/src/app/api/admin/service-requests/[id]/route.ts:17-26`
- _evidence_:
```
const body = z.object({ status: z.string().optional(), notes: z.string().optional(), urgency: z.string().optional() }).parse(await req.json());
const data: Record<string, unknown> = { ...body };
if (body.status && ['CANCELLED', 'CLOSED'].includes(body.status)) data.closedAt = new Date();
const sr = await prisma.serviceRequest.update({ where: { id: params.id }, data });
```
- _impact_: An admin (or anyone forging a request) can jump SUBMITTED→CLOSED, CONVERTED_TO_JOB→SUBMITTED, or set status='FOO' which Postgres will reject only because of the enum cast (Prisma throws a generic 500). UI's STATUS_ACTIONS map encodes the legal transitions but it is entirely client-side — the server trusts the client. Reopens, double-conversions, and bypass of the job-card creation flow are all possible.
- _proposed fix_: Use z.enum([...ServiceRequestStatus values]). Add a server-side ALLOWED_TRANSITIONS map mirroring STATUS_ACTIONS and reject illegal transitions with ValidationError. Set closedAt for all terminal states (CLOSED, CANCELLED), and clear it if transitioning back. Log previousValue.
- _verifier said_: real=True, Confirmed at apps/web/src/app/api/admin/service-requests/[id]/route.ts:17-26. The Zod schema accepts `status: z.string().optional()` and the handler passes it straight to `prisma.serviceRequest.update` with no enum check and no state-machine guard; closedAt is only set for CANCELLED/CLOSED and never cleared on reopen. Auth is enforced via requirePermission(SERVICE_REQUESTS_EDIT), so this isn't an unauth bypass — it's an admin/permission-holder who can drive illegal transitions (reopen closed, skip CONVERTED_TO_JOB, etc.), bypassing the job-card flow. Real business-logic bug worth fixing, but since it requires an authenticated admin and the DB enum cast still rejects garbage strings, downgrading from P0 go-live blocker to P1.