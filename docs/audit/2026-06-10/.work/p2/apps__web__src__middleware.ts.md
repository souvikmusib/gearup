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

Target file: `apps/web/src/middleware.ts`

## Findings (2)

### [P2] Lockout is per-account but rate limit is per-IP only — distributed brute force trivial
- id: `login-no-account-id-rate-limit` · category: security
- location: `apps/web/src/middleware.ts:35-40 + login route lockout at constants MAX_LOGIN_ATTEMPTS=5`
- evidence:
```
if (pathname === '/api/admin/auth/login' && request.method === 'POST') {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
  if (isRateLimited(ip, 10)) { return 429 }
}
```
- impact: Combined with the in-memory limiter and XFF spoof, an attacker can lock out a target admin (5 attempts → 30min lockout) from many IPs as a denial-of-service. There is no captcha or progressive delay; lockout state has no notification to the user.
- proposed fix: Add per-adminUserId attempt counter with progressive delay (not just hard lockout). Notify the admin (email) on lock. Consider captcha after 3 failures.

### [P2] Estimate POST/GET not covered by middleware rate limiter (POST is, but GET isn't, and the action is in URL params)
- id: `estimate-no-rate-limit` · category: security
- location: `apps/web/src/middleware.ts:43-48 + apps/web/src/app/api/public/estimate/[token]/route.ts`
- evidence:
```
if (pathname.startsWith('/api/public/') && request.method === 'POST') { ...rate limit... }
```
- impact: GET /public/estimate/[token] has no limit, so an attacker can brute-force cuids freely (combined with finding 'estimate-token-is-jobcard-pk', this is the live exploitation path). cuid space is large (~10^21) but timing analysis or partial leaks reduce it.
- proposed fix: Apply the rate limiter to all methods on public routes. Even better: see fix in 'estimate-token-is-jobcard-pk'.