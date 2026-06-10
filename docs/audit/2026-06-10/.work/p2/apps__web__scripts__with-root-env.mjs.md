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

Target file: `apps/web/scripts/with-root-env.mjs`

## Findings (1)

### [P2] scripts/with-root-env.mjs silently continues without env file — masks misconfigured CI
- id: `with-root-env-no-validation` · category: config
- location: `apps/web/scripts/with-root-env.mjs:12-15`
- evidence:
```
if (existsSync(rootEnvPath)) { dotenv.config({ path: rootEnvPath, override: false }); }
// no else branch — no warning if file missing
```
- impact: On Vercel (where the file doesn't exist), behavior relies on Vercel env injection — fine. But in a misconfigured CI runner with neither file nor injected env, the build silently runs against undefined DATABASE_URL and only fails deep in Prisma generate.
- proposed fix: After loading, validate required envs (DATABASE_URL, JWT_SECRET in prod) using a small zod schema; fail fast with a clear message.