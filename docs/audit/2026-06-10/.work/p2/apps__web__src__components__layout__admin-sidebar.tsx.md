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

Target file: `apps/web/src/components/layout/admin-sidebar.tsx`

## Findings (1)

### [P2] Sidebar visibility = `hasPermission(item.permission)` which trusts client `MeResponse.permissions`
- id: `permissions-array-trusted-from-client` · category: auth
- location: `apps/web/src/components/layout/admin-sidebar.tsx:93, apps/web/src/lib/auth/auth-context.tsx:90`
- evidence:
```
{NAV.filter((item) => hasPermission(item.permission)).map((item) => {
...
const hasPermission = (p: string) => !!user?.permissions.includes(p);
```
- impact: The sidebar is a UX hint, but if `localStorage.gearup_user` is mutated by a malicious browser extension or XSS, an attacker can unlock nav items they shouldn't see. (Real authz must live on the API.) Worth flagging because the cached user is written from `MeResponse` and never re-validated until next fetchMe — anyone with a stale-but-valid token can keep seeing wider nav after a permission revocation.
- proposed fix: Re-run `fetchMe` on tab focus (`visibilitychange`) and after any settings change. Never grant any client-side action based purely on cached permissions; the API must re-check.