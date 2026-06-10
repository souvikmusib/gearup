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

Target file: `apps/web/src/app/api/public/*`

## Findings (1)

### [P2] Public API routes don't opt out of caching; risk of stale/leaked responses
- id: `public-routes-cached-statically` · category: config
- location: `apps/web/src/app/api/public/*`
- evidence:
```
grep -rn 'noStore|dynamic\s*=' apps/web/src/app/api/public/ → no matches
```
- impact: App Router may statically optimize GET routes (customer-lookup, available-slots, estimate GET) and cache responses. Cached PII leak: a slot-availability or estimate response for one customer could be served to another behind a CDN. Less critical for POSTs but still better to be explicit.
- proposed fix: Add export const dynamic = 'force-dynamic'; export const revalidate = 0; to every file under app/api/public, or call noStore() at top of handler.