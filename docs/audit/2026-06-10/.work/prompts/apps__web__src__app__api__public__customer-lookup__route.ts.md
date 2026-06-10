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

Target file: `apps/web/src/app/api/public/customer-lookup/route.ts`

## Findings to fix in this file (1)

### 1. [P1 · BLOCKER] customer-lookup leaks fullName/email/all vehicles given only a phone number
- _id_: `customer-lookup-unauthenticated-pii` · _category_: security
- _location_: `apps/web/src/app/api/public/customer-lookup/route.ts:5-26`
- _evidence_:
```
const customer = await prisma.customer.findFirst({ where: { phoneNumber: phone }, select: { id: true, fullName: true, phoneNumber: true, email: true, vehicles: { ... select: { id, registrationNumber, vehicleType, brand, model, variant } } } });
```
- _impact_: GET endpoint with no auth, no rate limit (middleware only rate-limits POST), returns full PII + every vehicle registration tied to any phone number. Trivially scriptable to dump the entire customer base (10-digit Indian mobile space = 10^10, but real numbers are clustered and this still yields targeted enumeration). Vehicle registration is sensitive (linked to RC).
- _proposed fix_: (1) Require a same-session signed challenge from book-service (e.g. CAPTCHA-derived nonce). (2) Add POST-style rate limit to GET. (3) Return only a coarse 'we have records for this phone — continue?' boolean and hydrate the rest after the booking is created. (4) Don't return vehicle.id; use registrationNumber as the picker key.
- _verifier said_: real=True, Confirmed at apps/web/src/app/api/public/customer-lookup/route.ts:5-28: GET handler accepts a phone query param with no auth/CAPTCHA/nonce and returns fullName, email, phoneNumber, plus every vehicle's registrationNumber, brand, model, variant. Middleware at apps/web/src/middleware.ts:43 only applies the 30/min rate limit to POST requests under /api/public/, so GET is completely unthrottled. This is enumerable PII + vehicle-registration leakage from a public endpoint — go-live blocker.