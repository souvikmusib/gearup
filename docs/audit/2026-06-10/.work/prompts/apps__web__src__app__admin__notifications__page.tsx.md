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

Target file: `apps/web/src/app/admin/notifications/page.tsx`

## Findings to fix in this file (2)

### 1. [P1] Notifications and templates pages set state from `res.data` but the API returns `{ data, meta }` for notifications — list silently shows nothing/wrong shape
- _id_: `notifications-ui-broken-list` · _category_: ux
- _location_: `apps/web/src/app/admin/notifications/page.tsx:8`
- _evidence_:
```
promise.then((r) => { if (r.success) setData(r.data ?? []); setLoading(false); });
```
- _impact_: api client likely returns `{ success, data, meta }` mirroring the JSON envelope. The notifications route returns paginated rows in `data` (array, OK) — that one works. BUT the service-requests page handles both `res.data?.items ?? res.data ?? []` defensively while notifications doesn't, and the logs page also uses `r.data ?? []` directly. Need to verify api client shape — if it strips one level, notifications works; if not, the table is empty/broken. Either way the inconsistency (some pages handle `.items`, some don't) is a bug surface on go-live.
- _proposed fix_: Standardise: either always return `{items, ...meta}` from list APIs (then UI always reads `.items`), or never wrap. Fix all admin list pages to read the agreed shape. Notifications/logs pages have NO pagination UI either — only first 20/50 rows visible.

### 2. [P1] Notifications + Templates + Logs pages have no Pagination component, only first page is reachable
- _id_: `notifications-no-pagination-ui` · _category_: ux
- _location_: `apps/web/src/app/admin/notifications/page.tsx:6-17`
- _evidence_:
```
export default function NotificationsPage() {
  const [data, setData] = useState<any[]>([]); const [loading, setLoading] = useState(true);
  useEffect(() => { ... api.getSWR<any>('/admin/notifications') ... }, []);
  ...
  return (<div><PageHeader title="Notifications" /><DataTable ... data={data} keyField="id" /></div>);
}
```
- _impact_: After ~20 (notifications) or ~50 (logs) records, the rest is unreachable. There is also no channel/status filter UI even though the API supports it. Same for /admin/logs and /admin/notifications/templates.
- _proposed fix_: Reuse <Pagination/> like service-requests page; add filter dropdowns wired to query params. Templates is small so pagination optional but add search.