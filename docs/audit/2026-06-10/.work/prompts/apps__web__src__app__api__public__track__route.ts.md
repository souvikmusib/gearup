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

Target file: `apps/web/src/app/api/public/track/route.ts`

## Findings to fix in this file (1)

### 1. [P0 · BLOCKER] Track endpoint is an unthrottled phone + vehicle enumeration oracle
- _id_: `track-enumeration-oracle` · _category_: security
- _location_: `apps/web/src/app/api/public/track/route.ts:79-111`
- _evidence_:
```
const sr = await prisma.serviceRequest.findFirst({ where: { referenceId: referenceId.trim().toUpperCase(), customer: { phoneNumber: phone } }, select: requestSelect }); if (!sr) throw new NotFoundError('No matching request found.');
```
- _impact_: With only a phone number + 8-char alphanumeric ref, an attacker can enumerate which phones are customers and (via vehicle search) which vehicles belong to which phone. NotFoundError vs success cleanly distinguishes hits. Middleware rate-limit is 30/min per spoofable x-forwarded-for and in-memory (resets every cold start on Vercel). The response then leaks customer.fullName, vehicle, invoice amounts, etc.
- _proposed fix_: (1) Replace the in-memory limiter with a Redis/Upstash sliding window scoped to (phone, ip) and return identical timing/response shape for hit vs miss. (2) Require both referenceId AND phone to match — already the case for reference mode but vehicle mode returns ALL of a phone's requests if the vehicle substring matches, which is over-broad. (3) Consider HMAC-signed deep links emailed/WhatsApp'd to the customer instead of self-service lookup.
- _verifier said_: real=True, Verified at apps/web/src/app/api/public/track/route.ts and src/middleware.ts. The endpoint accepts {phoneNumber, referenceId|vehicleNumber} with no OTP/auth, returns NotFoundError on miss vs full payload (customer.fullName, vehicle reg, invoice grandTotal/amountDue) on hit — a clean enumeration oracle. The only guard is an in-memory Map rate limiter (30/min) keyed on the spoofable x-forwarded-for header that resets on every serverless cold start, so it is effectively bypassable at scale. Vehicle mode is even broader: it fetches ALL serviceRequests for the phone then filters in JS, confirming phone ownership even when the vehicle substring is wrong-but-empty-match. P0 go-live blocker is appropriate; proposed fixes (durable per-(phone,ip) limiter, uniform response shape/timing, or HMAC deep links) are sound.