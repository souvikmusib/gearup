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

Target file: `apps/web/src/lib/auth.ts`

## Findings (3)

### [P2] No CSRF protection — only mitigated by bearer-header convention
- id: `no-csrf-on-changepassword-and-mutations` · category: security
- location: `apps/web/src/lib/auth.ts:7-12`
- evidence:
```
export function getAuthToken(): string {
  const h = headers();
  const auth = h.get('authorization');
  if (!auth?.startsWith('Bearer ')) throw new UnauthorizedError('Missing token');
  return auth.slice(7);
}
```
- impact: Currently safe: cookies aren't auto-attached, so a cross-site form POST has no auth. But the CORS wildcard plus future move to cookies (recommended above) would open CSRF. Tightly coupled to the localStorage decision — choose one model coherently.
- proposed fix: Pick a model: (a) bearer header + strict CORS allowlist (current direction), OR (b) httpOnly cookie + same-site=strict + CSRF double-submit token. Document the decision.

### [P2] verifyAuth reads Authorization header only — middleware must inject from cookie
- id: `auth-cookie-vs-header` · category: auth
- location: `apps/web/src/lib/auth.ts:7`
- evidence:
```
const auth = h.get('authorization'); if (!auth?.startsWith('Bearer ')) throw new UnauthorizedError('Missing token');
```
- impact: If middleware forwards JWT only via cookie without injecting Authorization header, every admin API would 401.
- proposed fix: Confirm middleware sets Authorization from cookie on every admin/*, or extend getAuthToken to fall back to cookies().get('token').

### [P2] requirePermission relies on Authorization Bearer header only — no httpOnly cookie path checked here
- id: `jwt-cookie-flags-not-set-here` · category: auth
- location: `apps/web/src/lib/auth.ts:7-12`
- evidence:
```
export function getAuthToken(): string {
  const h = headers();
  const auth = h.get('authorization');
  if (!auth?.startsWith('Bearer ')) throw new UnauthorizedError('Missing token');
  return auth.slice(7);
}
```
- impact: Architecture hint says 'JWT in cookie/header' but this helper reads only the Authorization header. If middleware also reads a cookie, the token may live in localStorage (XSS-exfiltratable) instead of an httpOnly cookie. Confirm where the client stores it; for this module the API contract forces clients to send Bearer, which usually means localStorage.
- proposed fix: Audit middleware.ts and the api client. If tokens are in localStorage, migrate to httpOnly+Secure+SameSite=Lax cookie and update getAuthToken to read cookies() too. Out of scope here, but flagged.