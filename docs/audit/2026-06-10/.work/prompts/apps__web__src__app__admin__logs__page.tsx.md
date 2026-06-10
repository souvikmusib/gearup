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

Target file: `apps/web/src/app/admin/logs/page.tsx`

## Findings to fix in this file (1)

### 1. [P1] Logs page is just a static table with no pagination, no filters, no time-range
- _id_: `logs-no-pagination-ui-no-filter-ui` · _category_: ux
- _location_: `apps/web/src/app/admin/logs/page.tsx:1-20`
- _evidence_:
```
export default function ActivityLogsPage() {
  const [data, setData] = useState<any[]>([]); const [loading, setLoading] = useState(true);
  useEffect(() => { ... api.getSWR<any>('/admin/logs') ... }, []);
  ...
  return (<div><PageHeader title="Activity Logs" /><DataTable columns={[...]} data={data} keyField="id" /></div>);
}
```
- _impact_: After day one of usage, only the last 50 events are visible. Cannot search for 'who edited invoice X', cannot filter to ADMIN actor only. Defeats the purpose of an audit log for go-live compliance.
- _proposed fix_: Add Pagination + filters (entityType select, actorType select, action search with min 2 chars, date range). Display previousValueJson/newValueJson on row expand. Add CSV export route.