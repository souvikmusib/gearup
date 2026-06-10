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

Target file: `apps/web/src/app/api/admin/auth/login/route.ts`

## Findings (2)

### [P2] Login route logs stack trace on every failed login
- id: `login-leaks-stack-in-server-log` · category: observability
- location: `apps/web/src/app/api/admin/auth/login/route.ts:37-39`
- evidence:
```
} catch (e: any) {
  console.error('Login error:', e?.message, e?.stack);
  return handleApiError(e);
}
```
- impact: Every invalid-credentials attempt logs a full stack — log noise, makes real errors invisible, and on shared logging infra leaks code paths. `e: any` also defeats the AppError typing.
- proposed fix: Only console.error for unexpected errors (not instanceof AppError). Drop the `any` cast; let handleApiError do its job.

### [P2] Token permissions snapshot — admin role/permission changes don't take effect until re-login
- id: `permissions-not-rechecked-on-me` · category: auth
- location: `apps/web/src/app/api/admin/auth/login/route.ts:31-33`
- evidence:
```
const roleKeys = user.roles.map((r: any) => r.role.key as RoleKey);
const permissions = [...new Set(roleKeys.flatMap((k: RoleKey) => ROLE_PERMISSIONS[k] ?? []))];
const token = jwt.sign({ sub: user.id, adminUserId, roles: roleKeys, permissions }, ...);
```
- impact: Permissions are baked into the JWT for 24h. requirePermission() reads from the token, not the DB, so revoking a role or setting status=INACTIVE does NOT log the user out — they keep all their permissions for up to 24h. Even /me re-resolves from DB but middleware/auth.ts does not. No revocation list.
- proposed fix: Either (a) shorten token TTL to ~15min with a refresh token, or (b) have verifyAuth() check DB status on each request (cache 30s), or (c) maintain a `tokenVersion` per user — increment on role change/disable, compare in verifyAuth.