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

Target file: `apps/web/src/lib/sentry/`

## Findings to fix in this file (4)

### 1. [P1] Sentry directory is empty — no error reporting
- _id_: `sentry-empty` · _category_: observability
- _location_: `apps/web/src/lib/sentry/`
- _evidence_:
```
ls apps/web/src/lib/sentry/ -> (empty directory; .gitkeep)
```
- _impact_: All 500s and unhandled errors disappear into stdout. handleApiError() ends with `console.error('Unhandled API error:', error)` — no aggregation, no alerts. Day 1 of production you will not know what's breaking.
- _proposed fix_: Wire @sentry/nextjs (sentry.client.config + sentry.server.config + sentry.edge.config). Capture from handleApiError when error is NOT an AppError. Add release/environment tags.

### 2. [P1] Sentry instrumentation directory is empty — no error reporting on go-live
- _id_: `sentry-not-initialized` · _category_: observability
- _location_: `apps/web/src/lib/sentry/`
- _evidence_:
```
(directory contains only .gitkeep per audit brief)
```
- _impact_: Day-one prod errors visible only in server logs. handleApiError swallows non-AppError to console.error then 500 — no aggregation, no alert.
- _proposed fix_: Add sentry.client.config.ts / sentry.server.config.ts using @sentry/nextjs and call Sentry.captureException in handleApiError's unhandled branch. At minimum, ship a non-Sentry error sink (Pino + Logflare/Datadog).

### 3. [P1] Sentry directory is empty — unhandled errors only go to console.error
- _id_: `sentry-not-initialized` · _category_: observability
- _location_: `apps/web/src/lib/sentry/`
- _evidence_:
```
ls apps/web/src/lib/sentry/ -> (empty)
lib/errors.ts:91 console.error('Unhandled API error:', error);
```
- _impact_: For tomorrow's go-live, every 500 (and there will be some, given missing transactions above) is invisible — no alerting, no stack trace, no user repro. Activity logger is fire-and-forget too.
- _proposed fix_: Install @sentry/nextjs, init server + edge configs, call Sentry.captureException(error) inside handleApiError before the 500 response. Even a free tier is sufficient for day 1.

### 4. [P1] lib/sentry is empty (.gitkeep only) — no error reporting in production
- _id_: `sentry-empty` · _category_: observability
- _location_: `apps/web/src/lib/sentry/`
- _evidence_:
```
ls apps/web/src/lib/sentry/ → (only sentry directory exists, no source files); handleApiError logs unhandled errors to console only (errors.ts:91)
```
- _impact_: 500s, unhandled rejections, Prisma errors, and security signals (rate-limit breaches, repeated NotFound on track) are not captured. You will go live blind. console.error in serverless = best-effort log search only.
- _proposed fix_: Wire @sentry/nextjs with instrumentation.ts; add Sentry.captureException in handleApiError's default branch and around logActivity catch; instrument middleware to log 429s.