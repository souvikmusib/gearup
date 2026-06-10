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

Target file: `apps/web/src/app/api/public/service-requests/route.ts`

## Findings to fix in this file (1)

### 1. [P0 · BLOCKER] Service-request mutates existing customer's name/email on phone match (data-integrity / takeover-by-typo)
- _id_: `customer-overwrite-on-phone-collision` · _category_: data-integrity
- _location_: `apps/web/src/app/api/public/service-requests/route.ts:23-28`
- _evidence_:
```
let customer = await tx.customer.findFirst({ where: { phoneNumber } });
if (!customer) { customer = await tx.customer.create({...}) }
else { customer = await tx.customer.update({ where: { id: customer.id }, data: { fullName: body.fullName || customer.fullName, email: body.email || customer.email } }); }
```
- _impact_: Customer.phoneNumber has no unique constraint (schema.prisma:244 only @@index), so findFirst could pick an arbitrary one of multiple records. More importantly, anyone who types another customer's phone into the public booking form silently rewrites that customer's fullName and email in the DB, plus attaches a new vehicle/SR to their account. This is unauthenticated PII overwrite and lets a malicious actor pollute every record by walking phone numbers.
- _proposed fix_: Never update an existing customer from an unauthenticated form. If phone matches, attach the SR (with the submitted name/email captured ONLY on the ServiceRequest row), and let admin reconcile. Also add @@unique on Customer.phoneNumber (with explicit handling for legacy duplicates) and switch findFirst→findUnique.
- _verifier said_: real=True, Verified in apps/web/src/app/api/public/service-requests/route.ts line 27: an unauthenticated POST endpoint does findFirst({where:{phoneNumber}}) then unconditionally updates that customer's fullName and email with attacker-supplied values. Confirmed in schema.prisma that Customer.phoneNumber has only @@index (line 244), no @@unique, so findFirst can hit any matching row. Anyone who guesses/types another user's phone in the public booking form silently overwrites that user's PII and attaches new vehicles/SRs to their account — a clear unauthenticated data-integrity / account-pollution vector. Body validation requires fullName (min 1), so the overwrite always fires with attacker input. Genuine go-live blocker.