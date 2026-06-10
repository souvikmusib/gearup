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

Target file: `turbo.json`

## Findings (1)

### [P2] turbo.json globalEnv missing NEXT_PUBLIC_SENTRY_DSN and SUPABASE refs — cache hits across env changes
- id: `turbo-missing-public-env` · category: config
- location: `turbo.json:1-31`
- evidence:
```
"globalEnv": ["DATABASE_URL", "DIRECT_URL", "JWT_SECRET", "NODE_ENV"]  // missing NEXT_PUBLIC_SENTRY_DSN, NEXT_PUBLIC_*, any feature flags
```
- impact: Turbo build cache will not invalidate when DSN or other env values change, producing stale `next build` artifacts with wrong baked-in NEXT_PUBLIC_ values.
- proposed fix: Add NEXT_PUBLIC_SENTRY_DSN and any NEXT_PUBLIC_* envs to globalEnv; consider envMode 'strict'.