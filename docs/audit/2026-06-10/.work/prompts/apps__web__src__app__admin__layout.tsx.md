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

Target file: `apps/web/src/app/admin/layout.tsx`

## Findings to fix in this file (2)

### 1. [P1] Admin pages have no server-side auth — entire perimeter is client `useEffect` redirect
- _id_: `admin-no-server-guard` · _category_: auth
- _location_: `apps/web/src/app/admin/layout.tsx:70-124`
- _evidence_:
```
export default function AdminLayout({ children }) {
  const { user, loading } = useAuth();
  ...
  useEffect(() => {
    if (!loading && !user && !isLoginPage) router.replace('/admin/login');
  }, [loading, user, isLoginPage, router]);
  ...
  if (!user) return null;
```
- _impact_: Unauthenticated users get the admin HTML/JS bundle and the layout renders briefly before the redirect. All real protection lives in `middleware.ts` + per-route API checks. If middleware misses a path or matcher regresses, the UI itself enforces nothing. Also leaks the entire admin route map to bots.
- _proposed fix_: Convert `admin/layout.tsx` (or a parent server layout) to a server component that calls `requireUser()` and `redirect('/admin/login')` server-side before any client component renders. Keep the client-side `useAuth` only for live updates.

### 2. [P1] AdminLayout sequentially prefetches 33 admin endpoints on every mount
- _id_: `prefetch-storm-on-every-admin-nav` · _category_: performance
- _location_: `apps/web/src/app/admin/layout.tsx:9-44, 81-120`
- _evidence_:
```
const PREFETCH_ENDPOINTS = [ '/admin/reports?type=dashboard', '/admin/logs?pageSize=8', /* 31 more */ ];
...
for (const endpoint of PREFETCH_ENDPOINTS) {
  if (cancelled || document.hidden) return;
  await api.prefetch(endpoint);
  await new Promise<void>((resolve) => { timers.push(window.setTimeout(resolve, 900)); });
}
```
- _impact_: Every admin login (and every full-page reload of any /admin/* route) triggers ~33 API calls 900ms apart over ~30s, including heavy ones (`/admin/appointments?pageSize=200`, `/admin/inventory/items?page=1`, six `/admin/reports?type=*` queries). With 10 concurrent admins on day 1 that's hundreds of unnecessary DB hits per minute, plus it warms a per-tab cache that already has a 120s TTL so users will refetch a lot of it anyway. Also wastes mobile bandwidth.
- _proposed fix_: Drop the prefetch loop. Either (a) rely on Next.js route prefetch + the existing 2-minute `getSWR` cache, or (b) prefetch only the 3-4 most-likely-next routes based on `pathname`. If you keep it, gate behind a feature flag and only run on `/admin/dashboard` mount (not every admin page).