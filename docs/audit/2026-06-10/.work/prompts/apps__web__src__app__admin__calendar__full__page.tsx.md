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

Target file: `apps/web/src/app/admin/calendar/full/page.tsx`

## Findings to fix in this file (1)

### 1. [P1] Pervasive `any` + unguarded property access on API responses
- _id_: `any-typing-runtime-throws` · _category_: type-safety
- _location_: `apps/web/src/app/admin/calendar/full/page.tsx:46-61, apps/web/src/app/admin/dashboard/page.tsx:34-73`
- _evidence_:
```
api.get<any>('/admin/workers/calendar').then((res) => {
  if (!res.success) return;
  const { workers: w, leaves, assignments } = res.data;
  setWorkers(w);
  ...
  leaves.forEach((l: any) => { ... });
  assignments.forEach((a: any) => { ... });
```
- _impact_: If `res.data` is `null`/undefined, or shape drifts (e.g. API returns `{ items: [] }` instead of `{ workers, leaves, assignments }`), this throws an unhandled TypeError inside a `.then` — the page never updates and there's no Sentry to catch it. Dashboard does the same on `data.todayRevenue.toLocaleString()` (kpi line 83) without nullish guard for `todayRevenue`.
- _proposed fix_: Define a typed response (`{ workers: Worker[]; leaves: Leave[]; assignments: Assignment[] }`) and validate with Zod or at minimum `const data = res.data ?? {}; const workers = data.workers ?? []; ...`. Replace `any[]` state with concrete types from `@gearup/types`.