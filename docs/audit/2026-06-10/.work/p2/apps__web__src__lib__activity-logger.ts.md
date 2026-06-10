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

Target file: `apps/web/src/lib/activity-logger.ts`

## Findings (4)

### [P2] logActivity is fire-and-forget with bare .catch — failures invisible
- id: `activitylog-floating-promise` · category: observability
- location: `apps/web/src/lib/activity-logger.ts:18-33`
- evidence:
```
export function logActivity(params: LogActivityParams) {
  prisma.activityLog.create({ data: { ... } }).catch((e) => console.error('Activity log failed:', e.message));
}
```
- impact: Audit log writes can silently fail with no metric/alert. On serverless, the function can be torn down before the promise resolves, dropping audit entries entirely (Vercel/Lambda kills background tasks after response). Audit log is a compliance/forensics tool — silent loss is bad.
- proposed fix: Either await the write (small latency hit, but reliable), or use `waitUntil(promise)` from next/server on the route's response. Send failures to Sentry, not just console.

### [P2] logActivity fire-and-forget; not in tx with mutation; failures only console.error
- id: `activity-logger-non-transactional` · category: observability
- location: `apps/web/src/lib/activity-logger.ts:18`
- evidence:
```
prisma.activityLog.create({ data: { ... } }).catch((e) => console.error('Activity log failed:', e.message));
```
- impact: If audit insert fails the mutation still succeeds and the audit trail is silently lost.
- proposed fix: For high-value mutations include the log in a $transaction with the write; wire console.error to Sentry.

### [P2] logActivity is fire-and-forget — failures are logged to console but the route returns 200 with no record
- id: `activity-logger-no-await` · category: observability
- location: `apps/web/src/lib/activity-logger.ts:18-32`
- evidence:
```
export function logActivity(params: LogActivityParams) {
  prisma.activityLog.create({ ... }).catch((e) => console.error('Activity log failed:', e.message));
}
```
- impact: For settings/holiday/admin/service-request mutations, the API responds success even when the audit row never wrote. Compliance gap. Also, on a serverless host, the request handler may exit before the Promise resolves, losing the write entirely (no waitUntil).
- proposed fix: Make logActivity async and await it inside handlers (or push to a queue). At minimum, on Vercel/edge use ctx.waitUntil(prisma.activityLog.create(...).catch(...)). Bubble failure to Sentry, not console.

### [P2] logActivity is fire-and-forget outside the transaction → can silently lose audit records
- id: `activity-log-fire-and-forget` · category: observability
- location: `apps/web/src/lib/activity-logger.ts:18-33, called from service-requests/route.ts:46`
- evidence:
```
export function logActivity(params: LogActivityParams) {
  prisma.activityLog.create({ data: { ... } }).catch((e) => console.error('Activity log failed:', e.message));
}
```
- impact: For unauthenticated mutations the audit trail is THE only record of who did what. Calling outside the transaction means the business write commits even if activity-log write fails (orphaned mutation), and there's no retry — only a console line. requestId/ipAddress/userAgent not captured on service-requests (only on estimate POST).
- proposed fix: Insert the log inside the same prisma.$transaction. Always capture ip/userAgent/x-request-id from req.headers in service-requests route too.