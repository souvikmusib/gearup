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

Target file: `apps/web/src/app/api/public/estimate/[token]/route.ts`

## Findings to fix in this file (2)

### 1. [P0 · BLOCKER] Public estimate 'token' is the JobCard primary key — not a token
- _id_: `estimate-token-is-jobcard-pk` · _category_: auth
- _location_: `apps/web/src/app/api/public/estimate/[token]/route.ts:44-50, 62-63`
- _evidence_:
```
const jobCard = await prisma.jobCard.findUnique({ where: { id: params.token }, include: { customer: { select: { fullName: true } }, vehicle: { select: { registrationNumber: true, brand: true, model: true } } } });
```
- _impact_: Anyone who guesses or learns a JobCard cuid (URL sharing, server logs, analytics, browser history, support tickets) can read the customer's full name, vehicle registration number, issue summary, internal notes, and approve or reject the estimate on their behalf. There is no scoping phone/OTP, no expiry, no single-use nonce. cuid is not designed to be a secret; collisions with internal admin tools that surface job-card IDs (job-card listings, audit logs) leak directly into public-readable estimates. Approval action is irreversible business state.
- _proposed fix_: Add a dedicated JobCard.estimateToken (32-byte random base64url) column with optional expiresAt, generated on the same write that sets approvalStatus=PENDING. Public route looks up by token (not id), checks expiry, and the token field is never returned by any admin endpoint. Optionally require last 4 digits of phone as a soft second factor before showing money.
- _verifier said_: real=True, Verified at apps/web/src/app/api/public/estimate/[token]/route.ts lines 44-50 and 62-63: both GET and POST use prisma.jobCard.findUnique({ where: { id: params.token } }) — params.token IS the JobCard primary key (cuid), not a dedicated secret token. No phone/OTP scoping, no expiresAt, no single-use nonce. Anyone with a JobCard id (leaked via URL shares, server logs, support tickets, or any admin endpoint that returns job-card ids) can read customer PII (full name, vehicle reg, issue summary, internal notes) and irreversibly approve/reject the estimate on the customer's behalf. cuids are not cryptographic secrets. The PENDING-status guard in the transaction only prevents re-approval after a first unauthorized approval — it does not prevent the initial attack. P0 / go-live blocker confirmed.

### 2. [P1] Estimate approval doesn't pin the prices the customer saw
- _id_: `estimate-no-version-check-on-prices` · _category_: business-logic
- _location_: `apps/web/src/app/api/public/estimate/[token]/route.ts:82-89`
- _evidence_:
```
const result = await tx.jobCard.updateMany({ where: { id: params.token, approvalStatus: 'PENDING' }, data: { approvalStatus, status, customerVisibleNotes } });
```
- _impact_: An admin can edit estimatedPartsCost/estimatedLaborCost between the time the customer opened the page and the time they clicked Approve. The customer is then bound to a price they never saw. There is also no snapshot of the estimate stored on approval, so audit cannot reconstruct what was approved.
- _proposed fix_: Have the GET return an estimateRevision (hash of {partsCost, laborCost, total, notes}); POST must include it; updateMany's where clause must include that revision. On approval, snapshot the numeric values into a JobCardEstimateApproval row.