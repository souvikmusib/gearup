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

Target file: `apps/web/src/lib/auth/auth-context.tsx`

## Findings (1)

### [P2] AuthProvider trusts localStorage-cached user for first render
- id: `auth-context-cached-user-stale-permissions` · category: auth
- location: `apps/web/src/lib/auth/auth-context.tsx:66-72,90`
- evidence:
```
const cachedUser = readCachedUser();
if (cachedUser) {
  setUser(cachedUser);
  setLoading(false);
  void fetchMe({ keepCurrent: true });
  return;
}
...
const hasPermission = (p: string) => !!user?.permissions.includes(p);
```
- impact: After a permission downgrade, the user keeps elevated UI access until the background /me call returns — typically 100-500ms but visible. More importantly, an attacker who can write to localStorage can inject permissions and unlock admin UI (server checks still gate API calls, so it's UI-only — but it's a confusing audit signal).
- proposed fix: Don't render permission-gated UI from cached user — show a skeleton until /me resolves. Or stamp cached payload with a hash signed by the token and validate before trusting.