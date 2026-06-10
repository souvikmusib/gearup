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

Target file: `apps/web/src/lib/sentry/.gitkeep`

## Findings to fix in this file (3)

### 1. [P1] Sentry never initialized — production errors invisible
- _id_: `sentry-not-initialized` · _category_: observability
- _location_: `apps/web/src/lib/sentry/.gitkeep`
- _evidence_:
```
$ ls apps/web/src/lib/sentry/
.gitkeep   (directory contains only an empty marker file)
handleApiError uses console.error('Unhandled API error:', error);
```
- _impact_: Any unhandled 500 in invoice/payment/finalize/PDF flows is logged to stdout only. On Vercel, those logs are ephemeral, unsearchable past 1 hour on free tier, and there is no alerting. For a billing module going live tomorrow, you will not see real customer-blocking errors until customers complain.
- _proposed fix_: Install `@sentry/nextjs`, run `npx @sentry/wizard@latest -i nextjs`, set SENTRY_DSN env var, and add `Sentry.captureException(error)` inside the `console.error` branch of `handleApiError` for non-AppError/non-Zod/non-Prisma cases.

### 2. [P1] Sentry directory is empty placeholder — no error monitoring on production
- _id_: `sentry-not-wired` · _category_: observability
- _location_: `apps/web/src/lib/sentry/.gitkeep`
- _evidence_:
```
(directory contains only .gitkeep; lib/errors.ts logs to console.error and lib/activity-logger.ts logs to console.error)
```
- _impact_: On go-live morning, any 500 surfaces only as a generic 'Internal server error' to the user and a console line on the server. No alerting, no stack traces collected, no way to triage incidents quickly.
- _proposed fix_: Initialize @sentry/nextjs (sentry.client.config.ts, sentry.server.config.ts, sentry.edge.config.ts). Wire SENTRY_DSN env. In handleApiError default branch, captureException(error) before the console.error. Tag spans with userId from JWT.

### 3. [P1] Sentry directory is empty `.gitkeep` — no error reporting on admin surface
- _id_: `sentry-not-initialized` · _category_: observability
- _location_: `apps/web/src/lib/sentry/.gitkeep`
- _evidence_:
```
$ ls apps/web/src/lib/sentry/
.gitkeep
```
- _impact_: Every silent runtime throw on the dashboard/calendar (the `any` accesses, the recharts mount errors, the user-shape mismatches) will go unreported in production. Go-live with zero observability on the most-trafficked admin pages.
- _proposed fix_: Initialize `@sentry/nextjs` with client + server configs, wrap the admin layout in an ErrorBoundary that reports to Sentry, and add `Sentry.captureException` in the api client's `.catch` branches (currently swallowed to `NETWORK_ERROR`).