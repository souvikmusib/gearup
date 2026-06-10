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

Target file: `apps/web/src/lib/api/client.ts`

## Findings (2)

### [P2] Bearer 401 clears token but not `gearup_user`; logout clears token but not in-flight prefetches
- id: `user-cache-not-cleared-on-401` · category: auth
- location: `apps/web/src/lib/api/client.ts:55-61, 128-134; apps/web/src/lib/auth/auth-context.tsx:83-89`
- evidence:
```
if (res.status === 401 && typeof window !== 'undefined') {
  localStorage.removeItem('gearup_token');
  localStorage.removeItem('gearup_demo');
  clearGetCache();
  window.location.href = '/admin/login';
}
// logout()
localStorage.removeItem('gearup_token');
localStorage.removeItem('gearup_demo');
writeCachedUser(null);
```
- impact: On 401 the client removes `gearup_token` but leaves `gearup_user` in localStorage. After redirect to /login, if anything reads the cached user before fetchMe, stale identity (incl. roles/permissions) is shown. Also: logout doesn't cancel the still-running 33-endpoint prefetch loop, which now spam-401s the server until the layout unmounts.
- proposed fix: In the 401 branch and in `logout()`, also call `writeCachedUser(null)`. Hoist a shared `signOut()` helper. Wire an `AbortController` into `AdminLayout`'s prefetch loop and abort on logout/user change.

### [P2] Network errors swallowed to a generic shape, never surfaced to the user
- id: `silent-network-errors` · category: error-handling
- location: `apps/web/src/lib/api/client.ts:73, 84-86, 142-144`
- evidence:
```
const pending = run().catch(() => ({ success: false, error: { code: 'NETWORK_ERROR', message: 'Unable to reach server' } } as ApiResponse<T>));
...
} catch {
  return { success: false, error: { code: 'NETWORK_ERROR', message: 'Unable to reach server' } };
}
```
- impact: Dashboard/calendar pages check `if (res.success)` and silently do nothing on failure — the loader state often resolves to empty arrays with no toast/banner. Users will think "no appointments today" when really the API is down. No Sentry capture either.
- proposed fix: Add a global toast on `success === false` from a mutation, and an inline error banner on GET failures in dashboard/calendar (e.g. "Couldn't load this — retry"). Log the underlying error to Sentry instead of dropping it.