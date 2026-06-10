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

Target file: `apps/web/src/lib/sentry/`

## Findings (1)

### [P2] Sentry directory is empty .gitkeep — no error reporting in production
- id: `sentry-not-initialized` · category: observability
- location: `apps/web/src/lib/sentry/`
- evidence:
```
(directory is empty / .gitkeep only; handleApiError ends with `console.error('Unhandled API error:', error);` and returns generic 500)
```
- impact: Any uncaught exception in inventory flows (and the whole app) is visible only in server logs. No alerting, no breadcrumbs for the go-live morning.
- proposed fix: Initialize Sentry (sentry.client.config.ts, sentry.server.config.ts, sentry.edge.config.ts) per @sentry/nextjs, and call Sentry.captureException in handleApiError's INTERNAL_ERROR branch.