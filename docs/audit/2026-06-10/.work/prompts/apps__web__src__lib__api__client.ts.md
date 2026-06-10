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

Target file: `apps/web/src/lib/api/client.ts`

## Findings to fix in this file (2)

### 1. [P0 · BLOCKER] JWT stored in localStorage and sent as Bearer header — exfiltratable by any XSS
- _id_: `jwt-in-localstorage-xss-exfil` · _category_: auth
- _location_: `apps/web/src/lib/api/client.ts:34, apps/web/src/lib/auth/auth-context.tsx:36-86`
- _evidence_:
```
const token = typeof window !== 'undefined' ? localStorage.getItem('gearup_token') : null;
...
...(token ? { Authorization: `Bearer ${token}` } : {}),
// auth-context
localStorage.setItem('gearup_token', token);
```
- _impact_: Any reflected/stored XSS anywhere in the admin app (recharts tooltips, log entityType render, customer name render etc.) can read the JWT and impersonate the admin from outside the browser. httpOnly cookies are unreachable from JS; localStorage isn't. This negates the cookie/sameSite protections the middleware presumably relies on.
- _proposed fix_: Move auth token to an httpOnly + Secure + SameSite=Lax cookie set by the login endpoint; have the API read it from cookie instead of Authorization header for the browser surface. Keep Bearer only for non-browser clients. Delete the gearup_token localStorage read on the client.
- _verifier said_: real=True, Confirmed: client.ts:34 reads `gearup_token` from localStorage and attaches it as `Authorization: Bearer <token>` (line 51), and auth-context.tsx:80 writes the token to localStorage on login. Any XSS in the admin app can read the token via `localStorage.getItem('gearup_token')` and exfiltrate it; there is no httpOnly cookie protection. I'm downgrading from P0 to P1 because exploitation requires an actual XSS vector to exist (not independently verified here) and admin-only surface limits blast radius, but the architecture is genuinely vulnerable and the proposed httpOnly cookie fix is correct.

### 2. [P1] api/client.ts does window.location.href = '/admin/login' inside a GET fetch — public-page calls hijack navigation
- _id_: `client-cache-redirect-side-effect` · _category_: ux
- _location_: `apps/web/src/lib/api/client.ts:55-60, 128-133`
- _evidence_:
```
if (res.status === 401 && typeof window !== 'undefined') { ... window.location.href = '/admin/login'; return { success: false, ... }; }
```
- _impact_: A public booking page that calls a misconfigured/protected endpoint receives 401 and is forcibly redirected to admin login. Same for any cross-tenant URL probe. Also fights the user's back button.
- _proposed fix_: Only redirect when the calling page is under /admin; otherwise return the 401 and let the caller render an inline error.